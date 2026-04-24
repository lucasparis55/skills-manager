import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { getAppDataDir } from '../utils/paths';
import type { Project } from '../types/domain';

/**
 * Project Service - Manages projects and detects IDE configurations
 */
export class ProjectService {
  private projects: Map<string, Project> = new Map();
  private projectPathIndex: Map<string, string> = new Map();
  private projectsPath: string;
  private backupPath: string;

  constructor(appDataDir?: string) {
    const dir = appDataDir || getAppDataDir();
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.projectsPath = path.join(dir, 'projects.json');
    this.backupPath = path.join(dir, 'projects.json.bak');
    this.load();
  }

  /**
   * List all registered projects
   */
  list(): Project[] {
    return Array.from(this.projects.values());
  }

  /**
   * Add a project by path
   */
  add(projectPath: string): Project {
    const absolutePath = this.validateProjectPath(projectPath);
    const canonicalPath = this.toCanonicalPath(absolutePath);
    const existingId = this.projectPathIndex.get(canonicalPath);
    if (existingId) {
      return this.projects.get(existingId)!;
    }

    const baseId = path.basename(absolutePath);
    const id = this.resolveUniqueId(baseId, canonicalPath);
    const project = this.buildProject(absolutePath, id);

    this.projects.set(project.id, project);
    this.projectPathIndex.set(canonicalPath, project.id);
    this.save();
    return project;
  }

  /**
   * Remove a project
   */
  remove(id: string): void {
    const project = this.projects.get(id);
    if (!project) {
      return;
    }

    this.projects.delete(id);
    this.projectPathIndex.delete(this.toCanonicalPath(project.path));
    this.save();
  }

  /**
   * Scan a directory for projects
   */
  scan(rootPath?: string, maxDepth?: number): Project[] {
    const scanPath = rootPath || process.env.USERPROFILE || process.env.HOME || '.';
    const foundProjects: Project[] = [];
    const clampedDepth = Math.min(5, Math.max(1, maxDepth ?? 2));

    this.scanDirectory(scanPath, foundProjects, clampedDepth);

    let hasChanges = false;
    for (const found of foundProjects) {
      const canonicalPath = this.toCanonicalPath(found.path);
      const existingId = this.projectPathIndex.get(canonicalPath);

      if (existingId) {
        const existing = this.projects.get(existingId);
        if (existing) {
          const updated: Project = {
            ...existing,
            detectedIDEs: found.detectedIDEs,
            lastScanned: new Date().toISOString(),
            metadata: {
              ...existing.metadata,
              hasGit: found.metadata?.hasGit === true,
            },
          };

          if (JSON.stringify(existing) !== JSON.stringify(updated)) {
            this.projects.set(existingId, updated);
            hasChanges = true;
          }
        }
        continue;
      }

      const id = this.resolveUniqueId(found.id, canonicalPath);
      const projectToSave: Project = { ...found, id };

      this.projects.set(projectToSave.id, projectToSave);
      this.projectPathIndex.set(canonicalPath, projectToSave.id);
      hasChanges = true;
    }

    if (hasChanges) {
      this.save();
    }

    return foundProjects;
  }

  /**
   * Detect IDEs in a project directory
   */
  detectIDEs(projectPath: string): string[] {
    const ides: string[] = [];

    const checks = [
      { dir: '.claude', ide: 'claude-code' },
      { dir: '.cursor', ide: 'cursor' },
      { dir: '.opencode', ide: 'opencode' },
      { dir: '.agents', ide: 'codex-cli' },
      { dir: '.agents', ide: 'codex-desktop' },
      { dir: '.codex', ide: 'codex-cli' },
      { dir: '.codex', ide: 'codex-desktop' },
      { dir: '.kimi', ide: 'kimi-cli' },
      { dir: '.agents', ide: 'kimi-cli' },
    ];

    for (const { dir, ide } of checks) {
      if (fs.existsSync(path.join(projectPath, dir))) {
        ides.push(ide);
      }
    }

    return [...new Set(ides)];
  }

