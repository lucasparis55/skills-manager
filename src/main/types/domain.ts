export interface Skill {
  id: string;
  name: string;
  displayName: string;
  description: string;
  version: string;
  format: 'markdown' | 'json' | 'folder';
  targetIDEs: string[];
  tags: string[];
  createdAt: string;
  updatedAt: string;
  sourcePath: string;
  metadata: Record<string, unknown>;
}

export interface Project {
  id: string;
  name: string;
  path: string;
  detectedIDEs: string[];
  addedAt: string;
  lastScanned: string;
  metadata: Record<string, unknown>;
}

export interface Link {
  id: string;
  skillId: string;
  projectId: string;
  ideName: string;
  scope: 'global' | 'project';
  sourcePath: string;
  destinationPath: string;
  status: 'linked' | 'broken' | 'conflict';
  createdAt: string;
}

export interface IDEDefinition {
  id: string;
  name: string;
  icon?: string;
  configFormat: 'json' | 'yaml' | 'markdown';
  mode: 'skills' | 'subagents' | 'rules';
  roots: IDERoots;
  skillRootTemplates: string[];
}

export interface IDERoots {
  primaryGlobal: string[];
  secondaryGlobal: string[];
  projectRelative: string[];
}

export interface ResolvedIDERoot {
  ideId: string;
  root: string;
  exists: boolean;
  isPrimary: boolean;
  isConfigured: boolean;
}

export interface AppSettings {
  centralSkillsRoot: string;
  checkForUpdates: boolean;
  autoScanProjects: boolean;
  symlinkStrategy: 'symlink' | 'junction' | 'auto';
  developerModeEnabled: boolean;
  theme: 'light' | 'dark' | 'system';
  lastProjectScanPath?: string;
  projectScanDepth: number;
  ideRootOverrides: Record<string, string>;
}

export interface PublicAppSettings extends AppSettings {
  hasGithubToken: boolean;
}

export interface DuplicateReport {
  hasDuplicate: boolean;
  existingPath?: string;
  existingType: 'global-skill' | 'project-skill' | 'symlink' | 'directory';
  severity: 'warning' | 'error' | 'info';
  message: string;
}

export interface CreateSkillInput {
  name: string;
  displayName: string;
  description: string;
  version?: string;
  format: 'markdown' | 'json' | 'folder';
  targetIDEs: string[];
  tags?: string[];
}

export interface UpdateSkillInput {
  displayName?: string;
  description?: string;
  version?: string;
  targetIDEs?: string[];
  tags?: string[];
}

export interface CreateLinkInput {
  skillId: string;
  projectId: string;
  ideName: string;
  scope: 'global' | 'project';
}

export interface CreateMultipleLinksInput {
  skillIds: string[];
  projectId: string;
  ideName: string;
  scope: 'global' | 'project';
}

export interface LinkCreationResult {
  skillId: string;
  skillName: string;
  status: 'created' | 'error' | 'skipped';
  error?: string;
  link?: Link;
}

export interface LinkCreationProgress {
  current: number;
  total: number;
  currentSkillName: string;
  percentComplete: number;
}

export interface DetectedSkillRoot {
  root: string;
  ideIds: string[];
  ideNames: string[];
}

export interface DuplicateOccurrence {
  path: string;
  name: string;
  contentHash: string;
  rootPaths: string[];
  ideIds: string[];
  ideNames: string[];
}

export interface DuplicateGroup {
  id: string;
  name: string;
  contentHash: string;
  occurrences: DuplicateOccurrence[];
}

export interface DuplicateScanResult {
  scannedAt: string;
  roots: DetectedSkillRoot[];
  groups: DuplicateGroup[];
}

export type DuplicateOperationAction = 'remove' | 'migrate';

export type DuplicateOperationStatus =
  | 'trashed'
  | 'migrated'
  | 'already-missing'
  | 'blocked'
  | 'failed';

export interface DuplicateOperationResult {
  action: DuplicateOperationAction;
  path: string;
  name: string;
  status: DuplicateOperationStatus;
  message?: string;
  centralPath?: string;
}
