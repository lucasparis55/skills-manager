import fs from 'fs';
import path from 'path';
import { ensureSkillsRoot, expandPath, getAppDataDir, getSkillsRoot, resolveSkillLinkDestination } from '../utils/paths';
import { SkillService } from './skill.service';
import { LinkService } from './link.service';
import { SymlinkService } from './symlink.service';
import { ImportHookService, type HookInstallation } from './import-hook.service';
import { ImportPathService } from './import-path.service';
import { ImportFileService } from './import-file.service';
import type { IDEDefinition, Project } from '../types/domain';
import type {
  ImportComponent,
  ImportComponentKind,
  ImportPlanItem,
  ImportTarget,
} from '../types/import';
import type { ImportFileOperation } from './import-file.service';
import type { StagedImport } from './import-staging.service';

export interface ImportAdapterServiceOptions {
  ideService?: { list: () => IDEDefinition[] };
  centralSkillsRoot?: string;
  expandPath?: (value: string) => string;
  skillService?: SkillService;
  linkService?: LinkService;
  symlinkService?: SymlinkService;
  backupRoot?: string;
}

export interface ImportAdapterInstallRequest {
  item: ImportPlanItem;
  staged: StagedImport;
  hookManifestContent?: string;
  sourceMetadata?: {
    sourceRepo?: string;
    sourceRef?: string;
    commitSha?: string;
    treeSha?: string;
  };
}

export interface ImportAdapterInstallResult {
  destinationPath: string;
  skillName?: string;
  hookInstallation?: HookInstallation;
  backupPath?: string;
  rollback?: () => void;
}

const EXTENDED_NATIVE_KINDS: ImportComponentKind[] = [
  'skill',
  'hook',
  'agent',
  'command',
  'reference',
  'script',
  'config',
  'asset',
  'bundle',
];

/** Registry of native destinations shared by the import wizard and installers. */
export class ImportAdapterService {
  private readonly ideService?: { list: () => IDEDefinition[] };
  private readonly centralSkillsRoot: string;
  private readonly expand: (value: string) => string;
  private readonly skillService?: SkillService;
  private readonly linkService?: LinkService;
  private readonly symlinkService?: SymlinkService;
  private readonly backupRoot: string;
  private readonly hookService = new ImportHookService();
  private readonly pathService = new ImportPathService();
  private readonly fileService: ImportFileService;

  constructor(options: ImportAdapterServiceOptions = {}) {
    this.ideService = options.ideService;
    this.centralSkillsRoot = path.resolve(options.centralSkillsRoot || getSkillsRoot());
    this.expand = options.expandPath || expandPath;
    this.skillService = options.skillService;
    this.linkService = options.linkService;
    this.symlinkService = options.symlinkService;
    this.backupRoot = path.resolve(options.backupRoot || path.join(getAppDataDir(), 'imports', 'backups'));
    this.fileService = new ImportFileService({ backupRoot: this.backupRoot });
  }

  listTargets(projects: Project[] = [], overrides: Record<string, string> = {}): ImportTarget[] {
    const targets: ImportTarget[] = [{
      id: 'central',
      label: 'Skills Manager (central)',
      adapterId: 'central',
      scope: 'central',
      rootPath: this.centralSkillsRoot,
      componentRoots: { skill: this.centralSkillsRoot },
      supportedKinds: ['skill'],
      native: true,
      available: true,
    }];

    const ides = this.ideService?.list() || [];
    for (const ide of ides) {
      const globalRoot = this.resolveGlobalRoot(ide, overrides[ide.id]);
      targets.push(this.createTarget(ide, globalRoot, 'global'));

      for (const project of projects) {
        const projectRoot = this.resolveProjectRoot(ide, project.path);
        targets.push(this.createTarget(ide, projectRoot, 'project', project));
      }
    }
    return targets;
  }

