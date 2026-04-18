import { ipcMain, dialog, shell } from 'electron';
import { SkillService } from '../services/skill.service';
import { ProjectService } from '../services/project.service';
import { SymlinkService, type SymlinkStrategy } from '../services/symlink.service';
import { LinkService } from '../services/link.service';
import { IDEAdapterService } from '../services/ide-adapter.service';
import { DetectionService } from '../services/detection.service';
import { SettingsService } from '../services/settings.service';
import { GitHubImportService } from '../services/github-import.service';
import { ZipImportService } from '../services/zip-import.service';
import { expandPath } from '../utils/paths';
import type {
  AppSettings,
  CreateMultipleLinksInput,
  LinkCreationProgress,
  LinkCreationResult,
} from '../types/domain';

type Handler = (event: any, ...args: any[]) => any;

type SkillServiceLike = Pick<
  SkillService,
  | 'list'
  | 'get'
  | 'create'
  | 'update'
  | 'delete'
  | 'scan'
  | 'getContent'
  | 'saveContent'
  | 'listFiles'
  | 'readFile'
  | 'writeFile'
  | 'deleteFile'
  | 'getSkillPath'
>;

type ProjectServiceLike = Pick<ProjectService, 'list' | 'add' | 'remove' | 'scan'>;
type SymlinkServiceLike = Pick<SymlinkService, 'create' | 'remove' | 'verify' | 'checkPermissions'>;
type LinkServiceLike = Pick<LinkService, 'list' | 'create' | 'get' | 'remove' | 'removeMultiple' | 'verify' | 'verifyAll'>;
type IdeServiceLike = Pick<IDEAdapterService, 'list' | 'detectRoots'>;
type DetectionServiceLike = Pick<DetectionService, 'checkDuplicates'>;
type SettingsServiceLike = Pick<SettingsService, 'get' | 'update'> &
  Partial<Pick<SettingsService, 'getPublicSettings' | 'setGithubToken' | 'clearGithubToken'>>;
type GitHubImportServiceLike = Pick<
  GitHubImportService,
  'parseGitHubUrl' | 'analyze' | 'checkConflicts' | 'importSkills' | 'cancelImport'
>;
type ZipImportServiceLike = Pick<
  ZipImportService,
  'analyze' | 'checkConflicts' | 'importSkills' | 'cancelImport'
>;

type LinkScope = 'global' | 'project';
type IdeRootsShape = {
  roots: {
    primaryGlobal: string[];
    projectRelative: string[];
  };
};

export interface IPCHandlerDependencies {
  ipcMain: { handle: (channel: string, listener: Handler) => void };
  dialog: { showOpenDialog: (options: any) => Promise<{ canceled: boolean; filePaths: string[] }> };
  shell: { openPath: (path: string) => Promise<string> };
  settingsService: SettingsServiceLike;
  projectService: ProjectServiceLike;
  symlinkService: SymlinkServiceLike;
  linkService: LinkServiceLike;
  ideService: IdeServiceLike;
  detectionService: DetectionServiceLike;
  githubImportService: GitHubImportServiceLike;
  zipImportService: ZipImportServiceLike;
  createSkillService: () => SkillServiceLike;
  expandPath: (input: string) => string;
  platform: NodeJS.Platform | string;
  log: Pick<Console, 'log' | 'error'>;
}

const defaultSkillService = new SkillService();
const defaultProjectService = new ProjectService();
const defaultSymlinkService = new SymlinkService();
const defaultLinkService = new LinkService();
const defaultIdeService = new IDEAdapterService();
const defaultDetectionService = new DetectionService();
const defaultSettingsService = new SettingsService();
const defaultGithubImportService = new GitHubImportService(defaultSettingsService);
const defaultZipImportService = new ZipImportService(defaultSettingsService);

const defaultDeps: IPCHandlerDependencies = {
  ipcMain,
  dialog,
  shell,
  settingsService: defaultSettingsService,
  projectService: defaultProjectService,
  symlinkService: defaultSymlinkService,
  linkService: defaultLinkService,
  ideService: defaultIdeService,
  detectionService: defaultDetectionService,
  githubImportService: defaultGithubImportService,
  zipImportService: defaultZipImportService,
  createSkillService: () => defaultSkillService,
  expandPath,
  platform: process.platform,
  log: console,
};

export function resolveLinkDestination(
  skillName: string,
  projectPath: string,
  ide: IdeRootsShape,
  scope: LinkScope,
  expandPathFn: (input: string) => string = expandPath,
): string {
  const pathLib = require('path');
  if (scope === 'global') {
    const globalRoot = ide.roots.primaryGlobal[0];
    return pathLib.join(expandPathFn(globalRoot), skillName);
  }

  const projectRelativeRoot = ide.roots.projectRelative[0];
  return pathLib.join(projectPath, projectRelativeRoot, skillName);
}

