import fs from 'fs';
import path from 'path';
import { getSkillsRoot } from '../utils/paths';
import type { Skill, CreateSkillInput, UpdateSkillInput } from '../types/domain';
import type { BinaryImportFileEntry, ImportFileEntry } from '../types/import';

export interface SkillFileEntry {
  path: string;
  name: string;
  isDirectory: boolean;
  size: number;
}

const SKILL_NAME_REGEX = /^[A-Za-z0-9._-]{1,64}$/;

export interface ImportFromBufferOptions {
  overwrite?: boolean;
}

type ImportableFileEntry = ImportFileEntry | BinaryImportFileEntry;

/**
 * Skill Service - Manages skills in the central repository
 */
export class SkillService {
  private readonly skillsRoot: string;

  constructor(skillsRoot?: string) {
    this.skillsRoot = path.resolve(skillsRoot || getSkillsRoot());
    this.ensureSkillsRoot();
  }

  /**
   * Ensure the skills root directory exists
   */
  private ensureSkillsRoot(): void {
    if (!fs.existsSync(this.skillsRoot)) {
      fs.mkdirSync(this.skillsRoot, { recursive: true });
    }
  }

  /**
   * Validate skill names against an allowlist and traversal constraints.
   */
  private validateSkillName(rawName: string): string {
    if (typeof rawName !== 'string') {
      throw new Error('Invalid skill name');
    }

    const name = rawName.trim();
    if (name !== rawName) {
      throw new Error(`Invalid skill name "${rawName}"`);
    }
    if (!SKILL_NAME_REGEX.test(name)) {
      throw new Error(`Invalid skill name "${rawName}"`);
    }

    if (name === '.' || name === '..') {
      throw new Error(`Invalid skill name "${rawName}"`);
    }

    if (name.includes('/') || name.includes('\\')) {
      throw new Error(`Invalid skill name "${rawName}"`);
    }

    return name;
  }

  /**
   * Checks if targetPath is inside or equal to parentPath.
   */
  private isWithinDirectory(targetPath: string, parentPath: string): boolean {
    const relative = path.relative(parentPath, targetPath);
    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
  }

  /**
   * Resolve a skill directory safely from its logical name.
   */
  private resolveSkillDirectory(rawName: string): { name: string; skillDir: string } {
    const name = this.validateSkillName(rawName);
    const skillDir = path.resolve(this.skillsRoot, name);

    if (!this.isWithinDirectory(skillDir, this.skillsRoot)) {
      throw new Error('Access denied: path traversal detected');
    }

    return { name, skillDir };
  }

  /**
   * Resolve a file path inside a skill directory with traversal checks.
   */
  private resolveSkillFilePath(skillDir: string, filePath: string): string {
    if (typeof filePath !== 'string') {
      throw new Error('Invalid file path');
    }

    const normalizedRelative = path.normalize(filePath).trim();
    if (!normalizedRelative || normalizedRelative === '.' || path.isAbsolute(normalizedRelative)) {
      throw new Error(`Invalid file path "${filePath}"`);
    }

    const fullPath = path.resolve(skillDir, normalizedRelative);
    if (!this.isWithinDirectory(fullPath, skillDir)) {
      throw new Error('Access denied: path traversal detected');
    }

    return fullPath;
  }

  /**
   * List all skills in the central repository
   */
  list(): Skill[] {
    this.ensureSkillsRoot();

    const skills: Skill[] = [];
    const entries = fs.readdirSync(this.skillsRoot, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory() && SKILL_NAME_REGEX.test(entry.name) && entry.name !== '.' && entry.name !== '..') {
        const skillPath = path.join(this.skillsRoot, entry.name);
        const skill = this.loadSkill(entry.name, skillPath);
        if (skill) {
          skills.push(skill);
        }
      }
    }