  async install(request: ImportAdapterInstallRequest): Promise<ImportAdapterInstallResult> {
    const { item, staged } = request;
    if (item.status === 'blocked' || item.status === 'conflict' || item.status === 'needs-approval') {
      throw new Error(`Import item "${item.component.displayName}" is not ready.`);
    }

    if (item.component.kind === 'skill' && item.target.scope === 'central') {
      return this.installCentralSkill(item.component, item, staged, request.sourceMetadata);
    }

    if (item.component.kind === 'hook') {
      if (!request.hookManifestContent) {
        throw new Error('Hook manifest content is required for native installation.');
      }
      const installation = await this.hookService.installDisabled({
        component: item.component,
        target: item.target,
        stagedRoot: staged.rootPath,
        destinationPath: item.destinationPath,
        manifestContent: request.hookManifestContent,
        commandRoot: item.target.rootPath,
        overwrite: item.selection.conflictStrategy === 'overwrite',
        backupRoot: this.backupRoot,
      });
      return { destinationPath: installation.installedPath, hookInstallation: installation, backupPath: installation.backupPath, rollback: installation.rollback };
    }

    if (item.component.kind === 'skill' && item.target.ideId) {
      const installed = this.installCentralSkill(item.component, item, staged, request.sourceMetadata);
      try {
        this.createLink(item, installed.skillName!, installed.destinationPath);
      } catch (error) {
        installed.rollback?.();
        throw error;
      }
      return { ...installed, destinationPath: item.destinationPath };
    }

    const operation = this.copyStagedComponent(
      item.component,
      item.destinationPath,
      staged.rootPath,
      this.getAllowedRoot(item),
      item.selection.conflictStrategy === 'overwrite',
    );
    return { destinationPath: item.destinationPath, backupPath: operation.backupPath, rollback: operation.rollback };
  }

  getHookService(): ImportHookService {
    return this.hookService;
  }

  private installCentralSkill(
    component: ImportComponent,
    item: ImportPlanItem,
    staged: StagedImport,
    sourceMetadata: ImportAdapterInstallRequest['sourceMetadata'] = {},
  ): ImportAdapterInstallResult {
    const skillName = item.selection.renameTo || component.name;
    const skillService = this.getSkillService();
    const overwrite = item.selection.conflictStrategy === 'overwrite';
    const skillDestinationPath = overwrite && skillService.exists(skillName)
      ? skillService.getSkillPath(skillName)
      : undefined;
    const backupPath = overwrite && skillService.exists(skillName)
      ? this.backupSkill(skillDestinationPath!, skillName)
      : undefined;
    const files = staged.files.map((file) => ({
      path: this.relativeComponentPath(component, file.path),
      content: fs.readFileSync(this.pathService.resolveInside(staged.rootPath, file.path)),
    }));
    try {
      const skill = skillService.importFromArchiveFiles(skillName, files, {
        sourceRepo: sourceMetadata.sourceRepo || item.target.adapterId,
        sourceRef: sourceMetadata.sourceRef,
        commitSha: sourceMetadata.commitSha,
        treeSha: sourceMetadata.treeSha,
        importedAt: new Date().toISOString(),
        displayName: component.displayName,
        description: component.description,
      }, { overwrite });
      return {
        destinationPath: skill.sourcePath,
        skillName,
        backupPath,
        rollback: () => {
          if (fs.existsSync(skill.sourcePath)) fs.rmSync(skill.sourcePath, { recursive: true, force: true });
          if (backupPath && skillDestinationPath) fs.cpSync(backupPath, skillDestinationPath, { recursive: true });
        },
      };
    } catch (error) {
      if (backupPath && skillDestinationPath) {
        if (fs.existsSync(skillDestinationPath)) fs.rmSync(skillDestinationPath, { recursive: true, force: true });
        fs.cpSync(backupPath, skillDestinationPath, { recursive: true });
      }
      throw error;
    }
  }

  private backupSkill(sourcePath: string, skillName: string): string {
    fs.mkdirSync(this.backupRoot, { recursive: true });
    const backupDir = fs.mkdtempSync(path.join(this.backupRoot, 'skill-'));
    const backupPath = path.join(backupDir, skillName);
    fs.cpSync(sourcePath, backupPath, { recursive: true });
    return backupPath;
  }

  private createLink(item: ImportPlanItem, skillName: string, sourcePath: string): void {
    const ide = this.ideService?.list().find((candidate) => candidate.id === item.target.ideId);
    if (!ide || !item.target.ideId) throw new Error(`IDE "${item.target.ideId || ''}" not found.`);
    const projectPath = item.target.projectPath || '';
    const scope = item.target.scope === 'project' ? 'project' : 'global';
    const destination = resolveSkillLinkDestination(skillName, projectPath, ide, scope);
    const symlinkService = this.getSymlinkService();
    const symlink = symlinkService.create(sourcePath, destination, 'auto');
    if (!symlink.success) throw new Error(symlink.error || 'Failed to create skill link.');
    try {
      this.getLinkService().create({
        skillId: skillName,
        projectId: item.target.projectId || null,
        ideName: item.target.ideId,
        scope,
      }, sourcePath, destination);
    } catch (error) {
      symlinkService.remove(destination);
      throw error;
    }
  }

