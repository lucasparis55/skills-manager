export type SkillStructure = 'folder-per-skill' | 'single-skill' | 'non-standard';

export interface ConflictResolution {
  strategy: 'skip' | 'rename' | 'overwrite';
  newName?: string;
}

export interface ImportResult {
  skillName: string;
  status: 'imported' | 'skipped' | 'renamed' | 'error';
  error?: string;
  originalName?: string;
  skipReason?: string;
}

export interface ImportProgress {
  current: number;
  total: number;
  currentSkillName: string;
  phase: 'fetching' | 'reading' | 'writing';
  percentComplete: number;
}

export interface ImportFileEntry {
  path: string;
  content: string;
}

export interface BinaryImportFileEntry {
  path: string;
  content: Buffer;
}
