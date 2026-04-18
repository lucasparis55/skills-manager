import fs from 'fs';
import path from 'path';
import { getSkillsRoot } from '../utils/paths';
import { SkillService } from './skill.service';
import { SettingsService } from './settings.service';
import type { BinaryImportFileEntry, ConflictResolution, ImportProgress, ImportResult } from '../types/import';
import type { DetectedZipSkill, ZipAnalyzeResult, ZipArchiveInfo, ZipFileEntry } from '../types/zip';

const yauzl = require('yauzl');

interface IndexedZipFile extends ZipFileEntry {
  content?: Buffer;
}

interface IndexedZipArchive {
  archiveInfo: ZipArchiveInfo;
  files: IndexedZipFile[];
}

/**
 * Zip Import Service - Handles importing skills from local ZIP archives
 */
export class ZipImportService {
  private settingsService: SettingsService;
  private cancelled = false;

  constructor(settingsService: SettingsService) {
    this.settingsService = settingsService;
  }

  private resolveSkillsRoot(): string {
    const configured = this.settingsService.get().centralSkillsRoot;
    if (typeof configured === 'string' && configured.trim().length > 0) {
      return configured;
    }
    return getSkillsRoot();
  }

  private createSkillService(): SkillService {
    return new SkillService(this.resolveSkillsRoot());
  }

  private assertValidFinalName(name: string): void {
    if (!/^[A-Za-z0-9._-]{1,64}$/.test(name) || name === '.' || name === '..' || name.includes('/') || name.includes('\\')) {
      throw new Error(`Invalid final skill name "${name}"`);
    }
  }

  async analyze(zipPath: string): Promise<ZipAnalyzeResult> {
    const archive = await this.readArchive(zipPath, false);
    const skills = this.detectSkillStructures(archive.files, archive.archiveInfo);
    return { archiveInfo: archive.archiveInfo, skills };
  }

  checkConflicts(skillNames: string[]): Record<string, boolean> {
    const skillService = this.createSkillService();
    const conflicts: Record<string, boolean> = {};

    for (const name of skillNames) {
      conflicts[name] = skillService.exists(name);
    }

    return conflicts;
  }

  cancelImport(): void {
    this.cancelled = true;
  }

  async importSkills(
    zipPath: string,
    skills: DetectedZipSkill[],
    resolutions: Record<string, ConflictResolution>,
    onProgress?: (progress: ImportProgress) => void,
  ): Promise<ImportResult[]> {
    this.cancelled = false;
    const results: ImportResult[] = [];
    const archive = await this.readArchive(zipPath, true);
    const filesByArchivePath = new Map<string, IndexedZipFile>(
      archive.files.map((file) => [file.archivePath, file]),
    );
    const skillService = this.createSkillService();
    const total = skills.length;

    for (let i = 0; i < skills.length; i += 1) {
      const skill = skills[i];

      if (this.cancelled) {
        results.push({
          skillName: skill.name,
          status: 'skipped',
          error: 'Import cancelled',
        });
        continue;
      }

      const resolution = resolutions[skill.name];
      if (resolution?.strategy === 'skip') {
        results.push({
          skillName: skill.name,
          status: 'skipped',
          skipReason: 'User chose to skip this skill due to a naming conflict.',
        });
        continue;
      }

      onProgress?.({
        current: i + 1,
        total,
        currentSkillName: skill.name,
        phase: 'reading',
        percentComplete: Math.round((i / total) * 100),
      });

      try {
        const importFiles: BinaryImportFileEntry[] = [];

        for (const file of skill.files) {
          const archivedFile = filesByArchivePath.get(file.archivePath);
          if (!archivedFile?.content) {
            throw new Error(`Could not read "${file.path}" from the archive`);
          }

          const relativePath = skill.sourcePath
            ? file.path.substring(skill.sourcePath.length + 1)
            : file.path;

          if (relativePath) {
            importFiles.push({ path: relativePath, content: archivedFile.content });
          }
        }

        if (importFiles.length === 0) {
          throw new Error(`No importable files were found for "${skill.name}"`);
        }

        onProgress?.({
          current: i + 1,
          total,
          currentSkillName: skill.name,
          phase: 'writing',
          percentComplete: Math.round(((i + 0.5) / total) * 100),
        });

        let finalName = skill.name;
        if (resolution?.strategy === 'rename') {
          finalName = this.slugifyName(resolution.newName || '');
        }
        this.assertValidFinalName(finalName);

        const exists = skillService.exists(finalName);
        const wantsOverwrite = resolution?.strategy === 'overwrite';
        if (exists && !wantsOverwrite) {
          throw new Error(`Skill "${finalName}" already exists. Choose overwrite or a different rename.`);
        }

        skillService.importFromArchiveFiles(
          finalName,
          importFiles,
          {
            sourceArchive: archive.archiveInfo.fileName,
            importedAt: new Date().toISOString(),
            displayName: skill.displayName,
            description: skill.description,
          },
          { overwrite: wantsOverwrite },
        );

        results.push({
          skillName: finalName,
          status: resolution?.strategy === 'rename' ? 'renamed' : 'imported',
          originalName: resolution?.strategy === 'rename' ? skill.name : undefined,
        });
      } catch (err: any) {
        results.push({
          skillName: skill.name,
          status: 'error',
          error: err.message || 'Unknown error during import',
        });
      }

      onProgress?.({
        current: i + 1,
        total,
        currentSkillName: skill.name,
        phase: 'writing',
        percentComplete: Math.round(((i + 1) / total) * 100),
      });
    }

    return results;
  }