  private copyStagedComponent(
    component: ImportComponent,
    destination: string,
    stagedRoot: string,
    allowedRoot: string,
    overwrite: boolean,
  ): ImportFileOperation {
    if (component.files.length === 1 && component.kind !== 'skill') {
      const sourceFile = this.pathService.resolveInside(stagedRoot, component.files[0].path);
      const targetFile = this.pathService.assertSafeDestination(destination, allowedRoot);
      const operation = this.fileService.apply([{
        sourcePath: sourceFile,
        destinationPath: targetFile,
        allowedRoot,
      }], { overwrite });
      return operation;
    }

    const targetRoot = this.pathService.assertSafeDestination(destination, allowedRoot);
    const writes = [] as Array<{ sourcePath: string; destinationPath: string; allowedRoot: string }>;
    for (const file of component.files) {
      const sourceFile = this.pathService.resolveInside(stagedRoot, file.path);
      const relative = this.relativeComponentPath(component, file.path);
      const targetFile = this.pathService.assertSafeDestination(path.join(targetRoot, relative), targetRoot);
      writes.push({ sourcePath: sourceFile, destinationPath: targetFile, allowedRoot: targetRoot });
    }
    return this.fileService.apply(writes, { overwrite });
  }

  private relativeComponentPath(component: ImportComponent, filePath: string): string {
    if (component.sourcePath && filePath.startsWith(`${component.sourcePath}/`)) {
      return filePath.slice(component.sourcePath.length + 1);
    }
    return filePath.replace(/\\/g, '/');
  }

  private getAllowedRoot(item: ImportPlanItem): string {
    const configured = item.component.metadata.destinationRootKind;
    const kind = typeof configured === 'string' && configured in item.target.componentRoots
      ? configured as ImportComponentKind
      : item.component.kind;
    return item.target.componentRoots[kind] || item.target.rootPath;
  }

  private createTarget(ide: IDEDefinition, rootPath: string, scope: 'global' | 'project', project?: Project): ImportTarget {
    const componentRoots = this.componentRoots(ide, rootPath);
    return {
      id: scope === 'global' ? `${ide.id}:global` : `${ide.id}:project:${project!.id}`,
      label: scope === 'global' ? `${ide.name} (global)` : `${ide.name} — ${project!.name}`,
      adapterId: ide.id,
      scope,
      ideId: ide.id,
      projectId: project?.id,
      projectPath: project?.path,
      rootPath,
      componentRoots,
      supportedKinds: ide.id === 'claude-code' ? EXTENDED_NATIVE_KINDS : ['skill', 'reference', 'config'],
      native: true,
      available: true,
      hookConfigPath: ide.id === 'claude-code' ? path.join(rootPath, 'settings.json') : undefined,
    };
  }

  private componentRoots(ide: IDEDefinition, rootPath: string): ImportTarget['componentRoots'] {
    return {
      skill: ensureSkillsRoot(rootPath),
      agent: path.join(rootPath, 'agents'),
      command: path.join(rootPath, 'commands'),
      hook: path.join(rootPath, 'hooks'),
      script: path.join(rootPath, 'scripts'),
      reference: path.join(rootPath, 'references'),
      asset: path.join(rootPath, 'assets'),
      config: rootPath,
      bundle: path.join(rootPath, 'plugins'),
      'manual-step': rootPath,
      ...(ide.id === 'cursor' ? { command: path.join(rootPath, 'rules') } : {}),
    };
  }

  private resolveGlobalRoot(ide: IDEDefinition, override?: string): string {
    const template = override?.trim() || ide.skillRootTemplates?.[0] || ide.roots.primaryGlobal[0];
    const expanded = this.expand(template);
    return path.basename(expanded).toLowerCase() === 'skills' ? path.dirname(expanded) : expanded;
  }

  private resolveProjectRoot(ide: IDEDefinition, projectPath: string): string {
    const relative = ide.roots.projectRelative[0] || '.agents';
    return path.resolve(projectPath, path.dirname(relative));
  }

  private getSkillService(): SkillService {
    return this.skillService || new SkillService(this.centralSkillsRoot);
  }

  private getLinkService(): LinkService {
    return this.linkService || new LinkService();
  }

  private getSymlinkService(): SymlinkService {
    return this.symlinkService || new SymlinkService();
  }
}
