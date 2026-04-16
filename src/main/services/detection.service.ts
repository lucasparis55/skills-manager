import fs from 'fs';
import path from 'path';
import type { DuplicateReport } from '../types/domain';
import { SkillService } from './skill.service';
import { ProjectService } from './project.service';
import { IDEAdapterService } from './ide-adapter.service';

/**
 * Detection Service - Detects duplicates and conflicts
 */
export class DetectionService {
  private skillService: SkillService;
  private projectService: ProjectService;
  private ideService: IDEAdapterService;

  constructor() {
    this.skillService = new SkillService();
    this.projectService = new ProjectService();
    this.ideService = new IDEAdapterService();
  }

  /**
   * Check for duplicates before linking a skill
   */
  checkDuplicates(skillId: string, projectId: string, ideId: string): DuplicateReport {
    const skill = this.skillService.get(skillId);
    if (!skill) {
      return {
        hasDuplicate: false,
        existingType: 'global-skill',
        severity: 'info',
        message: 'Skill not found',
      };
    }

    // Check if destination already exists
    const ideRoots = this.ideService.list().find(ide => ide.id === ideId);
    if (!ideRoots) {
      return {
        hasDuplicate: false,
        existingType: 'global-skill',
        severity: 'info',
        message: 'IDE not found',
      };
    }

    // Check project-relative paths
    for (const relRoot of ideRoots.roots.projectRelative) {
      const checkPath = path.join(process.cwd(), relRoot, skill.name);
      if (fs.existsSync(checkPath)) {
        return {
          hasDuplicate: true,
          existingPath: checkPath,
          existingType: 'project-skill',
          severity: 'warning',
          message: `A skill with the same name already exists at ${checkPath}`,
        };
      }
    }

    // Check global paths
    for (const globRoot of ideRoots.roots.primaryGlobal) {
      const fs = require('fs');
      const os = require('os');
      const expandedRoot = globRoot.replace('~', os.homedir());
      const checkPath = path.join(expandedRoot, skill.name);

      if (fs.existsSync(checkPath)) {
        return {
          hasDuplicate: true,
          existingPath: checkPath,
          existingType: 'global-skill',
          severity: 'warning',
          message: `A skill with the same name already exists globally at ${checkPath}`,
        };
      }
    }

    return {
      hasDuplicate: false,
      existingType: 'global-skill',
      severity: 'info',
      message: 'No duplicates detected',
    };
  }
}
