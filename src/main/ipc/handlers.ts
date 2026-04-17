import { ipcMain, dialog, shell } from 'electron';
import { SkillService } from '../services/skill.service';
import { ProjectService } from '../services/project.service';
import { SymlinkService } from '../services/symlink.service';
import { LinkService } from '../services/link.service';
import { IDEAdapterService } from '../services/ide-adapter.service';
import { DetectionService } from '../services/detection.service';
import { SettingsService } from '../services/settings.service';
import { GitHubImportService } from '../services/github-import.service';
import { CreateMultipleLinksInput, LinkCreationResult, LinkCreationProgress } from '../types/domain';
import { expandPath } from '../utils/paths';

// Initialize services
const skillService = new SkillService();
const projectService = new ProjectService();
const symlinkService = new SymlinkService();
const linkService = new LinkService();
const ideService = new IDEAdapterService();
const detectionService = new DetectionService();
const settingsService = new SettingsService();
const githubImportService = new GitHubImportService(settingsService);

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

  // Skill file operation handlers
  ipcMain.handle('skills:getContent', (_event, id: string) => {
    return skillService.getContent(id);
  });

  ipcMain.handle('skills:saveContent', (_event, id: string, content: string) => {
    return skillService.saveContent(id, content);
  });

  ipcMain.handle('skills:listFiles', (_event, id: string) => {
    return skillService.listFiles(id);
  });

  ipcMain.handle('skills:readFile', (_event, id: string, filePath: string) => {
    return skillService.readFile(id, filePath);
  });

  ipcMain.handle('skills:writeFile', (_event, id: string, filePath: string, content: string) => {
    skillService.writeFile(id, filePath, content);
    return { success: true };
  });

  ipcMain.handle('skills:deleteFile', (_event, id: string, filePath: string) => {
    skillService.deleteFile(id, filePath);
    return { success: true };
  });

  ipcMain.handle('skills:getPath', (_event, id: string) => {
    return skillService.getSkillPath(id);
  });

  ipcMain.handle('skills:openFolder', async (_event, id: string) => {
    const skillPath = skillService.getSkillPath(id);
    await shell.openPath(skillPath);
    return { success: true };
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
    return linkService.list();
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

    // Pre-check Windows permissions before attempting symlink creation
    if (process.platform === 'win32') {
      const permissionCheck = symlinkService.checkPermissions();
      if (!permissionCheck.canCreate) {
        throw new Error(permissionCheck.message || 'Cannot create symlinks on Windows');
      }
    }

    // Determine destination path based on scope
    const pathLib = require('path');
    
    let destination: string;
    if (input.scope === 'global') {
      const globalRoot = ide.roots.primaryGlobal[0];
      destination = pathLib.join(expandPath(globalRoot), skill.name);
    } else {
      const destRoot = ide.roots.projectRelative[0];
      destination = pathLib.join(project.path, destRoot, skill.name);
    }
    const source = skill.sourcePath;

    // Create symlink and check result
    const symlinkResult = symlinkService.create(source, destination);
    if (!symlinkResult.success) {
      const errorMessage = symlinkResult.error || 'Unknown symlink creation failure';
      throw new Error(`Failed to create symlink: ${errorMessage}`);
    }

    return linkService.create(input, source, destination);
  });

  ipcMain.handle('links:createMultiple', async (event, input: CreateMultipleLinksInput) => {
    const { skillIds, projectId, ideName, scope } = input;
    const results: LinkCreationResult[] = [];

    // Validate project and IDE once upfront
    const project = projectService.list().find(p => p.id === projectId);
    if (!project) {
      throw new Error(`Project "${projectId}" not found`);
    }

    const ide = ideService.list().find(i => i.id === ideName);
    if (!ide) {
      throw new Error(`IDE "${ideName}" not found`);
    }

    // Pre-check Windows permissions before attempting symlink creation
    if (process.platform === 'win32') {
      const permissionCheck = symlinkService.checkPermissions();
      if (!permissionCheck.canCreate) {
        // Return error for all skills
        return skillIds.map(skillId => ({
          skillId,
          skillName: skillId,
          status: 'error' as const,
          error: permissionCheck.message || 'Cannot create symlinks on Windows',
        }));
      }
    }

    const pathLib = require('path');
    const allLinks = linkService.list();

    // Process each skill iteratively
    for (let i = 0; i < skillIds.length; i++) {
      const skillId = skillIds[i];
      const skill = skillService.get(skillId);

      if (!skill) {
        results.push({
          skillId,
          skillName: skillId,
          status: 'error',
          error: 'Skill not found',
        });
        continue;
      }

      // Check if link already exists
      const linkId = `${skillId}-${projectId}-${ideName}`;
      const existingLink = allLinks.find(l => l.id === linkId);
      if (existingLink) {
        results.push({
          skillId,
          skillName: skill.displayName || skill.name,
          status: 'skipped',
          error: 'Link already exists',
        });
        continue;
      }

      // Determine destination path based on scope
      let destination: string;
      if (scope === 'global') {
        const globalRoot = ide.roots.primaryGlobal[0];
        destination = pathLib.join(expandPath(globalRoot), skill.name);
      } else {
        const destRoot = ide.roots.projectRelative[0];
        destination = pathLib.join(project.path, destRoot, skill.name);
      }
      const source = skill.sourcePath;

      // Emit progress event before creation
      const progress: LinkCreationProgress = {
        current: i + 1,
        total: skillIds.length,
        currentSkillName: skill.displayName || skill.name,
        percentComplete: Math.round((i / skillIds.length) * 100),
      };
      event.sender.send('links:createProgress', progress);

      // Create symlink
      const symlinkResult = symlinkService.create(source, destination);
      if (!symlinkResult.success) {
        results.push({
          skillId,
          skillName: skill.displayName || skill.name,
          status: 'error',
          error: symlinkResult.error || 'Failed to create symlink',
        });
        continue;
      }

      // Persist link in database
      try {
        const link = linkService.create({ skillId, projectId, ideName, scope }, source, destination);
        results.push({
          skillId,
          skillName: skill.displayName || skill.name,
          status: 'created',
          link,
        });
      } catch (err: any) {
        results.push({
          skillId,
          skillName: skill.displayName || skill.name,
          status: 'error',
          error: err.message,
        });
      }

      // Emit progress event after creation
      const progressAfter: LinkCreationProgress = {
        current: i + 1,
        total: skillIds.length,
        currentSkillName: skill.displayName || skill.name,
        percentComplete: Math.round(((i + 1) / skillIds.length) * 100),
      };
      event.sender.send('links:createProgress', progressAfter);
    }

    return results;
  });

  ipcMain.handle('links:remove', (_event, id: string) => {
    const link = linkService.get(id);
    if (link) {
      symlinkService.remove(link.destinationPath);
    }
    return { success: linkService.remove(id) };
  });

  ipcMain.handle('links:removeMultiple', (_event, ids: string[]) => {
    // Collect destination paths before removing from DB
    const linksToRemove = ids.map(id => linkService.get(id)).filter(Boolean);
    // Remove symlinks first
    for (const link of linksToRemove) {
      symlinkService.remove(link.destinationPath);
    }
    // Remove from DB
    const results = linkService.removeMultiple(ids);
    return results;
  });

  ipcMain.handle('links:verify', (_event, id: string) => {
    return linkService.verify(id, symlinkService);
  });

  ipcMain.handle('links:verifyAll', () => {
    return linkService.verifyAll(symlinkService);
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

  // Dialog handlers
  ipcMain.handle('dialog:selectFolder', async (_event, options?: { defaultPath?: string; title?: string }) => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      defaultPath: options?.defaultPath,
      title: options?.title || 'Select Project Directory',
    });
    
    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }
    
    return result.filePaths[0];
  });

  // GitHub Import handlers
  ipcMain.handle('github:parseUrl', (_event, url: string) => {
    try {
      return githubImportService.parseGitHubUrl(url);
    } catch (err: any) {
      return { error: true, message: err.message };
    }
  });

  ipcMain.handle('github:analyze', async (_event, parsed: any) => {
    try {
      return await githubImportService.analyze(parsed);
    } catch (err: any) {
      return { error: true, message: err.message, isRateLimit: err.isRateLimit || false };
    }
  });

  ipcMain.handle('github:checkConflicts', (_event, skillNames: string[]) => {
    return githubImportService.checkConflicts(skillNames);
  });

  ipcMain.handle('github:importSkills', async (event, params: any) => {
    const { parsed, skills, resolutions } = params;
    try {
      return await githubImportService.importSkills(
        parsed,
        skills,
        resolutions,
        (progress) => {
          event.sender.send('github:importProgress', progress);
        },
      );
    } catch (err: any) {
      return [{ skillName: 'unknown', status: 'error', error: err.message }];
    }
  });

  ipcMain.handle('github:cancelImport', () => {
    githubImportService.cancelImport();
    return { success: true };
  });
}
