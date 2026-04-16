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
  ideRootOverrides: Record<string, string>;
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
