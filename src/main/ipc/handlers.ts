import { ipcMain as electronIpcMain, dialog as electronDialog, shell as electronShell } from 'electron';
import { SkillService } from '../services/skill.service';
import { ProjectService } from '../services/project.service';
import { SymlinkService, SymlinkStrategy } from '../services/symlink.service';
import { LinkService } from '../services/link.service';
import { IDEAdapterService } from '../services/ide-adapter.service';
import { DetectionService } from '../services/detection.service';
import { SettingsService } from '../services/settings.service';
import { GitHubImportService } from '../services/github-import.service';
import {
  AppSettings,
  CreateLinkInput,
  CreateMultipleLinksInput,
  LinkCreationProgress,
  LinkCreationResult,
} from '../types/domain';
import { expandPath as defaultExpandPath } from '../utils/paths';

interface SkillRecord {
  id: string;
  name: string;
  displayName?: string;
  sourcePath: string;
}

interface ProjectRecord {
  id: string;
  path: string;
}

interface IDERecord {
  id: string;
  roots: {
    primaryGlobal: string[];
    projectRelative: string[];
  };
}

interface LinkRecord {
  id: string;
  scope: 'global' | 'project';
  destinationPath: string;
}

interface SkillServiceLike {
  list: () => unknown[];
  get: (id: string) => SkillRecord | null;
  create: (input: any) => unknown;
  update: (id: string, input: any) => unknown;
  delete: (id: string) => void;
  scan: () => unknown[];
  getContent: (id: string) => string;
  saveContent: (id: string, content: string) => unknown;
  listFiles: (id: string) => unknown;
  readFile: (id: string, filePath: string) => string;
  writeFile: (id: string, filePath: string, content: string) => void;
  deleteFile: (id: string, filePath: string) => void;
  getSkillPath: (id: string) => string;
}

interface ProjectServiceLike {
  list: () => ProjectRecord[];
  add: (projectPath: string) => unknown;
  remove: (id: string) => void;
  scan: (rootPath?: string) => unknown[];
}

interface SymlinkServiceLike {
  create: (
    source: string,
    destination: string,
    strategy?: SymlinkStrategy,
  ) => { success: boolean; strategy: string; error?: string };
  remove: (destination: string) => boolean;
  verify: (destination: string) => { valid: boolean; target?: string };
  checkPermissions: () => { canCreate: boolean; message?: string };
}

interface LinkServiceLike {
  list: () => LinkRecord[];
  create: (input: CreateLinkInput, sourcePath: string, destinationPath: string) => unknown;
  get: (id: string) => LinkRecord | undefined;
  remove: (id: string) => boolean;
  removeMultiple: (ids: string[]) => { id: string; success: boolean }[];
  verify: (id: string, symlinkService: SymlinkServiceLike) => unknown;
  verifyAll: (symlinkService: SymlinkServiceLike) => unknown;
}

interface IDEAdapterServiceLike {
  list: () => IDERecord[];
  detectRoots: () => unknown[];
}

interface DetectionServiceLike {
  checkDuplicates: (skillId: string, projectId: string, ideId: string) => unknown;
}

interface SettingsServiceLike {
  get: () => AppSettings;
  update: (input: any) => AppSettings;
}

interface GitHubImportServiceLike {
  parseGitHubUrl: (url: string) => unknown;
  analyze: (parsed: any) => Promise<unknown>;
  checkConflicts: (skillNames: string[]) => Record<string, boolean>;
  importSkills: (
    parsed: any,
    skills: any[],
    resolutions: Record<string, any>,
    onProgress: (progress: unknown) => void,
  ) => Promise<unknown[]>;
  cancelImport: () => void;
}

interface IpcMainLike {
  handle: (channel: string, listener: (event: any, ...args: any[]) => any) => void;
}

interface DialogLike {
  showOpenDialog: (options: {
    properties: string[];
    defaultPath?: string;
    title?: string;
  }) => Promise<{ canceled: boolean; filePaths: string[] }>;
}

interface ShellLike {
  openPath: (fullPath: string) => Promise<string>;
}

export interface IPCHandlerDependencies {
  ipcMain: IpcMainLike;
  dialog: DialogLike;
  shell: ShellLike;
  settingsService: SettingsServiceLike;
  projectService: ProjectServiceLike;
  symlinkService: SymlinkServiceLike;
  linkService: LinkServiceLike;
  ideService: IDEAdapterServiceLike;
  detectionService: DetectionServiceLike;
  githubImportService: GitHubImportServiceLike;
  createSkillService?: () => SkillServiceLike;
  expandPath: (template: string) => string;
  platform: NodeJS.Platform;
  log: Pick<Console, 'log' | 'error'>;
}

export const resolveLinkDestination = (
  skillName: string,
  projectPath: string,
  ide: { roots: { primaryGlobal: string[]; projectRelative: string[] } },
  scope: 'global' | 'project',
  expandPathFn: (template: string) => string = defaultExpandPath,
): string => {
  const pathLib = require('path');
  if (scope === 'global') {
    const globalRoot = ide.roots.primaryGlobal[0];
    return pathLib.join(expandPathFn(globalRoot), skillName);
  }
  const destRoot = ide.roots.projectRelative[0];
  return pathLib.join(projectPath, destRoot, skillName);
};

