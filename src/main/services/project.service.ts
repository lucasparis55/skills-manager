import fs from 'fs';
import path from 'path';
import type { Project } from '../types/domain';

/**
 * Project Service - Manages projects and detects IDE configurations
 */
export class ProjectService {
  private projects: Map<string, Project> = new Map();

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
    const absolutePath = path.resolve(projectPath);

    if (!fs.existsSync(absolutePath)) {
      throw new Error(`Directory not found: ${absolutePath}`);
    }

    const stat = fs.statSync(absolutePath);
    if (!stat.isDirectory()) {
      throw new Error(`Not a directory: ${absolutePath}`);
    }

    const id = path.basename(absolutePath);
    const detectedIDEs = this.detectIDEs(absolutePath);

    const project: Project = {
      id,
      name: id,
      path: absolutePath,
      detectedIDEs,
      addedAt: new Date().toISOString(),
      lastScanned: new Date().toISOString(),
      metadata: {
        hasGit: fs.existsSync(path.join(absolutePath, '.git')),
      },
    };

    this.projects.set(id, project);
    return project;
  }

  /**
   * Remove a project
   */
  remove(id: string): void {
    this.projects.delete(id);
  }

  /**
   * Scan a directory for projects
   */
  scan(rootPath?: string): Project[] {
    const scanPath = rootPath || process.env.USERPROFILE || process.env.HOME || '.';
    const projects: Project[] = [];

    this.scanDirectory(scanPath, projects, 2); // Max depth 2

    projects.forEach(p => {
      this.projects.set(p.id, p);
    });

    return projects;
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
    ];

    for (const { dir, ide } of checks) {
      if (fs.existsSync(path.join(projectPath, dir))) {
        ides.push(ide);
      }
    }

    return ides;
  }

  /**
   * Recursively scan directory for projects
   */
  private scanDirectory(dir: string, projects: Project[], maxDepth: number, currentDepth: number = 0): void {
    if (currentDepth > maxDepth) {
      return;
    }

    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      // Check if this directory is a project
      const isProject = this.isProjectDirectory(dir);

      if (isProject) {
        const id = path.basename(dir);
        const detectedIDEs = this.detectIDEs(dir);

        projects.push({
          id: `${dir.replace(/[\/\\]/g, '-')}`,
          name: id,
          path: dir,
          detectedIDEs,
          addedAt: new Date().toISOString(),
          lastScanned: new Date().toISOString(),
          metadata: {
            hasGit: fs.existsSync(path.join(dir, '.git')),
          },
        });

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
}
