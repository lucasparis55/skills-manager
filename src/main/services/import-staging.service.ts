import fs from 'fs';
import path from 'path';
import { ImportPathService } from './import-path.service';
import { getAppDataDir } from '../utils/paths';
import type { ImportComponent, ImportSourceFile } from '../types/import';

export interface StagedImportFile {
  path: string;
  size: number;
  sha: string;
}

export interface StagedImport {
  rootPath: string;
  componentId: string;
  files: StagedImportFile[];
  totalBytes: number;
}

export interface ImportStagingServiceOptions {
  tempRoot?: string;
  maxFileBytes?: number;
  maxTotalBytes?: number;
}

export type ImportFileFetcher = (file: ImportSourceFile) => Promise<Buffer | string>;

/** Downloads selected files into an isolated temporary tree before any target is touched. */
export class ImportStagingService {
  private readonly tempRoot: string;
  private readonly maxFileBytes: number;
  private readonly maxTotalBytes: number;
  private readonly pathService = new ImportPathService();

  constructor(options: ImportStagingServiceOptions = {}) {
    this.tempRoot = options.tempRoot || path.join(getAppDataDir(), 'imports');
    this.maxFileBytes = options.maxFileBytes || 10 * 1024 * 1024;
    this.maxTotalBytes = options.maxTotalBytes || 50 * 1024 * 1024;
  }

  async stage(component: ImportComponent, fetchFile: ImportFileFetcher, importId?: string): Promise<StagedImport> {
    const sourceRoot = importId
      ? path.join(this.tempRoot, this.safeImportId(importId), 'source')
      : this.tempRoot;
    fs.mkdirSync(sourceRoot, { recursive: true });
    const rootPath = fs.mkdtempSync(path.join(sourceRoot, 'component-'));
    const files: StagedImportFile[] = [];
    let totalBytes = 0;

    try {
      for (const file of this.uniqueFiles(component.files)) {
        const content = await fetchFile(file);
        const buffer = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8');
        if (buffer.byteLength > this.maxFileBytes) {
          throw new Error(`File "${file.path}" exceeds the import size limit.`);
        }
        totalBytes += buffer.byteLength;
        if (totalBytes > this.maxTotalBytes) {
          throw new Error(`Component "${component.displayName}" exceeds the import size limit.`);
        }

        const destination = this.pathService.resolveInside(rootPath, file.path);
        this.pathService.assertSafeDestination(destination, rootPath);
        fs.mkdirSync(path.dirname(destination), { recursive: true });
        fs.writeFileSync(destination, buffer);
        files.push({ path: file.path, size: buffer.byteLength, sha: file.sha });
      }

      if (files.length === 0) {
        throw new Error(`Component "${component.displayName}" has no files to stage.`);
      }

      return { rootPath, componentId: component.id, files, totalBytes };
    } catch (error) {
      this.cleanup({ rootPath, componentId: component.id, files, totalBytes });
      throw error;
    }
  }

  cleanup(staged: StagedImport): void {
    if (fs.existsSync(staged.rootPath)) {
      fs.rmSync(staged.rootPath, { recursive: true, force: true });
    }
  }

  private uniqueFiles(files: ImportSourceFile[]): ImportSourceFile[] {
    const byPath = new Map<string, ImportSourceFile>();
    for (const file of files) {
      const normalized = ImportPathService.normalizeRepositoryPath(file.path);
      if (!byPath.has(normalized)) {
        byPath.set(normalized, { ...file, path: normalized });
      }
    }
    return [...byPath.values()];
  }

  private safeImportId(importId: string): string {
    if (!/^[A-Za-z0-9._-]{1,128}$/.test(importId)) {
      throw new Error('Invalid import staging identifier.');
    }
    return importId;
  }
}