const getSymlinkStrategy = (settingsService: SettingsServiceLike): SymlinkStrategy => {
  const strategy = settingsService.get().symlinkStrategy;
  if (strategy === 'symlink' || strategy === 'junction') {
    return strategy;
  }
  return 'auto';
};

export const createDefaultIPCHandlerDependencies = (): IPCHandlerDependencies => {
  const settingsService = new SettingsService();
  const projectService = new ProjectService();
  const symlinkService = new SymlinkService();
  const linkService = new LinkService();
  const ideService = new IDEAdapterService();
  const detectionService = new DetectionService(settingsService, projectService, ideService);
  const githubImportService = new GitHubImportService(settingsService);

  return {
    ipcMain: electronIpcMain,
    dialog: electronDialog,
    shell: electronShell,
    settingsService,
    projectService,
    symlinkService,
    linkService,
    ideService,
    detectionService,
    githubImportService,
    createSkillService: () => new SkillService(settingsService.get().centralSkillsRoot),
    expandPath: defaultExpandPath,
    platform: process.platform,
    log: console,
  };
};

/**
 * Register all IPC handlers
 */
export function registerIPCHandlers(overrides: Partial<IPCHandlerDependencies> = {}): void {
  const dependencies = {
    ...createDefaultIPCHandlerDependencies(),
    ...overrides,
  } as IPCHandlerDependencies;

  const {
    ipcMain,
    dialog,
    shell,
    settingsService,
    projectService,
    symlinkService,
    linkService,
    ideService,
    detectionService,
    githubImportService,
    expandPath,
    platform,
    log,
  } = dependencies;

  const createSkillService =
    overrides.createSkillService ||
    (() => new SkillService(settingsService.get().centralSkillsRoot));

  log.log('Registering IPC handlers...');

  // Skills handlers
  ipcMain.handle('skills:list', () => {
    log.log('IPC: skills:list called');
    const skillService = createSkillService();
    const result = skillService.list();
    log.log('IPC: skills:list returning', result.length, 'skills');
    return result;
  });

  ipcMain.handle('skills:get', (_event, id: string) => {
    const skillService = createSkillService();
    return skillService.get(id);
  });

  ipcMain.handle('skills:create', (_event, input: any) => {
    const skillService = createSkillService();
    return skillService.create(input);
  });

  ipcMain.handle('skills:update', (_event, id: string, input: any) => {
    const skillService = createSkillService();
    return skillService.update(id, input);
  });

  ipcMain.handle('skills:delete', (_event, id: string) => {
    const skillService = createSkillService();
    skillService.delete(id);
    return { success: true };
  });

  ipcMain.handle('skills:scan', () => {
    const skillService = createSkillService();
    return skillService.scan();
  });

  // Skill file operation handlers
  ipcMain.handle('skills:getContent', (_event, id: string) => {
    const skillService = createSkillService();
    return skillService.getContent(id);
  });

  ipcMain.handle('skills:saveContent', (_event, id: string, content: string) => {
    const skillService = createSkillService();
    return skillService.saveContent(id, content);
  });

  ipcMain.handle('skills:listFiles', (_event, id: string) => {
    const skillService = createSkillService();
    return skillService.listFiles(id);
  });

  ipcMain.handle('skills:readFile', (_event, id: string, filePath: string) => {
    const skillService = createSkillService();
    return skillService.readFile(id, filePath);
  });

  ipcMain.handle('skills:writeFile', (_event, id: string, filePath: string, content: string) => {
    const skillService = createSkillService();
    skillService.writeFile(id, filePath, content);
    return { success: true };
  });

  ipcMain.handle('skills:deleteFile', (_event, id: string, filePath: string) => {
    const skillService = createSkillService();
    skillService.deleteFile(id, filePath);
    return { success: true };
  });

  ipcMain.handle('skills:getPath', (_event, id: string) => {
    const skillService = createSkillService();
    return skillService.getSkillPath(id);
  });

  ipcMain.handle('skills:openFolder', async (_event, id: string) => {
    const skillService = createSkillService();
    const skillPath = skillService.getSkillPath(id);
    await shell.openPath(skillPath);
    return { success: true };
  });

  // Projects handlers
  ipcMain.handle('projects:list', () => {
    log.log('IPC: projects:list called');
    const result = projectService.list();
    log.log('IPC: projects:list returning', result.length, 'projects');
    return result;
  });

  ipcMain.handle('projects:add', (_event, projectPath: string) => {
    return projectService.add(projectPath);
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
    log.log('IPC: links:list called');
    return linkService.list();
  });

  ipcMain.handle('links:create', (_event, input: CreateLinkInput) => {
    const skillService = createSkillService();
    const skill = skillService.get(input.skillId);
    if (!skill) {
      throw new Error(`Skill "${input.skillId}" not found`);
    }

    const project = projectService.list().find((p) => p.id === input.projectId);
    if (!project) {
      throw new Error(`Project "${input.projectId}" not found`);
    }

    const ide = ideService.list().find((i) => i.id === input.ideName);
    if (!ide) {
      throw new Error(`IDE "${input.ideName}" not found`);
    }

    // Pre-check Windows permissions before attempting symlink creation
    if (platform === 'win32') {
      const permissionCheck = symlinkService.checkPermissions();
      if (!permissionCheck.canCreate) {
        throw new Error(permissionCheck.message || 'Cannot create symlinks on Windows');
      }
    }

    const destination = resolveLinkDestination(skill.name, project.path, ide, input.scope, expandPath);
    const source = skill.sourcePath;

    if (input.scope === 'global') {
      const globalConflict = linkService
        .list()
        .find((link) => link.scope === 'global' && link.destinationPath === destination);
      if (globalConflict) {
        throw new Error(`Global destination already linked: ${globalConflict.id}`);
      }
    }

    // Create symlink and check result
    const symlinkResult = symlinkService.create(source, destination, getSymlinkStrategy(settingsService));
    if (!symlinkResult.success) {
      const errorMessage = symlinkResult.error || 'Unknown symlink creation failure';
      throw new Error(`Failed to create symlink: ${errorMessage}`);
    }

    try {
      return linkService.create(input, source, destination);
    } catch (error) {
      symlinkService.remove(destination);
      throw error;
    }
  });

  ipcMain.handle('links:createMultiple', async (event, input: CreateMultipleLinksInput) => {
    const { skillIds, projectId, ideName, scope } = input;
    const results: LinkCreationResult[] = [];
    const skillService = createSkillService();

    // Validate project and IDE once upfront
    const project = projectService.list().find((p) => p.id === projectId);
    if (!project) {
      throw new Error(`Project "${projectId}" not found`);
    }

    const ide = ideService.list().find((i) => i.id === ideName);
    if (!ide) {
      throw new Error(`IDE "${ideName}" not found`);
    }

    // Pre-check Windows permissions before attempting symlink creation
    if (platform === 'win32') {
      const permissionCheck = symlinkService.checkPermissions();
      if (!permissionCheck.canCreate) {
        // Return error for all skills
        return skillIds.map((skillId) => ({
          skillId,
          skillName: skillId,
          status: 'error' as const,
          error: permissionCheck.message || 'Cannot create symlinks on Windows',
        }));
      }
    }

    let allLinks = linkService.list();

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
      const existingLink = allLinks.find((l) => l.id === linkId);
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
      const destination = resolveLinkDestination(skill.name, project.path, ide, scope, expandPath);
      if (scope === 'global') {
        const existingGlobalDestination = allLinks.find(
          (l) => l.scope === 'global' && l.destinationPath === destination,
        );
        if (existingGlobalDestination) {
          results.push({
            skillId,
            skillName: skill.displayName || skill.name,
            status: 'skipped',
            error: `Global destination already linked: ${existingGlobalDestination.id}`,
          });
          continue;
        }
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
      const symlinkResult = symlinkService.create(source, destination, getSymlinkStrategy(settingsService));
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
        allLinks = [...allLinks, link as LinkRecord];
        results.push({
          skillId,
          skillName: skill.displayName || skill.name,
          status: 'created',
          link,
        });
      } catch (err: any) {
        symlinkService.remove(destination);
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
    const allLinks = linkService.list();
    const link = allLinks.find((item) => item.id === id);
    if (!link) {
      return { success: false };
    }

    const hasOtherReferences = allLinks.some(
      (item) => item.id !== id && item.destinationPath === link.destinationPath,
    );
    const removed = linkService.remove(id);
    if (removed && !hasOtherReferences) {
      symlinkService.remove(link.destinationPath);
    }

    return { success: removed };
  });

  ipcMain.handle('links:removeMultiple', (_event, ids: string[]) => {
    const allLinks = linkService.list();
    const linksById = new Map(allLinks.map((link) => [link.id, link]));

    // Remove from DB first
    const results = linkService.removeMultiple(ids);
    const removedIds = new Set(results.filter((result) => result.success).map((result) => result.id));
    const remainingLinks = allLinks.filter((link) => !removedIds.has(link.id));

    const destinationsToCleanup = new Set<string>();
    for (const removedId of removedIds) {
      const removedLink = linksById.get(removedId);
      if (!removedLink) {
        continue;
      }

      const stillReferenced = remainingLinks.some(
        (link) => link.destinationPath === removedLink.destinationPath,
      );
      if (!stillReferenced) {
        destinationsToCleanup.add(removedLink.destinationPath);
      }
    }

    for (const destination of destinationsToCleanup) {
      symlinkService.remove(destination);
    }

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
      return await githubImportService.importSkills(parsed, skills, resolutions, (progress) => {
        event.sender.send('github:importProgress', progress);
      });
    } catch (err: any) {
      return [{ skillName: 'unknown', status: 'error', error: err.message }];
    }
  });

  ipcMain.handle('github:cancelImport', () => {
    githubImportService.cancelImport();
    return { success: true };
  });
}