  private async readArchive(zipPath: string, includeContents: boolean): Promise<IndexedZipArchive> {
    await fs.promises.access(zipPath, fs.constants.R_OK);

    const rawFiles = await this.readZipEntries(zipPath, includeContents);
    const { rootPrefix, files } = this.normalizeRootPrefix(rawFiles);

    return {
      archiveInfo: {
        zipPath,
        fileName: path.basename(zipPath),
        fileCount: files.length,
        rootPrefix: rootPrefix || undefined,
      },
      files,
    };
  }

  private async readZipEntries(zipPath: string, includeContents: boolean): Promise<IndexedZipFile[]> {
    return new Promise((resolve, reject) => {
      yauzl.open(zipPath, { lazyEntries: true, autoClose: true }, (openError: Error | null, zipfile: any) => {
        if (openError || !zipfile) {
          reject(openError || new Error('Failed to open ZIP archive'));
          return;
        }

        const files: IndexedZipFile[] = [];
        let settled = false;

        const fail = (error: Error) => {
          if (settled) return;
          settled = true;
          try {
            zipfile.close();
          } catch {
            // Ignore close errors while propagating the original failure.
          }
          reject(error);
        };

        zipfile.on('error', fail);
        zipfile.on('end', () => {
          if (settled) return;
          settled = true;
          resolve(files);
        });

        zipfile.on('entry', async (entry: any) => {
          try {
            const processed = await this.processEntry(zipfile, entry, includeContents);
            if (processed) {
              files.push(processed);
            }
            zipfile.readEntry();
          } catch (error: any) {
            fail(error instanceof Error ? error : new Error(String(error)));
          }
        });

        zipfile.readEntry();
      });
    });
  }

  private async processEntry(zipfile: any, entry: any, includeContents: boolean): Promise<IndexedZipFile | null> {
    if (this.isDirectoryEntry(entry) || this.isSymlinkEntry(entry)) {
      return null;
    }

    const archivePath = this.sanitizeArchivePath(entry.fileName);
    if (!archivePath || this.isExcludedPath(archivePath)) {
      return null;
    }

    const content = includeContents
      ? await this.readEntryContent(zipfile, entry)
      : undefined;

    return {
      archivePath,
      path: archivePath,
      size: entry.uncompressedSize || 0,
      content,
    };
  }

