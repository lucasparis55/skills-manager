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
    remove: (id: string) => ipcRenderer.invoke('links:remove', id),
    verify: (id: string) => ipcRenderer.invoke('links:verify', id),
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
  },

  // Dialog
  dialog: {
    selectFolder: (options?: { defaultPath?: string; title?: string }) => 
      ipcRenderer.invoke('dialog:selectFolder', options),
  },
});
