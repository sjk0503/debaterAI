import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('api', {
  // Debate
  startDebate: (prompt: string, projectPath: string) =>
    ipcRenderer.invoke('debate:start', { prompt, projectPath }),
  intervene: (decision: string) =>
    ipcRenderer.invoke('debate:intervene', { decision }),
  applyCode: (debateId: string) =>
    ipcRenderer.invoke('debate:apply', { debateId }),

  // Debate events
  onDebateMessage: (cb: (msg: any) => void) => {
    ipcRenderer.on('debate:message', (_e, msg) => cb(msg));
    return () => ipcRenderer.removeAllListeners('debate:message');
  },
  onDebateStatus: (cb: (status: any) => void) => {
    ipcRenderer.on('debate:status', (_e, status) => cb(status));
    return () => ipcRenderer.removeAllListeners('debate:status');
  },

  // Settings
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (settings: any) => ipcRenderer.invoke('settings:save', settings),

  // Project
  getFiles: (projectPath: string) =>
    ipcRenderer.invoke('project:files', { projectPath }),
  readFile: (filePath: string) =>
    ipcRenderer.invoke('project:readFile', { filePath }),
  writeFile: (filePath: string, content: string) =>
    ipcRenderer.invoke('project:writeFile', { filePath, content }),
  getProjectContext: (projectPath: string, maxFiles?: number) =>
    ipcRenderer.invoke('project:getContext', { projectPath, maxFiles }),

  // Dialog
  openDirectory: () => ipcRenderer.invoke('dialog:openDirectory'),
});
