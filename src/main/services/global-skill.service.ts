import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { ensureSkillsRoot, expandPath, resolveSkillsRoot } from '../utils/paths';
import type {
  AppSettings,
  GlobalSkillEntry,
  GlobalSkillInventory,
  GlobalSkillPreview,
  GlobalSkillRemovalResult,
  GlobalSkillStatus,
  GlobalSkillTool,
  GlobalSkillUndoResult,
  IDEDefinition,
  Link,
} from '../types/domain';
import type { IDEAdapterService } from './ide-adapter.service';
import type { LinkService } from './link.service';
import type { SettingsService } from './settings.service';
import type { SymlinkService } from './symlink.service';

const SKILL_FILE_NAME = 'SKILL.md';
const MAX_CONTENT_BYTES = 256 * 1024;
const UNDO_WINDOW_MS = 10_000;

interface GlobalSkillServiceDependencies {
  settingsService: Pick<SettingsService, 'get'>;
  ideService: Pick<IDEAdapterService, 'list'>;
  linkService: Pick<LinkService, 'list'>;
  symlinkService: Pick<SymlinkService, 'createExclusive'>;
  trashItem: (targetPath: string) => Promise<void>;
}

interface ReadSkillFileResult {
  content: string;
  truncated: boolean;
}

interface CandidateMetadata {
  displayName: string;
  description: string;
  status: GlobalSkillStatus;
}

interface ResolvedRoot {
  path: string;
  isConfigured: boolean;
}

interface UndoRecord {
  path: string;
  rootPath: string;
  sourcePath: string;
}

/**
 * Inventories and safely removes skills installed in global tool roots.
 * Project-relative roots are intentionally not part of this service.
 */
export class GlobalSkillService {
  private readonly undoRecords = new Map<string, UndoRecord>();

  constructor(private readonly deps: GlobalSkillServiceDependencies) {}

  scan(): GlobalSkillInventory {
    const settings = this.deps.settingsService.get();
    const centralRoot = resolveSkillsRoot(settings.centralSkillsRoot);
    const links = this.deps.linkService.list();
    const entriesByPath = new Map<string, GlobalSkillEntry>();
    const tools: GlobalSkillTool[] = [];

    for (const ide of this.deps.ideService.list()) {
      const roots = this.resolveRoots(ide, settings);
      const tool: GlobalSkillTool = {
        ideId: ide.id,
        ideName: ide.name,
        detected: roots.some((root) => root.exists),
        roots: roots.map(({ path: rootPath, exists, isConfigured }) => ({
          path: rootPath,
          exists,
          isConfigured,
        })),
        skills: [],
      };

      const toolEntryPaths = new Set<string>();
      for (const root of roots) {
        if (!root.exists) {
          continue;
        }

        for (const entryName of this.listDirectoryNames(root.path)) {
          const entryPath = path.resolve(root.path, entryName);
          const candidate = this.inspectCandidate(entryPath, entryName);
          if (!candidate) {
            continue;
          }

          const key = this.pathKey(entryPath);
          const existing = entriesByPath.get(key);
          const entry = existing || this.createEntry(
            entryPath,
            root.path,
            entryName,
            candidate.metadata,
            centralRoot,
            links,
          );

          this.mergeToolMetadata(entry, ide);
          if (!existing) {
            entriesByPath.set(key, entry);
          }
          if (!toolEntryPaths.has(key)) {
            tool.skills.push(entry);
            toolEntryPaths.add(key);
          }
        }
      }

      tools.push(tool);
    }

    for (const entry of entriesByPath.values()) {
      entry.sharedWith = entry.ideNames.length > 1 ? [...entry.ideNames] : [];
    }

    const entries = [...entriesByPath.values()];
    return {
      scannedAt: new Date().toISOString(),
      tools,
      totalSkills: entries.length,
      managedCount: entries.filter((entry) => entry.origin === 'managed').length,
      externalCount: entries.filter((entry) => entry.origin === 'external').length,
      brokenCount: entries.filter((entry) => entry.status === 'broken').length,
      protectedCount: entries.filter((entry) => entry.status === 'protected').length,
    };
  }

