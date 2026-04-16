import fs from 'fs';
import path from 'path';
import { getSkillsRoot } from '../utils/paths';
import type { Skill, CreateSkillInput, UpdateSkillInput } from '../types/domain';

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

${input.description}
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
}
