import fs from 'fs';
import path from 'path';
import type { DuplicateReport } from '../types/domain';
import { expandPath, getSkillsRoot } from '../utils/paths';
import { SkillService } from './skill.service';
import { ProjectService } from './project.service';
import { IDEAdapterService } from './ide-adapter.service';
import { SettingsService } from './settings.service';

/**
 * Detection Service - Detects duplicates and conflicts
 */
export class DetectionService {
  private settingsService: SettingsService;
  private projectService: ProjectService;
  private ideService: IDEAdapterService;

  constructor(
    settingsService?: SettingsService,
    projectService?: ProjectService,
    ideService?: IDEAdapterService,
  ) {
    this.settingsService = settingsService || new SettingsService();
    this.projectService = projectService || new ProjectService();
    this.ideService = ideService || new IDEAdapterService();
  }

  private createSkillService(): SkillService {
    const configured = this.settingsService.get().centralSkillsRoot;
    return new SkillService(configured || getSkillsRoot());
  }

  /**
   * Check for duplicates before linking a skill
   */
  checkDuplicates(skillId: string, projectId: string, ideId: string): DuplicateReport {
    const skillService = this.createSkillService();
    const project = this.projectService.list().find(p => p.id === projectId);
    if (!project) {
      return {
        hasDuplicate: false,
        existingType: 'project-skill',
        severity: 'info',
        message: 'Project not found',
      };
    }

    const skill = skillService.get(skillId);
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
      const checkPath = path.join(project.path, relRoot, skill.name);
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
      const expandedRoot = expandPath(globRoot);
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
