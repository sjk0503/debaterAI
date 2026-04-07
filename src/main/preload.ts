import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('api', {
  // ========================================================================
  // Debate
  // ========================================================================
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

  // ========================================================================
  // Settings
  // ========================================================================
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (settings: any) => ipcRenderer.invoke('settings:save', settings),

  // ========================================================================
  // Project
  // ========================================================================
  getFiles: (projectPath: string) =>
    ipcRenderer.invoke('project:files', { projectPath }),
  readFile: (filePath: string) =>
    ipcRenderer.invoke('project:readFile', { filePath }),
  writeFile: (filePath: string, content: string) =>
    ipcRenderer.invoke('project:writeFile', { filePath, content }),
  getProjectContext: (projectPath: string, maxFiles?: number) =>
    ipcRenderer.invoke('project:getContext', { projectPath, maxFiles }),

  // ========================================================================
  // Dialog
  // ========================================================================
  openDirectory: () => ipcRenderer.invoke('dialog:openDirectory'),

  // ========================================================================
  // Search
  // ========================================================================
  searchGrep: (projectPath: string, query: string, options?: any) =>
    ipcRenderer.invoke('search:grep', { projectPath, query, options }),
  searchFiles: (projectPath: string, query: string, options?: any) =>
    ipcRenderer.invoke('search:files', { projectPath, query, options }),
  searchStats: (projectPath: string) =>
    ipcRenderer.invoke('search:stats', { projectPath }),

  // ========================================================================
  // Permissions
  // ========================================================================
  permissionGetRules: () => ipcRenderer.invoke('permission:getRules'),
  permissionAddRule: (rule: any) => ipcRenderer.invoke('permission:addRule', rule),
  permissionRemoveRule: (index: number) =>
    ipcRenderer.invoke('permission:removeRule', { index }),
  permissionCheck: (request: any) => ipcRenderer.invoke('permission:check', request),

  onPermissionRequest: (cb: (request: any) => void) => {
    ipcRenderer.on('permission:request', (_e, request) => cb(request));
    return () => ipcRenderer.removeAllListeners('permission:request');
  },
  respondPermission: (decision: string) =>
    ipcRenderer.send('permission:response', decision),

  // ========================================================================
  // Claude Code CLI
  // ========================================================================
  claudeCodeIsAvailable: () => ipcRenderer.invoke('claudeCode:isAvailable'),
  claudeCodeAuthStatus: () => ipcRenderer.invoke('claudeCode:authStatus'),
  claudeCodeExecute: (prompt: string, cwd: string, options?: any) =>
    ipcRenderer.invoke('claudeCode:execute', { prompt, cwd, options }),
  claudeCodeExecuteStream: (id: string, prompt: string, cwd: string, options?: any) =>
    ipcRenderer.invoke('claudeCode:executeStream', { id, prompt, cwd, options }),
  claudeCodeRunTeam: (tasks: any[]) =>
    ipcRenderer.invoke('claudeCode:runTeam', { tasks }),
  claudeCodeKill: (id: string) =>
    ipcRenderer.invoke('claudeCode:kill', { id }),

  onClaudeCodeData: (cb: (data: any) => void) => {
    ipcRenderer.on('claudeCode:data', (_e, data) => cb(data));
    return () => ipcRenderer.removeAllListeners('claudeCode:data');
  },
  onClaudeCodeComplete: (cb: (data: any) => void) => {
    ipcRenderer.on('claudeCode:complete', (_e, data) => cb(data));
    return () => ipcRenderer.removeAllListeners('claudeCode:complete');
  },
  onClaudeCodeTaskUpdate: (cb: (data: any) => void) => {
    ipcRenderer.on('claudeCode:taskUpdate', (_e, data) => cb(data));
    return () => ipcRenderer.removeAllListeners('claudeCode:taskUpdate');
  },

  // ========================================================================
  // Terminal
  // ========================================================================
  terminalExec: (command: string, cwd: string, timeout?: number) =>
    ipcRenderer.invoke('terminal:exec', { command, cwd, timeout }),
  terminalExecStream: (id: string, command: string, cwd: string) =>
    ipcRenderer.invoke('terminal:execStream', { id, command, cwd }),
  terminalKill: (id: string) =>
    ipcRenderer.invoke('terminal:kill', { id }),

  onTerminalData: (cb: (data: any) => void) => {
    ipcRenderer.on('terminal:data', (_e, data) => cb(data));
    return () => ipcRenderer.removeAllListeners('terminal:data');
  },
  onTerminalExit: (cb: (data: any) => void) => {
    ipcRenderer.on('terminal:exit', (_e, data) => cb(data));
    return () => ipcRenderer.removeAllListeners('terminal:exit');
  },

  // ========================================================================
  // Git
  // ========================================================================
  gitIsRepo: (projectPath: string) =>
    ipcRenderer.invoke('git:isRepo', { projectPath }),
  gitStatus: (projectPath: string) =>
    ipcRenderer.invoke('git:status', { projectPath }),
  gitBranches: (projectPath: string) =>
    ipcRenderer.invoke('git:branches', { projectPath }),
  gitCurrentBranch: (projectPath: string) =>
    ipcRenderer.invoke('git:currentBranch', { projectPath }),
  gitCommit: (projectPath: string, message: string) =>
    ipcRenderer.invoke('git:commit', { projectPath, message }),
  gitDiff: (projectPath: string, cached?: boolean) =>
    ipcRenderer.invoke('git:diff', { projectPath, cached }),
  gitLog: (projectPath: string, count?: number) =>
    ipcRenderer.invoke('git:log', { projectPath, count }),
  gitCreateWorktree: (projectPath: string, debateId: string, baseBranch?: string) =>
    ipcRenderer.invoke('git:createWorktree', { projectPath, debateId, baseBranch }),
  gitListWorktrees: (projectPath: string) =>
    ipcRenderer.invoke('git:listWorktrees', { projectPath }),
  gitCompleteDebate: (projectPath: string, worktreePath: string, branchName: string, commitMessage: string) =>
    ipcRenderer.invoke('git:completeDebate', { projectPath, worktreePath, branchName, commitMessage }),
});
