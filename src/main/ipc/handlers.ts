import { ipcMain } from 'electron';
import { SkillService } from '../services/skill.service';
import { ProjectService } from '../services/project.service';
import { SymlinkService } from '../services/symlink.service';
import { IDEAdapterService } from '../services/ide-adapter.service';
import { DetectionService } from '../services/detection.service';
import { SettingsService } from '../services/settings.service';

// Initialize services
const skillService = new SkillService();
const projectService = new ProjectService();
const symlinkService = new SymlinkService();
const ideService = new IDEAdapterService();
const detectionService = new DetectionService();
const settingsService = new SettingsService();

/**
 * Register all IPC handlers
 */
export function registerIPCHandlers(): void {
  console.log('Registering IPC handlers...');
  
  // Skills handlers
  ipcMain.handle('skills:list', () => {
    console.log('IPC: skills:list called');
    const result = skillService.list();
    console.log('IPC: skills:list returning', result.length, 'skills');
    return result;
  });

  ipcMain.handle('skills:get', (_event, id: string) => {
    return skillService.get(id);
  });

  ipcMain.handle('skills:create', (_event, input: any) => {
    return skillService.create(input);
  });

  ipcMain.handle('skills:update', (_event, id: string, input: any) => {
    return skillService.update(id, input);
  });

  ipcMain.handle('skills:delete', (_event, id: string) => {
    skillService.delete(id);
    return { success: true };
  });

  ipcMain.handle('skills:scan', () => {
    return skillService.scan();
  });

  // Projects handlers
  ipcMain.handle('projects:list', () => {
    console.log('IPC: projects:list called');
    const result = projectService.list();
    console.log('IPC: projects:list returning', result.length, 'projects');
    return result;
  });

  ipcMain.handle('projects:add', (_event, path: string) => {
    return projectService.add(path);
  });

  ipcMain.handle('projects:remove', (_event, id: string) => {
    projectService.remove(id);
    return { success: true };
  });

  ipcMain.handle('projects:scan', (_event, rootPath?: string) => {
    return projectService.scan(rootPath);
  });

  // Links handlers
  ipcMain.handle('links:list', () => {
    console.log('IPC: links:list called');
    return []; // Simplified - would load from storage in full implementation
  });

  ipcMain.handle('links:create', (_event, input: any) => {
    const skill = skillService.get(input.skillId);
    if (!skill) {
      throw new Error(`Skill "${input.skillId}" not found`);
    }

    const project = projectService.list().find(p => p.id === input.projectId);
    if (!project) {
      throw new Error(`Project "${input.projectId}" not found`);
    }

    const ide = ideService.list().find(i => i.id === input.ideName);
    if (!ide) {
      throw new Error(`IDE "${input.ideName}" not found`);
    }

    // Determine destination path
    const os = require('os');
    const pathLib = require('path');
    const destRoot = ide.roots.projectRelative[0];
    const destination = pathLib.join(project.path, destRoot, skill.name);
    const source = skill.sourcePath;

    const result = symlinkService.create(source, destination);

    return {
      id: `${input.skillId}-${input.projectId}-${input.ideName}`,
      skillId: input.skillId,
      projectId: input.projectId,
      ideName: input.ideName,
      scope: input.scope,
      sourcePath: source,
      destinationPath: destination,
      status: result.success ? 'linked' : 'broken',
      createdAt: new Date().toISOString(),
    };
  });

  ipcMain.handle('links:remove', (_event, id: string) => {
    // Simplified - would remove symlink in full implementation
    return { success: true };
  });

  ipcMain.handle('links:verify', (_event, id: string) => {
    return { valid: true };
  });

  // IDEs handlers
  ipcMain.handle('ides:list', () => {
    return ideService.list();
  });

  ipcMain.handle('ides:detect-roots', () => {
    return ideService.detectRoots();
  });

  // Detection handlers
  ipcMain.handle('detection:check-duplicates', (_event, skillId: string, projectId: string, ideId: string) => {
    return detectionService.checkDuplicates(skillId, projectId, ideId);
  });

  // Settings handlers
  ipcMain.handle('settings:get', () => {
    return settingsService.get();
  });

  ipcMain.handle('settings:update', (_event, input: any) => {
    return settingsService.update(input);
  });
}