  async preview(id: string): Promise<GlobalSkillPreview> {
    const entry = this.findEntry(id);
    if (!entry) {
      throw new Error('Global skill not found');
    }

    const skillFilePath = path.join(entry.path, SKILL_FILE_NAME);
    let file: ReadSkillFileResult = { content: '', truncated: false };
    if (fs.existsSync(skillFilePath)) {
      try {
        file = this.readSkillFile(skillFilePath);
      } catch {
        file = { content: '', truncated: false };
      }
    }

    return {
      id: entry.id,
      name: entry.name,
      displayName: entry.displayName,
      description: entry.description,
      path: entry.path,
      rootPath: entry.rootPath,
      origin: entry.origin,
      status: entry.status,
      content: file.content,
      truncated: file.truncated,
    };
  }

  async remove(ids: string[]): Promise<GlobalSkillRemovalResult[]> {
    const inventory = this.scan();
    const entriesById = new Map<string, GlobalSkillEntry>();
    for (const tool of inventory.tools) {
      for (const entry of tool.skills) {
        entriesById.set(entry.id, entry);
      }
    }

    const results: GlobalSkillRemovalResult[] = [];
    for (const id of [...new Set(ids)]) {
      const entry = entriesById.get(id);
      if (!entry) {
        results.push({
          id,
          name: id,
          status: 'already-missing',
          canUndo: false,
          message: 'The global skill is no longer present.',
        });
        continue;
      }

      if (entry.status === 'protected' || entry.origin === 'central') {
        results.push({
          id: entry.id,
          name: entry.name,
          path: entry.path,
          status: 'blocked',
          canUndo: false,
          message: 'The central Skills Manager source is protected.',
        });
        continue;
      }

      if (entry.origin === 'managed' && (!entry.sourcePath || !this.isLinkEntry(entry.path))) {
        results.push({
          id: entry.id,
          name: entry.name,
          path: entry.path,
          status: 'blocked',
          canUndo: false,
          message: 'The managed entry is not a link and was left untouched for safety.',
        });
        continue;
      }

      if (!this.isCurrentGlobalEntry(entry, inventory)) {
        results.push({
          id: entry.id,
          name: entry.name,
          path: entry.path,
          status: 'blocked',
          canUndo: false,
          message: 'The global skill changed and must be scanned again.',
        });
        continue;
      }

      try {
        await this.deps.trashItem(entry.path);
        const undoToken = this.createUndoRecord(entry);
        results.push({
          id: entry.id,
          name: entry.name,
          path: entry.path,
          status: 'trashed',
          canUndo: Boolean(undoToken),
          ...(undoToken ? { undoToken } : {}),
        });
      } catch (error) {
        results.push({
          id: entry.id,
          name: entry.name,
          path: entry.path,
          status: 'failed',
          canUndo: false,
          message: this.errorMessage(error),
        });
      }
    }

    return results;
  }

  async undo(tokens: string[]): Promise<GlobalSkillUndoResult[]> {
    const inventory = this.scan();
    const results: GlobalSkillUndoResult[] = [];
    for (const token of [...new Set(tokens)]) {
      const record = this.undoRecords.get(token);
      if (!record) {
        results.push({
          token,
          status: 'expired',
          message: 'The undo window has expired.',
        });
        continue;
      }

      if (!this.isAllowedUndoPath(record, inventory)) {
        this.undoRecords.delete(token);
        results.push({
          token,
          path: record.path,
          status: 'failed',
          message: 'The original global skills root is no longer available.',
        });
        continue;
      }

      if (this.pathExists(record.path)) {
        this.undoRecords.delete(token);
        results.push({
          token,
          path: record.path,
          status: 'already-present',
          message: 'The global entry already exists at this path.',
        });
        continue;
      }

      try {
        const strategy = this.deps.settingsService.get().symlinkStrategy;
        const created = this.deps.symlinkService.createExclusive(
          record.sourcePath,
          record.path,
          strategy,
        );
        if (!created.success) {
          results.push({
            token,
            path: record.path,
            status: 'failed',
            message: created.error || 'The global link could not be restored.',
          });
          continue;
        }

        this.undoRecords.delete(token);
        results.push({ token, path: record.path, status: 'restored' });
      } catch (error) {
        results.push({
          token,
          path: record.path,
          status: 'failed',
          message: this.errorMessage(error),
        });
      }
    }

    return results;
  }

