import type { ConflictResolution, ImportProgress, ImportResult, SkillStructure } from './import';

export type { ConflictResolution, ImportProgress, ImportResult, SkillStructure };

export interface ZipArchiveInfo {
  zipPath: string;
  fileName: string;
  fileCount: number;
  rootPrefix?: string;
}

export interface ZipFileEntry {
  path: string;
  archivePath: string;
  size: number;
}

export interface DetectedZipSkill {
  name: string;
  displayName: string;
  description: string;
  sourcePath: string;
  hasSkillMd: boolean;
  fileCount: number;
  files: ZipFileEntry[];
  structure: SkillStructure;
  archiveInfo: ZipArchiveInfo;
}

export interface ZipAnalyzeResult {
  archiveInfo: ZipArchiveInfo;
  skills: DetectedZipSkill[];
}
