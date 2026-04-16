// Type declarations for the Electron IPC API exposed via preload script

interface SkillsAPI {
  list: () => Promise<any[]>;
  get: (id: string) => Promise<any>;
  create: (input: any) => Promise<any>;
  update: (id: string, input: any) => Promise<any>;
  delete: (id: string) => Promise<any>;
  scan: () => Promise<any[]>;
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

interface ElectronAPI {
  skills: SkillsAPI;
  projects: ProjectsAPI;
  links: LinksAPI;
  ides: IDEsAPI;
  detection: DetectionAPI;
  settings: SettingsAPI;
}

declare global {
  interface Window {
    api: ElectronAPI;
  }
}

export {};