function resolveSymlinkStrategy(settings: AppSettings): SymlinkStrategy {
  const configured = settings.symlinkStrategy;
  if (configured === 'junction' || configured === 'symlink' || configured === 'auto') {
    return configured;
  }
  return 'auto';
}

function findGlobalDestinationConflict(links: any[], destinationPath: string): any | undefined {
  return links.find((link) => link.scope === 'global' && link.destinationPath === destinationPath);
}

function buildLinkId(skillId: string, projectId: string, ideName: string): string {
  return `${skillId}-${projectId}-${ideName}`;
}

/**
 * Register all IPC handlers.
 * Supports dependency injection for tests while defaulting to production services.
 */
export function registerIPCHandlers(inputDeps: Partial<IPCHandlerDependencies> = {}): void {
  const deps = { ...defaultDeps, ...inputDeps };
  const skillService = deps.createSkillService();

  deps.log.log('Registering IPC handlers...');

  deps.ipcMain.handle('skills:list', () => {
    deps.log.log('IPC: skills:list called');
    const result = skillService.list();
    deps.log.log('IPC: skills:list returning', result.length, 'skills');
    return result;
  });

  deps.ipcMain.handle('skills:get', (_event, id: string) => skillService.get(id));
  deps.ipcMain.handle('skills:create', (_event, input: any) => skillService.create(input));
  deps.ipcMain.handle('skills:update', (_event, id: string, input: any) => skillService.update(id, input));
  deps.ipcMain.handle('skills:delete', (_event, id: string) => {
    skillService.delete(id);
    return { success: true };
  });
  deps.ipcMain.handle('skills:scan', () => skillService.scan());
  deps.ipcMain.handle('skills:getContent', (_event, id: string) => skillService.getContent(id));
  deps.ipcMain.handle('skills:saveContent', (_event, id: string, content: string) => skillService.saveContent(id, content));
  deps.ipcMain.handle('skills:listFiles', (_event, id: string) => skillService.listFiles(id));
  deps.ipcMain.handle('skills:readFile', (_event, id: string, filePath: string) => skillService.readFile(id, filePath));
  deps.ipcMain.handle('skills:writeFile', (_event, id: string, filePath: string, content: string) => {
    skillService.writeFile(id, filePath, content);
    return { success: true };
  });
  deps.ipcMain.handle('skills:deleteFile', (_event, id: string, filePath: string) => {
    skillService.deleteFile(id, filePath);
    return { success: true };
  });
  deps.ipcMain.handle('skills:getPath', (_event, id: string) => skillService.getSkillPath(id));
  deps.ipcMain.handle('skills:openFolder', async (_event, id: string) => {
    const skillPath = skillService.getSkillPath(id);
    await deps.shell.openPath(skillPath);
    return { success: true };
  });

  deps.ipcMain.handle('projects:list', () => {
    deps.log.log('IPC: projects:list called');
    const result = deps.projectService.list();
    deps.log.log('IPC: projects:list returning', result.length, 'projects');
    return result;
  });
  deps.ipcMain.handle('projects:add', (_event, projectPath: string) => deps.projectService.add(projectPath));
  deps.ipcMain.handle('projects:remove', (_event, id: string) => {
    deps.projectService.remove(id);
    return { success: true };
  });
  deps.ipcMain.handle('projects:scan', (_event, rootPath?: string) => deps.projectService.scan(rootPath));

  deps.ipcMain.handle('links:list', () => {
    deps.log.log('IPC: links:list called');
    return deps.linkService.list();
  });

  deps.ipcMain.handle('links:create', (_event, input: any) => {
    const skill = skillService.get(input.skillId);
    if (!skill) {
      throw new Error(`Skill "${input.skillId}" not found`);
    }

    const project = deps.projectService.list().find((candidate: any) => candidate.id === input.projectId);
    if (!project) {
      throw new Error(`Project "${input.projectId}" not found`);
    }

    const ide = deps.ideService.list().find((candidate: any) => candidate.id === input.ideName);
    if (!ide) {
      throw new Error(`IDE "${input.ideName}" not found`);
    }

    if (deps.platform === 'win32') {
      const permissionCheck = deps.symlinkService.checkPermissions();
      if (!permissionCheck.canCreate) {
        throw new Error(permissionCheck.message || 'Cannot create symlinks on Windows');
      }
    }

    const destination = resolveLinkDestination(skill.name, project.path, ide, input.scope, deps.expandPath);
    const source = skill.sourcePath;
    const allLinks = deps.linkService.list();

    if (input.scope === 'global') {
      const conflict = findGlobalDestinationConflict(allLinks, destination);
      if (conflict) {
        throw new Error(`Global destination already linked: ${conflict.id}`);
      }
    }

    const strategy = resolveSymlinkStrategy(deps.settingsService.get());
    const symlinkResult = deps.symlinkService.create(source, destination, strategy);
    if (!symlinkResult.success) {
      throw new Error(`Failed to create symlink: ${symlinkResult.error || 'Unknown symlink creation failure'}`);
    }

    try {
      return deps.linkService.create(input, source, destination);
    } catch (err) {
      deps.symlinkService.remove(destination);
      throw err;
    }
  });

  deps.ipcMain.handle('links:createMultiple', async (event, input: CreateMultipleLinksInput) => {
    const { skillIds, projectId, ideName, scope } = input;
    const results: LinkCreationResult[] = [];

    const project = deps.projectService.list().find((candidate: any) => candidate.id === projectId);
    if (!project) {
      throw new Error(`Project "${projectId}" not found`);
    }

    const ide = deps.ideService.list().find((candidate: any) => candidate.id === ideName);
    if (!ide) {
      throw new Error(`IDE "${ideName}" not found`);
    }

    if (deps.platform === 'win32') {
      const permissionCheck = deps.symlinkService.checkPermissions();
      if (!permissionCheck.canCreate) {
        return skillIds.map((skillId) => ({
          skillId,
          skillName: skillId,
          status: 'error' as const,
          error: permissionCheck.message || 'Cannot create symlinks on Windows',
        }));
      }
    }

    const strategy = resolveSymlinkStrategy(deps.settingsService.get());
    const allLinks = deps.linkService.list();
    const total = skillIds.length;

    for (let i = 0; i < skillIds.length; i += 1) {
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

      const destination = resolveLinkDestination(skill.name, project.path, ide, scope, deps.expandPath);
      const source = skill.sourcePath;

      if (scope === 'global') {
        const conflict = findGlobalDestinationConflict(allLinks, destination);
        if (conflict) {
          results.push({
            skillId,
            skillName: skill.displayName || skill.name,
            status: 'skipped',
            error: `Global destination already linked: ${conflict.id}`,
          });
          continue;
        }
      }

      const linkId = buildLinkId(skillId, projectId, ideName);
      const existingLink = allLinks.find((link: any) => link.id === linkId);
      if (existingLink) {
        results.push({
          skillId,
          skillName: skill.displayName || skill.name,
          status: 'skipped',
          error: 'Link already exists',
        });
        continue;
      }

      const progressBefore: LinkCreationProgress = {
        current: i + 1,
        total,
        currentSkillName: skill.displayName || skill.name,
        percentComplete: Math.round((i / total) * 100),
      };
      event.sender.send('links:createProgress', progressBefore);

      const symlinkResult = deps.symlinkService.create(source, destination, strategy);
      if (!symlinkResult.success) {
        results.push({
          skillId,
          skillName: skill.displayName || skill.name,
          status: 'error',
          error: symlinkResult.error || 'Failed to create symlink',
        });
        continue;
      }

      try {
        const link = deps.linkService.create({ skillId, projectId, ideName, scope }, source, destination);
        results.push({
          skillId,
          skillName: skill.displayName || skill.name,
          status: 'created',
          link,
        });
        allLinks.push(link);
      } catch (err: any) {
        deps.symlinkService.remove(destination);
        results.push({
          skillId,
          skillName: skill.displayName || skill.name,
          status: 'error',
          error: err.message || 'Failed to persist link',
        });
      }

      const progressAfter: LinkCreationProgress = {
        current: i + 1,
        total,
        currentSkillName: skill.displayName || skill.name,
        percentComplete: Math.round(((i + 1) / total) * 100),
      };
      event.sender.send('links:createProgress', progressAfter);
    }

    return results;
  });

  deps.ipcMain.handle('links:remove', (_event, id: string) => {
    const allLinks = deps.linkService.list();
    const target = allLinks.find((link: any) => link.id === id);
    if (!target) {
      return { success: false };
    }

    const removed = deps.linkService.remove(id);
    if (!removed) {
      return { success: false };
    }

    const hasOtherReferences = allLinks.some(
      (link: any) => link.id !== id && link.destinationPath === target.destinationPath,
    );
    if (!hasOtherReferences) {
      deps.symlinkService.remove(target.destinationPath);
    }

    return { success: true };
  });

  deps.ipcMain.handle('links:removeMultiple', (_event, ids: string[]) => {
    const allLinks = deps.linkService.list();
    const removedResults = deps.linkService.removeMultiple(ids);

    const removedDestinationPaths = new Set<string>();
    for (const result of removedResults) {
      if (!result.success) {
        continue;
      }

      const removedLink = allLinks.find((link: any) => link.id === result.id);
      if (!removedLink) {
        continue;
      }

      const stillReferenced = allLinks.some(
        (link: any) =>
          link.id !== result.id &&
          !ids.includes(link.id) &&
          link.destinationPath === removedLink.destinationPath,
      );
      if (!stillReferenced) {
        removedDestinationPaths.add(removedLink.destinationPath);
      }
    }

    for (const destinationPath of removedDestinationPaths) {
      deps.symlinkService.remove(destinationPath);
    }

    return removedResults;
  });

  deps.ipcMain.handle('links:verify', (_event, id: string) => deps.linkService.verify(id, deps.symlinkService));
  deps.ipcMain.handle('links:verifyAll', () => deps.linkService.verifyAll(deps.symlinkService));

  deps.ipcMain.handle('ides:list', () => deps.ideService.list());
  deps.ipcMain.handle('ides:detect-roots', () => deps.ideService.detectRoots());
  deps.ipcMain.handle('detection:check-duplicates', (_event, skillId: string, projectId: string, ideId: string) =>
    deps.detectionService.checkDuplicates(skillId, projectId, ideId),
  );

  deps.ipcMain.handle('settings:get', async () => {
    if (typeof deps.settingsService.getPublicSettings === 'function') {
      return deps.settingsService.getPublicSettings();
    }
    return deps.settingsService.get();
  });
  deps.ipcMain.handle('settings:update', (_event, input: any) => deps.settingsService.update(input));
  deps.ipcMain.handle('settings:setGithubToken', async (_event, token: string) => {
    if (typeof deps.settingsService.setGithubToken !== 'function') {
      throw new Error('Secure token storage is not available');
    }
    await deps.settingsService.setGithubToken(token);
    return { success: true };
  });
  deps.ipcMain.handle('settings:clearGithubToken', async () => {
    if (typeof deps.settingsService.clearGithubToken !== 'function') {
      throw new Error('Secure token storage is not available');
    }
    await deps.settingsService.clearGithubToken();
    return { success: true };
  });

  deps.ipcMain.handle('dialog:selectFolder', async (_event, options?: { defaultPath?: string; title?: string }) => {
    const result = await deps.dialog.showOpenDialog({
      properties: ['openDirectory'],
      defaultPath: options?.defaultPath,
      title: options?.title || 'Select Project Directory',
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }
    return result.filePaths[0];
  });

  deps.ipcMain.handle('dialog:selectFile', async (_event, options?: { defaultPath?: string; title?: string; filters?: any[] }) => {
    const result = await deps.dialog.showOpenDialog({
      properties: ['openFile'],
      defaultPath: options?.defaultPath,
      title: options?.title || 'Select File',
      filters: options?.filters,
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }
    return result.filePaths[0];
  });

  deps.ipcMain.handle('github:parseUrl', (_event, url: string) => {
    try {
      return deps.githubImportService.parseGitHubUrl(url);
    } catch (err: any) {
      return { error: true, message: err.message };
    }
  });

  deps.ipcMain.handle('github:analyze', async (_event, parsed: any) => {
    try {
      return await deps.githubImportService.analyze(parsed);
    } catch (err: any) {
      return { error: true, message: err.message, isRateLimit: err.isRateLimit || false };
    }
  });

  deps.ipcMain.handle('github:checkConflicts', (_event, skillNames: string[]) =>
    deps.githubImportService.checkConflicts(skillNames),
  );

  deps.ipcMain.handle('github:importSkills', async (event, params: any) => {
    const { parsed, skills, resolutions } = params;
    try {
      return await deps.githubImportService.importSkills(parsed, skills, resolutions, (progress: any) => {
        event.sender.send('github:importProgress', progress);
      });
    } catch (err: any) {
      return [{ skillName: 'unknown', status: 'error', error: err.message }];
    }
  });

  deps.ipcMain.handle('github:cancelImport', () => {
    deps.githubImportService.cancelImport();
    return { success: true };
  });

  deps.ipcMain.handle('zip:analyze', async (_event, zipPath: string) => {
    try {
      return await deps.zipImportService.analyze(zipPath);
    } catch (err: any) {
      return { error: true, message: err.message };
    }
  });

  deps.ipcMain.handle('zip:checkConflicts', (_event, skillNames: string[]) =>
    deps.zipImportService.checkConflicts(skillNames),
  );

  deps.ipcMain.handle('zip:importSkills', async (event, params: any) => {
    const { zipPath, skills, resolutions } = params;
    try {
      return await deps.zipImportService.importSkills(zipPath, skills, resolutions, (progress: any) => {
        event.sender.send('zip:importProgress', progress);
      });
    } catch (err: any) {
      return [{ skillName: 'unknown', status: 'error', error: err.message }];
    }
  });

  deps.ipcMain.handle('zip:cancelImport', () => {
    deps.zipImportService.cancelImport();
    return { success: true };
  });
}
