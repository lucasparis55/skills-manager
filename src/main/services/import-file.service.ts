import fs from 'fs';
import os from 'os';
import path from 'path';
import { ImportPathService } from './import-path.service';

export interface ImportFileWrite {
  sourcePath: string;
  destinationPath: string;
  allowedRoot: string;
}

export interface ImportFileOperation {
  backupPath?: string;
  writtenPaths: string[];
  rollback: () => void;
}

export interface ImportFileServiceOptions {
  backupRoot?: string;
}

/** Applies staged file writes with preflight conflicts and a recoverable backup. */
export class ImportFileService {
  private readonly backupRoot: string;
  private readonly pathService = new ImportPathService();

  constructor(options: ImportFileServiceOptions = {}) {
    this.backupRoot = options.backupRoot || os.tmpdir();
  }

  apply(writes: ImportFileWrite[], options: { overwrite?: boolean } = {}): ImportFileOperation {
    const overwrite = options.overwrite === true;
    const normalized = writes.map((write) => ({
      ...write,
      destinationPath: this.pathService.assertSafeDestination(write.destinationPath, write.allowedRoot),
    }));
    const existing = normalized.filter((write) => fs.existsSync(write.destinationPath));

    if (!overwrite && existing.length > 0) {
      throw new Error(`Import conflict at ${existing[0].destinationPath}`);
    }

    let backupPath: string | undefined;
    if (existing.length > 0) {
      fs.mkdirSync(this.backupRoot, { recursive: true });
      backupPath = fs.mkdtempSync(path.join(this.backupRoot, '.skills-manager-backup-'));
    }
    const backups: Array<{ destinationPath: string; backupPath: string }> = [];
    const writtenPaths: string[] = [];

    try {
      for (let index = 0; index < normalized.length; index += 1) {
        const write = normalized[index];
        if (!fs.existsSync(write.sourcePath)) throw new Error(`Staged file not found: ${write.sourcePath}`);
        if (fs.existsSync(write.destinationPath)) {
          const backupFile = path.join(backupPath!, String(index));
          fs.cpSync(write.destinationPath, backupFile, { recursive: true });
          backups.push({ destinationPath: write.destinationPath, backupPath: backupFile });
          fs.rmSync(write.destinationPath, { recursive: true, force: true });
        }
        fs.mkdirSync(path.dirname(write.destinationPath), { recursive: true });
        fs.cpSync(write.sourcePath, write.destinationPath, { recursive: true });
        writtenPaths.push(write.destinationPath);
      }
    } catch (error) {
      this.restore(writtenPaths, backups);
      throw error;
    }

    return {
      backupPath,
      writtenPaths,
      rollback: () => this.restore(writtenPaths, backups),
    };
  }

  private restore(writtenPaths: string[], backups: Array<{ destinationPath: string; backupPath: string }>): void {
    for (const destinationPath of [...writtenPaths].reverse()) {
      if (fs.existsSync(destinationPath)) fs.rmSync(destinationPath, { recursive: true, force: true });
    }
    for (const backup of backups) {
      if (fs.existsSync(backup.backupPath)) {
        fs.mkdirSync(path.dirname(backup.destinationPath), { recursive: true });
        fs.cpSync(backup.backupPath, backup.destinationPath, { recursive: true });
      }
    }
  }
}