  private findEntry(id: string): GlobalSkillEntry | undefined {
    const inventory = this.scan();
    for (const tool of inventory.tools) {
      const entry = tool.skills.find((skill) => skill.id === id);
      if (entry) {
        return entry;
      }
    }
    return undefined;
  }

  private createUndoRecord(entry: GlobalSkillEntry): string | undefined {
    if (entry.origin !== 'managed' || !entry.sourcePath || !fs.existsSync(entry.sourcePath)) {
      return undefined;
    }

    const token = crypto.randomUUID();
    this.undoRecords.set(token, {
      path: entry.path,
      rootPath: entry.rootPath,
      sourcePath: entry.sourcePath,
    });
    const expiry = setTimeout(() => this.undoRecords.delete(token), UNDO_WINDOW_MS);
    expiry.unref?.();
    return token;
  }

  private pathExists(targetPath: string): boolean {
    try {
      fs.lstatSync(targetPath);
      return true;
    } catch {
      return false;
    }
  }

  private isAllowedUndoPath(record: UndoRecord, inventory: GlobalSkillInventory): boolean {
    return inventory.tools.some((tool) =>
      tool.roots.some((root) =>
        root.exists &&
        this.pathKey(root.path) === this.pathKey(record.rootPath) &&
        this.pathKey(path.dirname(record.path)) === this.pathKey(root.path),
      ),
    );
  }

  private resolveRoots(ide: IDEDefinition, settings: AppSettings): (ResolvedRoot & { exists: boolean })[] {
    const override = settings.ideRootOverrides?.[ide.id]?.trim();
    const templates = override
      ? [ensureSkillsRoot(override)]
      : ide.skillRootTemplates;
    const seen = new Set<string>();
    const roots: (ResolvedRoot & { exists: boolean })[] = [];

    for (const template of templates) {
      const rootPath = this.resolveTemplate(template);
      if (!rootPath) {
        continue;
      }
      const key = this.pathKey(rootPath);
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      roots.push({
        path: rootPath,
        exists: this.isRealDirectory(rootPath),
        isConfigured: true,
      });
    }

    return roots;
  }

  private resolveTemplate(template: string): string | null {
    const variables = [...template.matchAll(/%([^%]+)%|\$\{([^}]+)\}|\$([A-Za-z_][A-Za-z0-9_]*)/g)]
      .map((match) => match[1] || match[2] || match[3]);
    if (variables.some((name) => !process.env[name])) {
      return null;
    }

