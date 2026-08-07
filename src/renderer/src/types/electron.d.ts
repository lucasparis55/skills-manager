// Type declarations for the Electron IPC API exposed via preload script

declare const __APP_VERSION__: string;

interface SkillFileEntry {
  path: string;
  name: string;
  isDirectory: boolean;
  size: number;
}

interface Link {
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

interface CreateLinkInput {
  skillId: string;
  projectId?: string | null;
  ideName: string;
  scope: 'global' | 'project';
}

interface CreateMultipleLinksInput {
  skillIds: string[];
  projectId?: string | null;
  ideName: string;
  scope: 'global' | 'project';
}

interface LinkCreationResult {
  skillId: string;
  skillName: string;
  status: 'created' | 'error' | 'skipped';
  error?: string;
  link?: Link;
}

interface LinkCreationProgress {
  current: number;
  total: number;
  currentSkillName: string;
  percentComplete: number;
}

type SkillDistributionStatus = 'healthy' | 'broken' | 'legacy' | 'conflict' | 'unavailable';

interface SkillDistributionDestination {
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

interface SkillDistributionSummary {
  total: number;
  healthy: number;
  attention: number;
  blocked: number;
  repairable: number;
}

interface SkillDistributionReport {
  checkedAt: string;
  skillId: string;
  skillName: string;
  sourcePath: string;
  destinations: SkillDistributionDestination[];
  summary: SkillDistributionSummary;
}

interface SkillDistributionRepairResult extends Omit<SkillDistributionDestination, 'status' | 'repairable'> {
  status: 'repaired' | 'blocked' | 'failed';
  previousPath?: string;
  message?: string;
}

interface LinkMigrationCandidate {
  linkId: string;
  skillId: string;
  skillName: string;
  ideId: string;
  ideName: string;
  sourcePath: string;
  currentPath: string;
  targetPath: string;
  status: 'ready' | 'conflict' | 'blocked';
  message?: string;
}

interface LinkMigrationPreview {
  scannedAt: string;
  candidates: LinkMigrationCandidate[];
}

interface LinkMigrationResult extends Omit<LinkMigrationCandidate, 'status'> {
  status: 'migrated' | 'skipped' | 'failed';
}

interface SkillsAPI {
  list: () => Promise<any[]>;
  get: (id: string) => Promise<any>;
  create: (input: any) => Promise<any>;
  update: (id: string, input: any) => Promise<any>;
  delete: (id: string) => Promise<any>;
  scan: () => Promise<any[]>;
  getContent: (id: string) => Promise<string>;
  saveContent: (id: string, content: string) => Promise<any>;
  listFiles: (id: string) => Promise<SkillFileEntry[]>;
  readFile: (id: string, filePath: string) => Promise<string>;
  writeFile: (id: string, filePath: string, content: string) => Promise<any>;
  deleteFile: (id: string, filePath: string) => Promise<any>;
  getPath: (id: string) => Promise<string>;
  openFolder: (id: string) => Promise<any>;
  checkDistribution: (id: string) => Promise<SkillDistributionReport>;
  repairDistribution: (skillId: string, linkIds: string[]) => Promise<SkillDistributionRepairResult[]>;
}

interface ProjectsAPI {
  list: () => Promise<any[]>;
  add: (path: string) => Promise<any>;
  remove: (id: string) => Promise<any>;
  scan: (rootPath?: string, maxDepth?: number) => Promise<any[]>;
}

interface LinksAPI {
  list: () => Promise<Link[]>;
  previewMigration: () => Promise<LinkMigrationPreview>;
  migrate: (linkIds: string[]) => Promise<LinkMigrationResult[]>;
  create: (input: CreateLinkInput) => Promise<Link>;
  createMultiple: (input: CreateMultipleLinksInput) => Promise<LinkCreationResult[]>;
  onCreateProgress: (callback: (progress: LinkCreationProgress) => void) => () => void;
  remove: (id: string) => Promise<{ success: boolean }>;
  removeMultiple: (ids: string[]) => Promise<{ id: string; success: boolean }[]>;
  verify: (id: string) => Promise<{ valid: boolean; link: Link }>;
  verifyAll: () => Promise<Link[]>;
}

interface IDEsAPI {
  list: () => Promise<any[]>;
  detectRoots: () => Promise<any[]>;
}

interface DetectionAPI {
  checkDuplicates: (skillId: string, projectId: string, ideId: string) => Promise<any>;
}

interface DetectedSkillRoot {
  root: string;
  ideIds: string[];
  ideNames: string[];
}

interface DuplicateOccurrence {
  path: string;
  name: string;
  contentHash: string;
  rootPaths: string[];
  ideIds: string[];
  ideNames: string[];
}

interface DuplicateGroup {
  id: string;
  name: string;
  contentHash: string;
  occurrences: DuplicateOccurrence[];
}

interface DuplicateScanResult {
  scannedAt: string;
  roots: DetectedSkillRoot[];
  groups: DuplicateGroup[];
}

type DuplicateOperationAction = 'remove' | 'migrate';
type DuplicateOperationStatus =
  | 'trashed'
  | 'migrated'
  | 'already-missing'
  | 'blocked'
  | 'failed';

interface DuplicateOperationResult {
  action: DuplicateOperationAction;
  path: string;
  name: string;
  status: DuplicateOperationStatus;
  message?: string;
  centralPath?: string;
}

interface GlobalSkillRoot {
  path: string;
  exists: boolean;
  isConfigured: boolean;
}

type GlobalSkillOrigin = 'managed' | 'external' | 'central';
type GlobalSkillStatus = 'available' | 'broken' | 'protected';

interface GlobalSkillEntry {
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

interface GlobalSkillTool {
  ideId: string;
  ideName: string;
  detected: boolean;
  roots: GlobalSkillRoot[];
  skills: GlobalSkillEntry[];
}

interface GlobalSkillInventory {
  scannedAt: string;
  tools: GlobalSkillTool[];
  totalSkills: number;
  managedCount: number;
  externalCount: number;
  brokenCount: number;
  protectedCount: number;
}

interface GlobalSkillPreview {
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

interface GlobalSkillRemovalResult {
  id: string;
  name: string;
  path?: string;
  status: 'trashed' | 'already-missing' | 'blocked' | 'failed';
  message?: string;
  canUndo: boolean;
  undoToken?: string;
}

interface GlobalSkillUndoResult {
  token: string;
  path?: string;
  status: 'restored' | 'already-present' | 'expired' | 'failed';
  message?: string;
}

type PluginInventoryStatus = 'bundled' | 'cache-detected' | 'protected' | 'invalid';
type PluginComponentKind = 'skill' | 'app' | 'mcp-server';
type PluginComponentStatus =
  | 'available'
  | 'missing'
  | 'invalid-reference'
  | 'external-symlink'
  | 'invalid-manifest';

interface PluginComponentProvenance {
  pluginId: string;
  marketplace: string;
  pluginName: string;
  version: string;
}

interface PluginComponent {
  id: string;
  kind: PluginComponentKind;
  name: string;
  reference: string;
  status: PluginComponentStatus;
  provenance: PluginComponentProvenance;
  resolvedPath?: string;
  reason?: string;
}

interface PluginComponentCounts {
  skills: number;
  apps: number;
  mcpServers: number;
}

interface PluginInventoryVersion {
  id: string;
  version: string;
  author: string;
  description: string;
  category: string;
  capabilities: string[];
  bundlePath: string;
  manifestPath: string;
  status: PluginInventoryStatus;
  components: PluginComponent[];
  componentCounts: PluginComponentCounts;
  issues: string[];
}

interface PluginInventoryManagement {
  uninstall: 'unavailable';
}

interface PluginInventoryPlugin {
  id: string;
  marketplace: string;
  name: string;
  displayName: string;
  author: string;
  description: string;
  category: string;
  capabilities: string[];
  status: PluginInventoryStatus;
  versions: PluginInventoryVersion[];
  componentCounts: PluginComponentCounts;
  management: PluginInventoryManagement;
  issues: string[];
}

interface PluginInventoryInvalidEntry {
  id: string;
  marketplace: string;
  name: string;
  version: string;
  bundlePath: string;
  manifestPath: string;
  status: 'invalid';
  reason: string;
}

interface PluginInventory {
  scannedAt: string;
  rootPath: string;
  plugins: PluginInventoryPlugin[];
  invalidEntries: PluginInventoryInvalidEntry[];
}

interface PluginManifestPreview {
  versionId: string;
  version: string;
  manifestPath: string;
  content: string;
}

interface DuplicatesAPI {
  scan: () => Promise<DuplicateScanResult>;
  remove: (paths: string[]) => Promise<DuplicateOperationResult[]>;
  migrate: (paths: string[]) => Promise<DuplicateOperationResult[]>;
}

interface GlobalSkillsAPI {
  scan: () => Promise<GlobalSkillInventory>;
  preview: (id: string) => Promise<GlobalSkillPreview>;
  remove: (ids: string[]) => Promise<GlobalSkillRemovalResult[]>;
  undo: (tokens: string[]) => Promise<GlobalSkillUndoResult[]>;
}

interface PluginsAPI {
  scan: () => Promise<PluginInventory>;
  readManifest: (versionId: string) => Promise<PluginManifestPreview>;
}

interface SettingsAPI {
  get: () => Promise<{
    centralSkillsRoot: string;
    checkForUpdates: boolean;
    autoScanProjects: boolean;
    symlinkStrategy: 'symlink' | 'junction' | 'auto';
    developerModeEnabled?: boolean;
    theme: 'light' | 'dark' | 'system';
    lastProjectScanPath?: string;
    projectScanDepth?: number;
    ideRootOverrides?: Record<string, string>;
    hasGithubToken: boolean;
  }>;
  update: (input: any) => Promise<any>;
  setGithubToken: (token: string) => Promise<{ success: boolean }>;
  clearGithubToken: () => Promise<{ success: boolean }>;
}

interface DialogAPI {
  selectFolder: (options?: { defaultPath?: string; title?: string }) => Promise<string | null>;
  selectFile: (
    options?: {
      defaultPath?: string;
      title?: string;
      filters?: { name: string; extensions: string[] }[];
    }
  ) => Promise<string | null>;
}

interface GitHubImportAPI {
  parseUrl: (url: string) => Promise<any>;
  analyze: (parsed: any) => Promise<any>;
  checkConflicts: (names: string[]) => Promise<Record<string, boolean>>;
  importSkills: (params: any) => Promise<any[]>;
  cancelImport: () => Promise<any>;
  onProgress: (callback: (progress: any) => void) => () => void;
}

interface ZipImportAPI {
  analyze: (zipPath: string) => Promise<any>;
  checkConflicts: (names: string[]) => Promise<Record<string, boolean>>;
  importSkills: (params: any) => Promise<any[]>;
  cancelImport: () => Promise<any>;
  onProgress: (callback: (progress: any) => void) => () => void;
}

interface UpdateCheckResult {
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion: string | null;
  releaseUrl: string | null;
  releaseNotes: string | null;
  publishedAt: string | null;
}

type UpdateOperationStatus = 'downloading' | 'installing';

interface UpdateAPI {
  check: () => Promise<UpdateCheckResult>;
  start: () => Promise<{ success: boolean }>;
  onStatus: (callback: (status: UpdateOperationStatus) => void) => () => void;
  openRelease: (version: string) => Promise<void>;
}

interface ElectronAPI {
  skills: SkillsAPI;
  projects: ProjectsAPI;
  links: LinksAPI;
  ides: IDEsAPI;
  detection: DetectionAPI;
  duplicates: DuplicatesAPI;
  globalSkills: GlobalSkillsAPI;
  plugins: PluginsAPI;
  settings: SettingsAPI;
  dialog: DialogAPI;
  githubImport: GitHubImportAPI;
  zipImport: ZipImportAPI;
  update: UpdateAPI;
}

declare global {
  interface Window {
    api: ElectronAPI;
  }
}

export {};
