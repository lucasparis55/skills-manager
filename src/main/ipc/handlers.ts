import { ipcMain, dialog, shell } from 'electron';
import { SkillService } from '../services/skill.service';
import { ProjectService } from '../services/project.service';
import { SymlinkService } from '../services/symlink.service';
import { LinkService } from '../services/link.service';
import { IDEAdapterService } from '../services/ide-adapter.service';
import { DetectionService } from '../services/detection.service';
import { SettingsService } from '../services/settings.service';
import { GitHubImportService } from '../services/github-import.service';

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

    // Determine destination path
    const pathLib = require('path');
    const destRoot = ide.roots.projectRelative[0];
    const destination = pathLib.join(project.path, destRoot, skill.name);
    const source = skill.sourcePath;

    // Create symlink and check result
    const symlinkResult = symlinkService.create(source, destination);
    if (!symlinkResult.success) {
      const errorMessage = symlinkResult.error || 'Unknown symlink creation failure';
      throw new Error(`Failed to create symlink: ${errorMessage}`);
    }

    return linkService.create(input, source, destination);
  });

  ipcMain.handle('links:remove', (_event, id: string) => {
    const link = linkService.get(id);
    if (link) {
      symlinkService.remove(link.destinationPath);
    }
    return { success: linkService.remove(id) };
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
