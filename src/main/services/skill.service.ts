import fs from 'fs';
import path from 'path';
import { getSkillsRoot, isSubDirectory } from '../utils/paths';
import type { Skill, CreateSkillInput, UpdateSkillInput } from '../types/domain';

export interface SkillFileEntry {
  path: string;
  name: string;
  isDirectory: boolean;
  size: number;
}

/**
 * Skill Service - Manages skills in the central repository
 */
export class SkillService {
  private skillsRoot: string;

  constructor(skillsRoot?: string) {
    this.skillsRoot = skillsRoot || getSkillsRoot();
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
   * List all skills in the central repository
   */
  list(): Skill[] {
    this.ensureSkillsRoot();

    const skills: Skill[] = [];
    const entries = fs.readdirSync(this.skillsRoot, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory()) {
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
    const skillPath = path.join(this.skillsRoot, name);
    if (!fs.existsSync(skillPath)) {
      return null;
    }
    return this.loadSkill(name, skillPath);
  }

  /**
   * Create a new skill
   */
  create(input: CreateSkillInput): Skill {
    const skillDir = path.join(this.skillsRoot, input.name);

    if (fs.existsSync(skillDir)) {
      throw new Error(`Skill "${input.name}" already exists`);
    }

    fs.mkdirSync(skillDir, { recursive: true });

    // Create SKILL.md with frontmatter
    const frontmatter = `---
name: ${input.name}
displayName: ${input.displayName}
description: ${input.description}
version: ${input.version || '1.0.0'}
targetIDEs: [${input.targetIDEs.join(', ')}]
tags: [${input.tags?.join(', ') || ''}]
---

# ${input.displayName}

`;

    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), frontmatter, 'utf-8');

    return this.loadSkill(input.name, skillDir)!;
  }

  /**
   * Update skill metadata
   */
  update(name: string, input: UpdateSkillInput): Skill {
    const skillDir = path.join(this.skillsRoot, name);
    const skillMdPath = path.join(skillDir, 'SKILL.md');

    if (!fs.existsSync(skillMdPath)) {
      throw new Error(`Skill "${name}" not found`);
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

    return this.loadSkill(name, skillDir)!;
  }

  /**
   * Delete a skill
   */
  delete(name: string): void {
    const skillDir = path.join(this.skillsRoot, name);

    if (!fs.existsSync(skillDir)) {
      throw new Error(`Skill "${name}" not found`);
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
    const skillDir = path.join(this.skillsRoot, name);
    if (!fs.existsSync(skillDir)) {
      throw new Error(`Skill "${name}" not found`);
    }
    return skillDir;
  }

  /**
   * Get the full content of SKILL.md
   */
  getContent(name: string): string {
    const skillDir = path.join(this.skillsRoot, name);
    const skillMdPath = path.join(skillDir, 'SKILL.md');

    if (!fs.existsSync(skillMdPath)) {
      throw new Error(`Skill "${name}" not found`);
    }

    return fs.readFileSync(skillMdPath, 'utf-8');
  }

  /**
   * Save the full content of SKILL.md
   */
  saveContent(name: string, content: string): Skill {
    const skillDir = path.join(this.skillsRoot, name);
    const skillMdPath = path.join(skillDir, 'SKILL.md');

    if (!fs.existsSync(skillMdPath)) {
      throw new Error(`Skill "${name}" not found`);
    }

    fs.writeFileSync(skillMdPath, content, 'utf-8');
    return this.loadSkill(name, skillDir)!;
  }

  /**
   * List all files in a skill directory (recursive)
   */
  listFiles(name: string): SkillFileEntry[] {
    const skillDir = path.join(this.skillsRoot, name);

    if (!fs.existsSync(skillDir)) {
      throw new Error(`Skill "${name}" not found`);
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
    const skillDir = path.join(this.skillsRoot, name);
    const fullPath = path.normalize(path.join(skillDir, filePath));

    if (!isSubDirectory(fullPath, skillDir)) {
      throw new Error('Access denied: path traversal detected');
    }

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
    const skillDir = path.join(this.skillsRoot, name);
    const fullPath = path.normalize(path.join(skillDir, filePath));

    if (!isSubDirectory(fullPath, skillDir)) {
      throw new Error('Access denied: path traversal detected');
    }

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
    const skillDir = path.join(this.skillsRoot, name);
    const fullPath = path.normalize(path.join(skillDir, filePath));

    if (!isSubDirectory(fullPath, skillDir)) {
      throw new Error('Access denied: path traversal detected');
    }

    if (!fs.existsSync(fullPath)) {
      throw new Error(`File "${filePath}" not found`);
    }

    if (fs.statSync(fullPath).isDirectory()) {
      throw new Error(`Cannot delete directory "${filePath}" using this method`);
    }

    fs.unlinkSync(fullPath);
  }
}