    return skills;
  }

  /**
   * Get a single skill by name
   */
  get(name: string): Skill | null {
    const { name: skillName, skillDir } = this.resolveSkillDirectory(name);
    if (!fs.existsSync(skillDir)) {
      return null;
    }
    return this.loadSkill(skillName, skillDir);
  }

  /**
   * Create a new skill
   */
  create(input: CreateSkillInput): Skill {
    const { name: skillName, skillDir } = this.resolveSkillDirectory(input.name);

    if (fs.existsSync(skillDir)) {
      throw new Error(`Skill "${skillName}" already exists`);
    }

    fs.mkdirSync(skillDir, { recursive: true });

    // Create SKILL.md with frontmatter
    const frontmatter = `---
name: ${skillName}
displayName: ${input.displayName}
description: ${input.description}
version: ${input.version || '1.0.0'}
targetIDEs: [${input.targetIDEs.join(', ')}]
tags: [${input.tags?.join(', ') || ''}]
---

# ${input.displayName}

`;

    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), frontmatter, 'utf-8');

    return this.loadSkill(skillName, skillDir)!;
  }

  /**
   * Update skill metadata
   */
  update(name: string, input: UpdateSkillInput): Skill {
    const { name: skillName, skillDir } = this.resolveSkillDirectory(name);
    const skillMdPath = path.join(skillDir, 'SKILL.md');

    if (!fs.existsSync(skillMdPath)) {
      throw new Error(`Skill "${skillName}" not found`);
    }

    const content = fs.readFileSync(skillMdPath, 'utf-8');

    // Parse and update frontmatter
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (frontmatterMatch) {
      let frontmatter = frontmatterMatch[1];

      if (input.displayName) {
        frontmatter = frontmatter.replace(/displayName:.*/, `displayName: ${input.displayName}`);
      }
      if (input.description) {
        frontmatter = frontmatter.replace(/description:.*/, `description: ${input.description}`);
      }
      if (input.version) {
        frontmatter = frontmatter.replace(/version:.*/, `version: ${input.version}`);
      }
      if (input.targetIDEs) {
        frontmatter = frontmatter.replace(/targetIDEs:.*/, `targetIDEs: [${input.targetIDEs.join(', ')}]`);
      }
      if (input.tags) {
        frontmatter = frontmatter.replace(/tags:.*/, `tags: [${input.tags.join(', ')}]`);
      }

      const newContent = content.replace(/^---\n[\s\S]*?\n---/, `---\n${frontmatter}\n---`);
      fs.writeFileSync(skillMdPath, newContent, 'utf-8');
    }

    return this.loadSkill(skillName, skillDir)!;
  }

  /**
   * Delete a skill
   */
  delete(name: string): void {
    const { name: skillName, skillDir } = this.resolveSkillDirectory(name);

    if (!fs.existsSync(skillDir)) {
      throw new Error(`Skill "${skillName}" not found`);
    }

    fs.rmSync(skillDir, { recursive: true, force: true });
  }

  /**
   * Load skill metadata from directory
   */
  private loadSkill(name: string, skillDir: string): Skill | null {
    const skillMdPath = path.join(skillDir, 'SKILL.md');

    if (!fs.existsSync(skillMdPath)) {
      return null;
    }

    const content = fs.readFileSync(skillMdPath, 'utf-8');
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);

    if (!frontmatterMatch) {
      return null;
    }

    const frontmatter = frontmatterMatch[1];

    const parseField = (field: string): string => {
      const match = frontmatter.match(new RegExp(`${field}:\\s*(.+)`));
      return match ? match[1].trim() : '';
    };

    const parseArray = (field: string): string[] => {
      const match = frontmatter.match(new RegExp(`${field}:\\s*\\[([^\\]]*)\\]`));
      if (!match) return [];
      return match[1].split(',').map(s => s.trim()).filter(Boolean);
    };

    const stat = fs.statSync(skillDir);

    return {
      id: name,
      name,
      displayName: parseField('displayName') || name,
      description: parseField('description'),
      version: parseField('version') || '1.0.0',
      format: 'folder',
      targetIDEs: parseArray('targetIDEs'),
      tags: parseArray('tags'),
      createdAt: stat.birthtime.toISOString(),
      updatedAt: stat.mtime.toISOString(),
      sourcePath: skillDir,
      metadata: {},
    };
  }

  /**
   * Scan and return all skills
   */
  scan(): Skill[] {
    return this.list();
  }

  /**
   * Get the absolute path to a skill directory
   */
  getSkillPath(name: string): string {
    const { name: skillName, skillDir } = this.resolveSkillDirectory(name);
    if (!fs.existsSync(skillDir)) {
      throw new Error(`Skill "${skillName}" not found`);
    }
    return skillDir;
  }

  /**
   * Get the full content of SKILL.md
   */
  getContent(name: string): string {
    const { name: skillName, skillDir } = this.resolveSkillDirectory(name);
    const skillMdPath = path.join(skillDir, 'SKILL.md');

    if (!fs.existsSync(skillMdPath)) {
      throw new Error(`Skill "${skillName}" not found`);
    }

    return fs.readFileSync(skillMdPath, 'utf-8');
  }

  /**
   * Save the full content of SKILL.md
   */
  saveContent(name: string, content: string): Skill {
    const { name: skillName, skillDir } = this.resolveSkillDirectory(name);
    const skillMdPath = path.join(skillDir, 'SKILL.md');

    if (!fs.existsSync(skillMdPath)) {
      throw new Error(`Skill "${skillName}" not found`);
    }

    fs.writeFileSync(skillMdPath, content, 'utf-8');
    return this.loadSkill(skillName, skillDir)!;
  }

  /**
   * List all files in a skill directory (recursive)
   */
  listFiles(name: string): SkillFileEntry[] {
    const { name: skillName, skillDir } = this.resolveSkillDirectory(name);

    if (!fs.existsSync(skillDir)) {
      throw new Error(`Skill "${skillName}" not found`);
    }

    const files: SkillFileEntry[] = [];
    this._listFilesRecursive(skillDir, skillDir, files);
    return files;
  }

  /**
   * Recursive helper for listFiles
   */
  private _listFilesRecursive(baseDir: string, currentDir: string, files: SkillFileEntry[]): void {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      const relativePath = path.relative(baseDir, fullPath);

      if (entry.isDirectory()) {
        files.push({
          path: relativePath,
          name: entry.name,
          isDirectory: true,
          size: 0,
        });
        this._listFilesRecursive(baseDir, fullPath, files);
      } else {
        const stat = fs.statSync(fullPath);
        files.push({
          path: relativePath,
          name: entry.name,
          isDirectory: false,
          size: stat.size,
        });
      }
    }
  }

  /**
   * Read a specific file within the skill directory
   */
  readFile(name: string, filePath: string): string {
    const { skillDir } = this.resolveSkillDirectory(name);
    const fullPath = this.resolveSkillFilePath(skillDir, filePath);

    if (!fs.existsSync(fullPath)) {
      throw new Error(`File "${filePath}" not found`);
    }

    if (fs.statSync(fullPath).isDirectory()) {
      throw new Error(`"${filePath}" is a directory, not a file`);
    }

    return fs.readFileSync(fullPath, 'utf-8');
  }

  /**
   * Write/create/update a file within the skill directory
   */
  writeFile(name: string, filePath: string, content: string): void {
    const { skillDir } = this.resolveSkillDirectory(name);
    const fullPath = this.resolveSkillFilePath(skillDir, filePath);

    // Create parent directories if needed
    const parentDir = path.dirname(fullPath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }

    fs.writeFileSync(fullPath, content, 'utf-8');
  }

  /**
   * Delete a file from the skill directory
   */
  deleteFile(name: string, filePath: string): void {
    const { skillDir } = this.resolveSkillDirectory(name);
    const fullPath = this.resolveSkillFilePath(skillDir, filePath);

    if (!fs.existsSync(fullPath)) {
      throw new Error(`File "${filePath}" not found`);
    }

    if (fs.statSync(fullPath).isDirectory()) {
      throw new Error(`Cannot delete directory "${filePath}" using this method`);
    }

    fs.unlinkSync(fullPath);
  }

  /**
   * Import a skill from a buffer of files (used by GitHub import).
   * Creates the skill directory and writes all files at once.
   * If a SKILL.md is not in the files list, one is generated from the metadata.
   */
  importFromBuffer(
    name: string,
    files: ImportFileEntry[],
    metadata?: Record<string, unknown>,
    options: ImportFromBufferOptions = {},
  ): Skill {
    return this.importFiles(name, files, metadata, options);
  }

  /**
   * Import a skill from raw archive files while preserving binary file contents.
   */
  importFromArchiveFiles(
    name: string,
    files: BinaryImportFileEntry[],
    metadata?: Record<string, unknown>,
    options: ImportFromBufferOptions = {},
  ): Skill {
    return this.importFiles(name, files, metadata, options);
  }

  private importFiles(
    name: string,
    files: ImportableFileEntry[],
    metadata?: Record<string, unknown>,
    options: ImportFromBufferOptions = {},
  ): Skill {
    const { name: skillName, skillDir } = this.resolveSkillDirectory(name);
    const overwrite = options.overwrite === true;

    if (fs.existsSync(skillDir)) {
      if (!overwrite) {
        throw new Error(`Skill "${skillName}" already exists`);
      }

      fs.rmSync(skillDir, { recursive: true, force: true });
    }

    fs.mkdirSync(skillDir, { recursive: true });

    const filesToWrite = [...files];
    const hasSkillMd = filesToWrite.some(f => f.path === 'SKILL.md' || f.path.endsWith('/SKILL.md'));

    // Generate SKILL.md if not provided
    if (!hasSkillMd && metadata) {
      const sourceRepo = (metadata.sourceRepo as string) || '';
      const sourceArchive = (metadata.sourceArchive as string) || '';
      const importedAt = (metadata.importedAt as string) || new Date().toISOString();
      const importSourceLine = sourceRepo
        ? `Imported from [${sourceRepo}](${sourceRepo}).`
        : sourceArchive
          ? `Imported from archive "${sourceArchive}".`
          : 'Imported from an external source.';
      const frontmatter = `---
name: ${name}
displayName: ${(metadata.displayName as string) || name}
description: ${(metadata.description as string) || ''}
version: 1.0.0
targetIDEs: []
tags: [imported]
sourceRepo: ${sourceRepo}
sourceArchive: ${sourceArchive}
importedAt: ${importedAt}
---

# ${(metadata.displayName as string) || name}

${(metadata.description as string) || ''}

${importSourceLine}
`;
      filesToWrite.unshift({ path: 'SKILL.md', content: Buffer.from(frontmatter, 'utf-8') });
    }

    // Write all files
    for (const file of filesToWrite) {
      let fullPath: string;
      try {
        fullPath = this.resolveSkillFilePath(skillDir, file.path);
      } catch {
        continue; // Skip files that would escape the skill directory
      }

      const parentDir = path.dirname(fullPath);
      if (!fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true });
      }

      if (Buffer.isBuffer(file.content)) {
        fs.writeFileSync(fullPath, file.content);
      } else {
        fs.writeFileSync(fullPath, file.content, 'utf-8');
      }
    }

    return this.loadSkill(skillName, skillDir)!;
  }

  /**
   * Check if a skill with the given name already exists
   */
  exists(name: string): boolean {
    try {
      const { skillDir } = this.resolveSkillDirectory(name);
      return fs.existsSync(skillDir);
    } catch {
      return false;
    }
  }
}
