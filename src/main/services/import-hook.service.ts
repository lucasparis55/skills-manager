import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { ImportPathService } from './import-path.service';
import { ImportFileService } from './import-file.service';
import type { StagedImport } from './import-staging.service';
import type { ImportActivationPreview, ImportComponent, ImportTarget } from '../types/import';

export interface HookInstallation {
  componentId: string;
  targetId: string;
  installedPath: string;
  manifestContent: string;
  commandRoot: string;
  backupPath?: string;
  preview: ImportActivationPreview;
}

export interface HookInstallRequest {
  component: ImportComponent;
  target: ImportTarget;
  stagedRoot: string;
  destinationPath: string;
  manifestContent: string;
  commandRoot?: string;
  overwrite?: boolean;
  backupRoot?: string;
}

export interface HookActivationApproval {
  contentSha256: string;
  events: string[];
}

/** Keeps hook installation and activation as two separate, auditable operations. */
export class ImportHookService {
  private readonly pathService = new ImportPathService();

  async installDisabled(request: HookInstallRequest): Promise<HookInstallation> {
    const manifest = this.parseManifest(request.manifestContent);
    const destination = this.pathService.assertSafeDestination(request.destinationPath, request.target.rootPath);
    const commandRoot = this.pathService.assertSafeDestination(request.commandRoot || request.target.rootPath, request.target.rootPath);
    fs.mkdirSync(destination, { recursive: true });

    const writes = request.component.files.map((file) => {
      const source = this.pathService.resolveInside(request.stagedRoot, file.path);
      if (!fs.existsSync(source)) {
        throw new Error(`Staged hook file is missing: ${file.path}`);
      }
      const targetFile = path.join(destination, path.basename(file.path));
      this.pathService.assertSafeDestination(targetFile, destination);
      return { sourcePath: source, destinationPath: targetFile, allowedRoot: destination };
    });
    const operation = new ImportFileService({ backupRoot: request.backupRoot }).apply(writes, {
      overwrite: request.overwrite === true,
    });

    const preview = this.createPreview(request, manifest, destination, commandRoot);
    return {
      componentId: request.component.id,
      targetId: request.target.id,
      installedPath: destination,
      manifestContent: request.manifestContent,
      commandRoot,
      backupPath: operation.backupPath,
      rollback: operation.rollback,
      preview,
    };
  }

  activate(installation: HookInstallation, approval: HookActivationApproval): void {
    if (approval.contentSha256 !== installation.preview.contentSha256
      || !this.sameEvents(approval.events, installation.preview.events)) {
      throw new Error('Hook activation approval does not match the reviewed content or events.');
    }

    const configPath = installation.preview.configPath;
    const config = this.readConfig(configPath);
    const backupPath = `${configPath}.bak`;
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(backupPath, JSON.stringify(config, null, 2), 'utf8');
    const hooks = this.ensureObject(config, 'hooks');
    const command = this.rewriteCommand(installation.preview.command, installation.commandRoot);

    for (const event of installation.preview.events) {
      const entries = Array.isArray(hooks[event]) ? hooks[event] as unknown[] : [];
      const alreadyActive = entries.some((entry) => this.entryContainsCommand(entry, command));
      if (!alreadyActive) {
        entries.push({ hooks: [{ type: 'command', command }] });
      }
      hooks[event] = entries;
    }

    this.writeJsonAtomically(configPath, config);
  }

  deactivate(installation: HookInstallation): void {
    const configPath = installation.preview.configPath;
    if (!fs.existsSync(configPath)) return;
    const config = this.readConfig(configPath);
    const hooks = config.hooks;
    if (!hooks || typeof hooks !== 'object' || Array.isArray(hooks)) return;
    const command = this.rewriteCommand(installation.preview.command, installation.commandRoot);

    for (const [event, value] of Object.entries(hooks as Record<string, unknown>)) {
      if (!Array.isArray(value)) continue;
      const filtered = value.filter((entry) => !this.entryContainsCommand(entry, command));
      if (filtered.length === 0) delete (hooks as Record<string, unknown>)[event];
      else (hooks as Record<string, unknown>)[event] = filtered;
    }
    this.writeJsonAtomically(configPath, config);
  }

  private createPreview(
    request: HookInstallRequest,
    manifest: Record<string, unknown>,
    destination: string,
    commandRoot: string,
  ): ImportActivationPreview {
    const events = Object.keys(manifest.hooks && typeof manifest.hooks === 'object' && !Array.isArray(manifest.hooks)
      ? manifest.hooks as Record<string, unknown>
      : {});
    const command = this.findCommand(manifest.hooks) || '';
    const configPath = request.target.hookConfigPath || path.join(request.target.rootPath, 'settings.json');
    const active = fs.existsSync(configPath) && this.entryIsActive(configPath, this.rewriteCommand(command, commandRoot));
    return {
      componentId: request.component.id,
      targetId: request.target.id,
      hookName: request.component.displayName,
      events,
      command,
      content: request.manifestContent,
      contentSha256: crypto.createHash('sha256').update(request.manifestContent).digest('hex'),
      configPath,
      currentlyActive: active,
    };
  }

  private parseManifest(content: string): Record<string, unknown> {
    try {
      const parsed: unknown = JSON.parse(content);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object');
      return parsed as Record<string, unknown>;
    } catch {
      throw new Error('Hook manifest is not valid JSON and cannot be activated safely.');
    }
  }

  private findCommand(value: unknown): string | undefined {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const record = value as Record<string, unknown>;
      if (record.type === 'command' && typeof record.command === 'string') return record.command;
      for (const child of Object.values(record)) {
        const found = this.findCommand(child);
        if (found) return found;
      }
    }
    if (Array.isArray(value)) {
      for (const child of value) {
        const found = this.findCommand(child);
        if (found) return found;
      }
    }
    return undefined;
  }

  private rewriteCommand(command: string, installedPath: string): string {
    return command.replace(/\$\{CLAUDE_PLUGIN_ROOT\}/g, installedPath);
  }

  private readConfig(configPath: string): Record<string, any> {
    if (!fs.existsSync(configPath)) return {};
    try {
      const parsed: unknown = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object');
      return parsed as Record<string, any>;
    } catch {
      throw new Error(`Hook target configuration is invalid JSON: ${configPath}`);
    }
  }

  private ensureObject(record: Record<string, any>, key: string): Record<string, any> {
    if (!record[key] || typeof record[key] !== 'object' || Array.isArray(record[key])) record[key] = {};
    return record[key] as Record<string, any>;
  }

  private writeJsonAtomically(filePath: string, value: unknown): void {
    const temporary = `${filePath}.skills-manager-${process.pid}-${Date.now()}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(value, null, 2), 'utf8');
    fs.renameSync(temporary, filePath);
  }

  private entryContainsCommand(value: unknown, command: string): boolean {
    if (typeof value === 'string') return value === command;
    if (Array.isArray(value)) return value.some((entry) => this.entryContainsCommand(entry, command));
    if (value && typeof value === 'object') return Object.values(value).some((entry) => this.entryContainsCommand(entry, command));
    return false;
  }

  private entryIsActive(configPath: string, command: string): boolean {
    try {
      const config = this.readConfig(configPath);
      return this.entryContainsCommand(config.hooks, command);
    } catch {
      return false;
    }
  }

  private sameEvents(left: string[], right: string[]): boolean {
    return [...new Set(left)].sort().join('\n') === [...new Set(right)].sort().join('\n');
  }
}
