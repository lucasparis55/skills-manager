export type SkillStructure = 'folder-per-skill' | 'single-skill' | 'non-standard';

export type ImportComponentKind =
  | 'bundle'
  | 'skill'
  | 'hook'
  | 'agent'
  | 'command'
  | 'reference'
  | 'script'
  | 'config'
  | 'asset'
  | 'manual-step';

export type ImportRiskLevel = 'low' | 'medium' | 'high' | 'critical';
export type ImportScope = 'central' | 'global' | 'project' | 'custom';

export interface ImportSourceFile {
  path: string;
  sha: string;
  type: 'blob';
  size?: number;
}

export interface ImportFallbackCommand {
  executable: string;
  args: string[];
  cwd?: string;
  reason: string;
  requiresExplicitAuthorization: true;
  timeoutMs?: number;
}

export interface ImportComponentVariant {
  sourcePath: string;
  displayName: string;
  providerId?: string;
  files: ImportSourceFile[];
  nativeTargets: string[];
}

export interface ImportComponent {
  id: string;
  kind: ImportComponentKind;
  name: string;
  displayName: string;
  description: string;
  sourcePath: string;
  files: ImportSourceFile[];
  dependencies: string[];
  risk: ImportRiskLevel;
  hasExecutableFiles: boolean;
  requiresActivation: boolean;
  events: string[];
  nativeTargets: string[];
  variants?: ImportComponentVariant[];
  fallback?: ImportFallbackCommand;
  metadata: Record<string, unknown>;
}

export interface ImportTarget {
  id: string;
  label: string;
  adapterId: string;
  scope: ImportScope;
  ideId?: string;
  projectId?: string;
  projectPath?: string;
  rootPath: string;
  componentRoots: Partial<Record<ImportComponentKind, string>>;
  supportedKinds: ImportComponentKind[];
  native: boolean;
  available: boolean;
  reason?: string;
  hookConfigPath?: string;
}

export type ImportConflictStrategy = 'block' | 'skip' | 'rename' | 'overwrite' | 'merge';

export interface ImportComponentSelection {
  componentId: string;
  targetId: string;
  selected: boolean;
  conflictStrategy?: ImportConflictStrategy;
  renameTo?: string;
  activate?: boolean;
  fallbackAuthorized?: boolean;
}

export type ImportPlanItemStatus = 'ready' | 'blocked' | 'conflict' | 'needs-approval';

export interface ImportPlanItem {
  component: ImportComponent;
  target: ImportTarget;
  selection: ImportComponentSelection;
  status: ImportPlanItemStatus;
  destinationPath: string;
  conflict?: ImportConflict;
  warnings: string[];
}

export interface ImportPlan {
  id: string;
  createdAt: string;
  expiresAt?: string;
  sourceUrl: string;
  sourceRef: string;
  commitSha?: string;
  treeSha?: string;
  items: ImportPlanItem[];
  warnings: string[];
  blockers: string[];
}

export interface ImportConflict {
  componentId: string;
  targetId: string;
  sourcePath: string;
  destinationPath: string;
  sourceDescription: string;
  destinationDescription?: string;
  strategy: ImportConflictStrategy;
  canMerge: boolean;
}

export interface ImportActivationPreview {
  componentId: string;
  targetId: string;
  hookName: string;
  events: string[];
  command: string;
  content: string;
  contentSha256: string;
  configPath: string;
  currentlyActive: boolean;
}

export type ImportComponentResultStatus =
  | 'installed'
  | 'skipped'
  | 'blocked'
  | 'needs-approval'
  | 'activated'
  | 'failed';

export interface ImportComponentResult {
  componentId: string;
  componentName: string;
  kind: ImportComponentKind;
  targetId: string;
  status: ImportComponentResultStatus;
  destinationPath?: string;
  provenanceId?: string;
  activation?: ImportActivationPreview;
  error?: string;
  message?: string;
  stdout?: string;
  stderr?: string;
}

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
  phase: 'analyzing' | 'fetching' | 'reading' | 'staging' | 'writing' | 'installing' | 'activating' | 'manual';
  percentComplete: number;
  currentComponentId?: string;
  currentTargetId?: string;
}

export interface ImportFileEntry {
  path: string;
  content: string;
}

export interface BinaryImportFileEntry {
  path: string;
  content: Buffer;
}

export interface ImportProvenanceSource {
  type: 'github';
  url: string;
  owner: string;
  repo: string;
  ref: string;
  commitSha?: string;
  treeSha?: string;
  sourcePath: string;
  acquisition: 'github-api' | 'authorized-command';
}

export interface ImportProvenanceTarget {
  targetId: string;
  adapterId: string;
  scope: ImportScope;
  ideId?: string;
  projectId?: string;
  destinationPath: string;
  activated: boolean;
}

export interface ImportProvenanceRecord {
  id: string;
  componentId: string;
  componentKind: ImportComponentKind;
  componentName: string;
  source: ImportProvenanceSource;
  target: ImportProvenanceTarget;
  installedAt: string;
  updatedAt: string;
  status: 'installed' | 'active' | 'removed' | 'failed';
  fileHashes: Record<string, string>;
  method?: 'native' | 'staged' | 'authorized-command' | 'manual';
  backupPath?: string;
  lastOutput?: { stdout: string; stderr: string; exitCode?: number | null };
  lastError?: string;
}