  /**
   * Recursively scan directory for projects
   */
  private scanDirectory(dir: string, projects: Project[], maxDepth: number, currentDepth: number = 0): void {
    if (maxDepth < 1) {
      return;
    }
    if (currentDepth > maxDepth) {
      return;
    }

    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      // Check if this directory is a project
      const isProject = this.isProjectDirectory(dir);

      if (isProject) {
        const absolutePath = path.resolve(dir);
        const id = this.toLegacyScanId(absolutePath);

        projects.push(this.buildProject(absolutePath, id));

        // Don't scan deeper if this is a project
        return;
      }

      // Continue scanning subdirectories
      for (const entry of entries) {
        if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
          this.scanDirectory(path.join(dir, entry.name), projects, maxDepth, currentDepth + 1);
        }
      }
    } catch {
      // Ignore permission errors
    }
  }

  /**
   * Check if directory is a project (has .git or package.json, etc.)
   */
  private isProjectDirectory(dir: string): boolean {
    const indicators = ['.git', 'package.json', 'go.mod', 'Cargo.toml', 'pyproject.toml', 'pom.xml'];
    return indicators.some(indicator => fs.existsSync(path.join(dir, indicator)));
  }

  /**
   * Load projects from disk with backup recovery support
   */
  private load(): void {
    const loadedProjects = this.readProjectsFile();

    for (const candidate of loadedProjects) {
      const project = this.normalizeProject(candidate);
      if (!project) {
        continue;
      }

      const canonicalPath = this.toCanonicalPath(project.path);
      if (this.projectPathIndex.has(canonicalPath)) {
        continue;
      }

      const id = this.resolveUniqueId(project.id, canonicalPath);
      const stored: Project = id === project.id ? project : { ...project, id };

      this.projects.set(stored.id, stored);
      this.projectPathIndex.set(canonicalPath, stored.id);
    }
  }

  /**
   * Read project list from primary file, with .bak fallback on corruption
   */
  private readProjectsFile(): unknown[] {
    if (!fs.existsSync(this.projectsPath)) {
      this.writeProjectsToDisk([], true);
      return [];
    }

    try {
      const raw = fs.readFileSync(this.projectsPath, 'utf-8');
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        throw new Error('projects.json is not an array');
      }
      return parsed;
    } catch {
      const backup = this.readBackupProjects();
      if (backup) {
        this.writeProjectsToDisk(backup, true);
        return backup;
      }

      this.writeProjectsToDisk([], true);
      return [];
    }
  }

  /**
   * Read backup file if available and valid
   */
  private readBackupProjects(): unknown[] | null {
    if (!fs.existsSync(this.backupPath)) {
      return null;
    }

    try {
      const raw = fs.readFileSync(this.backupPath, 'utf-8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed;
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Normalize persisted payload into a safe Project object
   */
  private normalizeProject(input: unknown): Project | null {
    if (!input || typeof input !== 'object') {
      return null;
    }

    const raw = input as Record<string, unknown>;
    if (typeof raw.path !== 'string' || raw.path.trim().length === 0) {
      return null;
    }

    const absolutePath = path.resolve(raw.path);
    const now = new Date().toISOString();
    const defaultName = path.basename(absolutePath);

    const detectedIDEs = Array.isArray(raw.detectedIDEs)
      ? raw.detectedIDEs.filter((item): item is string => typeof item === 'string')
      : [];

    const metadata = raw.metadata && typeof raw.metadata === 'object'
      ? (raw.metadata as Record<string, unknown>)
      : {};

    return {
      id: typeof raw.id === 'string' && raw.id.trim().length > 0 ? raw.id : defaultName,
      name: typeof raw.name === 'string' && raw.name.trim().length > 0 ? raw.name : defaultName,
      path: absolutePath,
      detectedIDEs,
      addedAt: typeof raw.addedAt === 'string' ? raw.addedAt : now,
      lastScanned: typeof raw.lastScanned === 'string' ? raw.lastScanned : now,
      metadata,
    };
  }

  /**
   * Persist current in-memory projects to disk
   */
  private save(): void {
    this.writeProjectsToDisk(Array.from(this.projects.values()), false);
  }

  /**
   * Safely write projects file with temp file + backup replacement strategy
   */
  private writeProjectsToDisk(projects: unknown[], skipBackup: boolean): void {
    const tempPath = `${this.projectsPath}.tmp`;
    const payload = JSON.stringify(projects, null, 2);

    fs.writeFileSync(tempPath, payload, 'utf-8');

    try {
      if (fs.existsSync(this.projectsPath)) {
        if (!skipBackup) {
          fs.copyFileSync(this.projectsPath, this.backupPath);
        }
        fs.rmSync(this.projectsPath, { force: true });
      }

      fs.renameSync(tempPath, this.projectsPath);
    } catch (error) {
      if (fs.existsSync(tempPath)) {
        fs.rmSync(tempPath, { force: true });
      }
      throw error;
    }
  }

  /**
   * Validate project path and return absolute path
   */
  private validateProjectPath(projectPath: string): string {
    const absolutePath = path.resolve(projectPath);

    if (!fs.existsSync(absolutePath)) {
      throw new Error(`Directory not found: ${absolutePath}`);
    }

    const stat = fs.statSync(absolutePath);
    if (!stat.isDirectory()) {
      throw new Error(`Not a directory: ${absolutePath}`);
    }

    return absolutePath;
  }

  /**
   * Build a new project model for storage
   */
  private buildProject(projectPath: string, id: string): Project {
    const absolutePath = path.resolve(projectPath);
    const now = new Date().toISOString();

    return {
      id,
      name: path.basename(absolutePath),
      path: absolutePath,
      detectedIDEs: this.detectIDEs(absolutePath),
      addedAt: now,
      lastScanned: now,
      metadata: {
        hasGit: fs.existsSync(path.join(absolutePath, '.git')),
      },
    };
  }

  /**
   * Resolve collisions while preserving compatibility with existing IDs
   */
  private resolveUniqueId(baseId: string, canonicalPath: string): string {
    const existingPathId = this.projectPathIndex.get(canonicalPath);
    if (existingPathId) {
      return existingPathId;
    }

    if (!this.projects.has(baseId)) {
      return baseId;
    }

    const baseProject = this.projects.get(baseId);
    if (baseProject && this.toCanonicalPath(baseProject.path) === canonicalPath) {
      return baseId;
    }

    const suffix = this.getPathHash(canonicalPath);
    let candidate = `${baseId}-${suffix}`;
    let counter = 1;

    while (this.projects.has(candidate)) {
      const existing = this.projects.get(candidate);
      if (existing && this.toCanonicalPath(existing.path) === canonicalPath) {
        return candidate;
      }
      candidate = `${baseId}-${suffix}-${counter}`;
      counter += 1;
    }

    return candidate;
  }

  /**
   * Legacy scan ID format kept for compatibility
   */
  private toLegacyScanId(projectPath: string): string {
    return projectPath.replace(/[\/\\]/g, '-');
  }

  /**
   * Canonical key used for deduplication by path
   */
  private toCanonicalPath(inputPath: string): string {
    const normalized = path.normalize(path.resolve(inputPath));
    return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
  }

  /**
   * Deterministic short hash for collision suffixes
   */
  private getPathHash(canonicalPath: string): string {
    return crypto.createHash('sha1').update(canonicalPath).digest('hex').slice(0, 8);
  }
}
