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
  projectId: string;
  ideName: string;
  scope: 'global' | 'project';
  sourcePath: string;
  destinationPath: string;
  status: 'linked' | 'broken' | 'conflict';
  createdAt: string;
}

interface CreateLinkInput {
  skillId: string;
  projectId: string;
  ideName: string;
  scope: 'global' | 'project';
}

interface CreateMultipleLinksInput {
  skillIds: string[];
  projectId: string;
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
}

interface ProjectsAPI {
  list: () => Promise<any[]>;
  add: (path: string) => Promise<any>;
  remove: (id: string) => Promise<any>;
  scan: (rootPath?: string) => Promise<any[]>;
}

interface LinksAPI {
  list: () => Promise<Link[]>;
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

interface SettingsAPI {
  get: () => Promise<{
    centralSkillsRoot: string;
    checkForUpdates: boolean;
    autoScanProjects: boolean;
    symlinkStrategy: 'symlink' | 'junction' | 'auto';
    developerModeEnabled?: boolean;
    theme: 'light' | 'dark' | 'system';
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

interface UpdateAPI {
  check: () => Promise<UpdateCheckResult>;
  openRelease: (version: string) => Promise<void>;
}

interface ElectronAPI {
  skills: SkillsAPI;
  projects: ProjectsAPI;
  links: LinksAPI;
  ides: IDEsAPI;
  detection: DetectionAPI;
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