  private readEntryContent(zipfile: any, entry: any): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      zipfile.openReadStream(entry, (error: Error | null, stream: NodeJS.ReadableStream | null) => {
        if (error || !stream) {
          reject(error || new Error(`Failed to read "${entry.fileName}" from the archive`));
          return;
        }

        const chunks: Buffer[] = [];
        stream.on('data', (chunk: Buffer | string) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });
        stream.once('error', reject);
        stream.once('end', () => resolve(Buffer.concat(chunks)));
      });
    });
  }

  private isDirectoryEntry(entry: any): boolean {
    return typeof entry.fileName === 'string' && entry.fileName.endsWith('/');
  }

  private isSymlinkEntry(entry: any): boolean {
    const mode = ((entry.externalFileAttributes || 0) >>> 16) & 0o170000;
    return mode === 0o120000;
  }

  private sanitizeArchivePath(fileName: string): string | null {
    if (typeof fileName !== 'string' || fileName.trim().length === 0) {
      return null;
    }

    const normalizedSeparators = fileName.replace(/\\/g, '/').replace(/^\.\/+/, '');
    if (normalizedSeparators.startsWith('/') || /^[A-Za-z]:\//.test(normalizedSeparators)) {
      return null;
    }
    if (normalizedSeparators.split('/').some((part) => part === '..')) {
      return null;
    }

    const normalized = path.posix.normalize(normalizedSeparators);
    if (!normalized || normalized === '.' || normalized.startsWith('../') || normalized.includes('/../')) {
      return null;
    }

    return normalized;
  }

  private isExcludedPath(filePath: string): boolean {
    const parts = filePath.split('/');
    const basename = parts[parts.length - 1];
    return parts.includes('__MACOSX') || basename === '.DS_Store' || basename === 'Thumbs.db';
  }

  private normalizeRootPrefix(files: IndexedZipFile[]): { rootPrefix: string; files: IndexedZipFile[] } {
    if (files.length === 0) {
      return { rootPrefix: '', files: [] };
    }

    const firstSegments = files.map((file) => file.path.split('/'));
    const commonSegment = firstSegments[0][0];
    const shouldStrip = commonSegment
      && firstSegments.every((segments) => segments.length > 1 && segments[0] === commonSegment);

    if (!shouldStrip) {
      return { rootPrefix: '', files };
    }

    return {
      rootPrefix: commonSegment,
      files: files.map((file) => ({
        ...file,
        path: file.path.substring(commonSegment.length + 1),
      })),
    };
  }

  private detectSkillStructures(files: IndexedZipFile[], archiveInfo: ZipArchiveInfo): DetectedZipSkill[] {
    const skillMdFiles = files.filter((file) => file.path === 'SKILL.md' || file.path.endsWith('/SKILL.md'));

    if (skillMdFiles.length === 0) {
      return [this.createSingleSkill(files, archiveInfo, false)];
    }

    const rootSkillMd = skillMdFiles.find((file) => file.path === 'SKILL.md');
    if (skillMdFiles.length === 1 && rootSkillMd) {
      return [this.createSingleSkill(files, archiveInfo, true)];
    }

    return this.detectFolderPerSkill(skillMdFiles, files, archiveInfo);
  }

  private detectFolderPerSkill(
    skillMdFiles: IndexedZipFile[],
    files: IndexedZipFile[],
    archiveInfo: ZipArchiveInfo,
  ): DetectedZipSkill[] {
    const skillDirs = new Map<string, IndexedZipFile[]>();

    for (const skillMdFile of skillMdFiles) {
      const parentPath = skillMdFile.path.includes('/')
        ? skillMdFile.path.substring(0, skillMdFile.path.lastIndexOf('/'))
        : '';

      if (!skillDirs.has(parentPath)) {
        skillDirs.set(parentPath, []);
      }
      skillDirs.get(parentPath)!.push(skillMdFile);
    }

    const skills: DetectedZipSkill[] = [];

    for (const dirPath of skillDirs.keys()) {
      const prefix = dirPath ? `${dirPath}/` : '';
      const dirFiles = files.filter((file) => file.path.startsWith(prefix) && file.path !== prefix);
      const rawName = dirPath ? dirPath.split('/').pop()! : archiveInfo.rootPrefix || path.basename(archiveInfo.fileName, '.zip');

      skills.push({
        name: this.slugifyName(rawName),
        displayName: this.humanizeName(rawName),
        description: '',
        sourcePath: dirPath,
        hasSkillMd: true,
        fileCount: dirFiles.length,
        files: dirFiles.map((file) => ({
          path: file.path,
          archivePath: file.archivePath,
          size: file.size,
        })),
        structure: 'folder-per-skill',
        archiveInfo,
      });
    }

    return skills;
  }

  private createSingleSkill(
    files: IndexedZipFile[],
    archiveInfo: ZipArchiveInfo,
    hasSkillMd: boolean,
  ): DetectedZipSkill {
    const baseName = archiveInfo.rootPrefix || path.basename(archiveInfo.fileName, '.zip');

    return {
      name: this.slugifyName(baseName),
      displayName: this.humanizeName(baseName),
      description: '',
      sourcePath: '',
      hasSkillMd,
      fileCount: files.length,
      files: files.map((file) => ({
        path: file.path,
        archivePath: file.archivePath,
        size: file.size,
      })),
      structure: hasSkillMd ? 'single-skill' : 'non-standard',
      archiveInfo,
    };
  }

  private slugifyName(name: string): string {
    return name
      .toLowerCase()
      .replace(/\.zip$/i, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .substring(0, 64);
  }

  private humanizeName(name: string): string {
    return name
      .replace(/\.zip$/i, '')
      .replace(/[-_]/g, ' ')
      .replace(/\b\w/g, (char) => char.toUpperCase())
      .trim();
  }
}
