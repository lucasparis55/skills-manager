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

export const GLOBAL_LINK_PROJECT_ID = '__global__';

export interface Link {
  id: string;
  skillId: string;
  projectId: string | null;
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
  projectId?: string | null;
  ideName: string;
  scope: 'global' | 'project';
}

export interface CreateMultipleLinksInput {
  skillIds: string[];
  projectId?: string | null;
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

export type LinkMigrationCandidateStatus = 'ready' | 'conflict' | 'blocked';

export interface LinkMigrationCandidate {
  linkId: string;
  skillId: string;
  skillName: string;
  ideId: string;
  ideName: string;
  sourcePath: string;
  currentPath: string;
  targetPath: string;
  status: LinkMigrationCandidateStatus;
  message?: string;
}

export interface LinkMigrationPreview {
  scannedAt: string;
  candidates: LinkMigrationCandidate[];
}

export type LinkMigrationResultStatus = 'migrated' | 'skipped' | 'failed';

export interface LinkMigrationResult extends Omit<LinkMigrationCandidate, 'status'> {
  status: LinkMigrationResultStatus;
}

export type SkillDistributionStatus = 'healthy' | 'broken' | 'legacy' | 'conflict' | 'unavailable';

export interface SkillDistributionDestination {
  linkId: string;
  skillId: string;
  skillName: string;
  ideId: string;
  ideName: string;
  scope: 'global' | 'project';
  projectId: string | null;
  projectName: string;
  sourcePath: string;
  destinationPath: string;
  expectedPath: string | null;
  status: SkillDistributionStatus;
  repairable: boolean;
  message?: string;
}

export interface SkillDistributionSummary {
  total: number;
  healthy: number;
  attention: number;
  blocked: number;
  repairable: number;
}

export interface SkillDistributionReport {
  checkedAt: string;
  skillId: string;
  skillName: string;
  sourcePath: string;
  destinations: SkillDistributionDestination[];
  summary: SkillDistributionSummary;
}

export type SkillDistributionRepairStatus = 'repaired' | 'blocked' | 'failed';

export interface SkillDistributionRepairResult extends Omit<SkillDistributionDestination, 'status' | 'repairable'> {
  status: SkillDistributionRepairStatus;
  previousPath?: string;
  message?: string;
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

export type GlobalSkillOrigin = 'managed' | 'external' | 'central';
export type GlobalSkillStatus = 'available' | 'broken' | 'protected';

export interface GlobalSkillRoot {
  path: string;
  exists: boolean;
  isConfigured: boolean;
}

export interface GlobalSkillEntry {
  id: string;
  name: string;
  displayName: string;
  description: string;
  path: string;
  rootPath: string;
  sourcePath?: string;
  origin: GlobalSkillOrigin;
  status: GlobalSkillStatus;
  ideIds: string[];
  ideNames: string[];
  sharedWith: string[];
}

export interface GlobalSkillTool {
  ideId: string;
  ideName: string;
  detected: boolean;
  roots: GlobalSkillRoot[];
  skills: GlobalSkillEntry[];
}

export interface GlobalSkillInventory {
  scannedAt: string;
  tools: GlobalSkillTool[];
  totalSkills: number;
  managedCount: number;
  externalCount: number;
  brokenCount: number;
  protectedCount: number;
}

export interface GlobalSkillPreview {
  id: string;
  name: string;
  displayName: string;
  description: string;
  path: string;
  rootPath: string;
  origin: GlobalSkillOrigin;
  status: GlobalSkillStatus;
  content: string;
  truncated: boolean;
}

export type GlobalSkillRemovalStatus =
  | 'trashed'
  | 'already-missing'
  | 'blocked'
  | 'failed';

export interface GlobalSkillRemovalResult {
  id: string;
  name: string;
  path?: string;
  status: GlobalSkillRemovalStatus;
  message?: string;
  canUndo: boolean;
  undoToken?: string;
}

export type GlobalSkillUndoStatus =
  | 'restored'
  | 'already-present'
  | 'expired'
  | 'failed';

export interface GlobalSkillUndoResult {
  token: string;
  path?: string;
  status: GlobalSkillUndoStatus;
  message?: string;
}

export type PluginInventoryStatus = 'cache-detected';

export interface PluginInventoryEntry {
  id: string;
  marketplace: string;
  name: string;
  displayName: string;
  version: string;
  description: string;
  bundlePath: string;
  manifestPath: string;
  status: PluginInventoryStatus;
}

export interface PluginInventory {
  scannedAt: string;
  rootPath: string;
  plugins: PluginInventoryEntry[];
}
