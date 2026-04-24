import { contextBridge, ipcRenderer } from 'electron';

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('api', {
  // Skills
  skills: {
    list: () => ipcRenderer.invoke('skills:list'),
    get: (id: string) => ipcRenderer.invoke('skills:get', id),
    create: (input: any) => ipcRenderer.invoke('skills:create', input),
    update: (id: string, input: any) => ipcRenderer.invoke('skills:update', id, input),
    delete: (id: string) => ipcRenderer.invoke('skills:delete', id),
    scan: () => ipcRenderer.invoke('skills:scan'),
    getContent: (id: string) => ipcRenderer.invoke('skills:getContent', id),
    saveContent: (id: string, content: string) => ipcRenderer.invoke('skills:saveContent', id, content),
    listFiles: (id: string) => ipcRenderer.invoke('skills:listFiles', id),
    readFile: (id: string, filePath: string) => ipcRenderer.invoke('skills:readFile', id, filePath),
    writeFile: (id: string, filePath: string, content: string) => ipcRenderer.invoke('skills:writeFile', id, filePath, content),
    deleteFile: (id: string, filePath: string) => ipcRenderer.invoke('skills:deleteFile', id, filePath),
    getPath: (id: string) => ipcRenderer.invoke('skills:getPath', id),
    openFolder: (id: string) => ipcRenderer.invoke('skills:openFolder', id),
  },

  // Projects
  projects: {
    list: () => ipcRenderer.invoke('projects:list'),
    add: (path: string) => ipcRenderer.invoke('projects:add', path),
    remove: (id: string) => ipcRenderer.invoke('projects:remove', id),
    scan: (rootPath?: string) => ipcRenderer.invoke('projects:scan', rootPath),
  },

  // Links
  links: {
    list: () => ipcRenderer.invoke('links:list'),
    create: (input: any) => ipcRenderer.invoke('links:create', input),
    createMultiple: (input: any) => ipcRenderer.invoke('links:createMultiple', input),
    onCreateProgress: (callback: (progress: any) => void) => {
      const handler = (_event: any, progress: any) => callback(progress);
      ipcRenderer.on('links:createProgress', handler);
      return () => { ipcRenderer.removeListener('links:createProgress', handler); };
    },
    remove: (id: string) => ipcRenderer.invoke('links:remove', id),
    removeMultiple: (ids: string[]) => ipcRenderer.invoke('links:removeMultiple', ids),
    verify: (id: string) => ipcRenderer.invoke('links:verify', id),
    verifyAll: () => ipcRenderer.invoke('links:verifyAll'),
  },

  // IDEs
  ides: {
    list: () => ipcRenderer.invoke('ides:list'),
    detectRoots: () => ipcRenderer.invoke('ides:detect-roots'),
  },

  // Detection
  detection: {
    checkDuplicates: (skillId: string, projectId: string, ideId: string) =>
      ipcRenderer.invoke('detection:check-duplicates', skillId, projectId, ideId),
  },

  // Settings
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    update: (input: any) => ipcRenderer.invoke('settings:update', input),
    setGithubToken: (token: string) => ipcRenderer.invoke('settings:setGithubToken', token),
    clearGithubToken: () => ipcRenderer.invoke('settings:clearGithubToken'),
  },

  // Dialog
  dialog: {
    selectFolder: (options?: { defaultPath?: string; title?: string }) =>
      ipcRenderer.invoke('dialog:selectFolder', options),
    selectFile: (options?: { defaultPath?: string; title?: string; filters?: { name: string; extensions: string[] }[] }) =>
      ipcRenderer.invoke('dialog:selectFile', options),
  },

  // GitHub Import
  githubImport: {
    parseUrl: (url: string) => ipcRenderer.invoke('github:parseUrl', url),
    analyze: (parsed: any) => ipcRenderer.invoke('github:analyze', parsed),
    checkConflicts: (names: string[]) => ipcRenderer.invoke('github:checkConflicts', names),
    importSkills: (params: any) => ipcRenderer.invoke('github:importSkills', params),
    cancelImport: () => ipcRenderer.invoke('github:cancelImport'),
    onProgress: (callback: (progress: any) => void) => {
      const handler = (_event: any, progress: any) => callback(progress);
      ipcRenderer.on('github:importProgress', handler);
      return () => {
        ipcRenderer.removeListener('github:importProgress', handler);
      };
    },
  },

  // ZIP Import
  zipImport: {
    analyze: (zipPath: string) => ipcRenderer.invoke('zip:analyze', zipPath),
    checkConflicts: (names: string[]) => ipcRenderer.invoke('zip:checkConflicts', names),
    importSkills: (params: any) => ipcRenderer.invoke('zip:importSkills', params),
    cancelImport: () => ipcRenderer.invoke('zip:cancelImport'),
    onProgress: (callback: (progress: any) => void) => {
      const handler = (_event: any, progress: any) => callback(progress);
      ipcRenderer.on('zip:importProgress', handler);
      return () => {
        ipcRenderer.removeListener('zip:importProgress', handler);
      };
    },
  },

  // Update
  update: {
    check: () => ipcRenderer.invoke('update:check'),
    openRelease: (version: string) => ipcRenderer.invoke('update:openRelease', version),
  },
});
