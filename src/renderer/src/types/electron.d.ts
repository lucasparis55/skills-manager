// Type declarations for the Electron IPC API exposed via preload script

interface SkillFileEntry {
  path: string;
  name: string;
  isDirectory: boolean;
  size: number;
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
  list: () => Promise<any[]>;
  create: (input: any) => Promise<any>;
  remove: (id: string) => Promise<any>;
  verify: (id: string) => Promise<any>;
}

interface IDEsAPI {
  list: () => Promise<any[]>;
  detectRoots: () => Promise<any[]>;
}

interface DetectionAPI {
  checkDuplicates: (skillId: string, projectId: string, ideId: string) => Promise<any>;
}

interface SettingsAPI {
  get: () => Promise<any>;
  update: (input: any) => Promise<any>;
}

interface DialogAPI {
  selectFolder: (options?: { defaultPath?: string; title?: string }) => Promise<string | null>;
}

interface ElectronAPI {
  skills: SkillsAPI;
  projects: ProjectsAPI;
  links: LinksAPI;
  ides: IDEsAPI;
  detection: DetectionAPI;
  settings: SettingsAPI;
  dialog: DialogAPI;
}

declare global {
  interface Window {
    api: ElectronAPI;
  }
}

export {};