    const expanded = expandPath(template);
    return path.isAbsolute(expanded) && expanded !== '.' ? path.normalize(expanded) : null;
  }

  private listDirectoryNames(rootPath: string): string[] {
    try {
      return fs.readdirSync(rootPath, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() || this.isLinkEntry(path.join(rootPath, entry.name)))
        .map((entry) => entry.name)
        .sort((left, right) => left.localeCompare(right));
    } catch {
      return [];
    }
  }

  private inspectCandidate(candidatePath: string, name: string): { metadata: CandidateMetadata } | null {
    let stat: fs.Stats;
    try {
      stat = fs.lstatSync(candidatePath);
    } catch {
      return null;
    }

    const isLink = this.isLinkEntry(candidatePath, stat);
    if (!stat.isDirectory() && !isLink) {
      return null;
    }

    if (isLink && !fs.existsSync(candidatePath)) {
      return {
        metadata: {
          displayName: name,
          description: '',
          status: 'broken',
        },
      };
    }

    const skillFilePath = path.join(candidatePath, SKILL_FILE_NAME);
    if (!fs.existsSync(skillFilePath)) {
      return {
        metadata: {
          displayName: name,
          description: '',
          status: 'broken',
        },
      };
    }

    try {
      const file = this.readSkillFile(skillFilePath);
      const metadata = this.parseMetadata(file.content, name);
      return {
        metadata: {
          displayName: metadata.displayName,
          description: metadata.description,
          status: 'available',
        },
      };
    } catch {
      return {
        metadata: {
          displayName: name,
          description: '',
          status: 'broken',
        },
      };
    }
  }

  private createEntry(
    entryPath: string,
    rootPath: string,
    name: string,
    metadata: CandidateMetadata,
    centralRoot: string,
    links: Link[],
  ): GlobalSkillEntry {
    const central = this.isWithinOrEqual(entryPath, centralRoot);
    const managedLink = links.find(
      (link) => link.scope === 'global' && this.pathKey(link.destinationPath) === this.pathKey(entryPath),
    );

    return {
      id: this.createId(rootPath, name),
      name,
      displayName: metadata.displayName,
      description: metadata.description,
      path: entryPath,
      rootPath,
      sourcePath: managedLink?.sourcePath,
      origin: central ? 'central' : managedLink ? 'managed' : 'external',
      status: central ? 'protected' : metadata.status,
      ideIds: [],
      ideNames: [],
      sharedWith: [],
    };
  }

  private mergeToolMetadata(entry: GlobalSkillEntry, ide: IDEDefinition): void {
    if (!entry.ideIds.includes(ide.id)) {
      entry.ideIds.push(ide.id);
    }
    if (!entry.ideNames.includes(ide.name)) {
      entry.ideNames.push(ide.name);
    }
  }

  private isCurrentGlobalEntry(entry: GlobalSkillEntry, inventory: GlobalSkillInventory): boolean {
    const matching = inventory.tools
      .flatMap((tool) => tool.skills)
      .find((candidate) => candidate.id === entry.id && this.pathKey(candidate.path) === this.pathKey(entry.path));
    if (!matching) {
      return false;
    }

    return inventory.tools.some((tool) =>
      tool.roots.some((root) =>
        root.exists && this.pathKey(path.dirname(entry.path)) === this.pathKey(root.path),
      ),
    );
  }

  private readSkillFile(filePath: string): ReadSkillFileResult {
    const stat = fs.statSync(filePath);
    const bytesToRead = Math.min(stat.size, MAX_CONTENT_BYTES);
    const handle = fs.openSync(filePath, 'r');
    try {
      const buffer = Buffer.alloc(bytesToRead);
      const bytesRead = fs.readSync(handle, buffer, 0, bytesToRead, 0);
      return {
        content: buffer.subarray(0, bytesRead).toString('utf8'),
        truncated: stat.size > MAX_CONTENT_BYTES,
      };
    } finally {
      fs.closeSync(handle);
    }
  }

  private parseMetadata(content: string, fallbackName: string): { displayName: string; description: string } {
    const frontmatter = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!frontmatter) {
      return { displayName: fallbackName, description: '' };
    }

    const value = (field: string): string => {
      const match = frontmatter[1].match(new RegExp(`^${field}:\\s*(.*)$`, 'm'));
      return match?.[1]?.trim() || '';
    };

    return {
      displayName: value('displayName') || value('name') || fallbackName,
      description: value('description'),
    };
  }

  private isRealDirectory(targetPath: string): boolean {
    try {
      const stat = fs.lstatSync(targetPath);
      return stat.isDirectory() && !this.isLinkEntry(targetPath, stat);
    } catch {
      return false;
    }
  }

  private isLinkEntry(targetPath: string, stat?: fs.Stats): boolean {
    try {
      const entryStat = stat || fs.lstatSync(targetPath);
      if (entryStat.isSymbolicLink()) {
        return true;
      }
      if (process.platform === 'win32' && entryStat.isDirectory()) {
        try {
          fs.readlinkSync(targetPath);
          return true;
        } catch {
          return false;
        }
      }
      return false;
    } catch {
      return false;
    }
  }

  private isWithinOrEqual(targetPath: string, parentPath: string): boolean {
    const relative = path.relative(parentPath, targetPath);
    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
  }

  private pathKey(targetPath: string): string {
    const normalized = path.resolve(path.normalize(targetPath));
    return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
  }

  private createId(rootPath: string, name: string): string {
    return `global-skill-${crypto
      .createHash('sha256')
      .update(`${this.pathKey(rootPath)}\0${name}`, 'utf8')
      .digest('hex')}`;
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
