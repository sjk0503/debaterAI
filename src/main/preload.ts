import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('api', {
  // ── Agent Runtime ────────────────────────────────────────────────────────
  spawnAgent: (opts: any) =>
    ipcRenderer.invoke('agent:spawn', opts),
  killAgent: (agentId: string) =>
    ipcRenderer.invoke('agent:kill', { agentId }),
  killAllAgents: () =>
    ipcRenderer.invoke('agent:killAll'),
  onAgentEvent: (cb: (event: any) => void) => {
    ipcRenderer.on('agent:event', (_e, event) => cb(event));
    return () => ipcRenderer.removeAllListeners('agent:event');
  },

  // ── Checkpoints ─────────────────────────────────────────────────────────
  createCheckpoint: (projectPath: string, description: string, targetFiles?: string[]) =>
    ipcRenderer.invoke('checkpoint:create', { projectPath, description, targetFiles }),
  rollbackCheckpoint: (checkpointId: string) =>
    ipcRenderer.invoke('checkpoint:rollback', { checkpointId }),
  listCheckpoints: (projectPath: string) =>
    ipcRenderer.invoke('checkpoint:list', { projectPath }),

  // ── Orchestrator ─────────────────────────────────────────────────────────
  startParallelDebate: (opts: any) =>
    ipcRenderer.invoke('orchestrator:startParallel', opts),
  mergeTask: (taskId: string, commitMessage?: string) =>
    ipcRenderer.invoke('orchestrator:merge', { taskId, commitMessage }),
  discardTask: (taskId: string) =>
    ipcRenderer.invoke('orchestrator:discard', { taskId }),
  getTasks: (sessionId: string) =>
    ipcRenderer.invoke('orchestrator:tasks', { sessionId }),
  onOrchestratorEvent: (cb: (event: any) => void) => {
    ipcRenderer.on('orchestrator:event', (_e, event) => cb(event));
    return () => ipcRenderer.removeAllListeners('orchestrator:event');
  },

  // ── Sessions ────────────────────────────────────────────────────────────
  sessionList: () => ipcRenderer.invoke('session:list'),
  sessionLoad: (sessionId: string) => ipcRenderer.invoke('session:load', { sessionId }),
  sessionGetMeta: (sessionId: string) => ipcRenderer.invoke('session:getMeta', { sessionId }),
  sessionDelete: (sessionId: string) => ipcRenderer.invoke('session:delete', { sessionId }),

  // ── App Readiness ────────────────────────────────────────────────────────
  getReadiness: (projectPath: string) =>
    ipcRenderer.invoke('app:getReadiness', { projectPath }),

  // ── Debate ──────────────────────────────────────────────────────────────
  validateStart: () =>
    ipcRenderer.invoke('debate:validateStart'),
  startDebate: (prompt: string, projectPath: string, mode?: string, sessionId?: string) =>
    ipcRenderer.invoke('debate:start', { prompt, projectPath, mode, sessionId }),
  intervene: (debateId: string, message: string) =>
    ipcRenderer.invoke('debate:intervene', { debateId, message }),
  resolveTiebreak: (debateId: string, winner: 'claude' | 'codex') =>
    ipcRenderer.invoke('debate:resolveTiebreak', { debateId, winner }),
  applyCode: (debateId: string) =>
    ipcRenderer.invoke('debate:apply', { debateId }),
  confirmConsensus: (debateId: string, useWorktree: boolean) =>
    ipcRenderer.invoke('debate:confirmConsensus', { debateId, useWorktree }),
  mergeWorktree: (debateId: string) =>
    ipcRenderer.invoke('debate:mergeWorktree', { debateId }),
  discardWorktree: (debateId: string) =>
    ipcRenderer.invoke('debate:discardWorktree', { debateId }),

  onDebateMessage: (cb: (msg: any) => void) => {
    ipcRenderer.on('debate:message', (_e, msg) => cb(msg));
    return () => ipcRenderer.removeAllListeners('debate:message');
  },
  onDebateStatus: (cb: (status: any) => void) => {
    ipcRenderer.on('debate:status', (_e, status) => cb(status));
    return () => ipcRenderer.removeAllListeners('debate:status');
  },

  // ── Settings ─────────────────────────────────────────────────────────────
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (settings: any) => ipcRenderer.invoke('settings:save', settings),

  // ── Project ──────────────────────────────────────────────────────────────
  getFiles: (projectPath: string) =>
    ipcRenderer.invoke('project:files', { projectPath }),
  readFile: (filePath: string) =>
    ipcRenderer.invoke('project:readFile', { filePath }),
  writeFile: (filePath: string, content: string) =>
    ipcRenderer.invoke('project:writeFile', { filePath, content }),
  getProjectContext: (projectPath: string, maxFiles?: number) =>
    ipcRenderer.invoke('project:getContext', { projectPath, maxFiles }),

  // ── Dialog ───────────────────────────────────────────────────────────────
  openDirectory: () => ipcRenderer.invoke('dialog:openDirectory'),

  // ── Search ───────────────────────────────────────────────────────────────
  searchGrep: (projectPath: string, query: string, options?: any) =>
    ipcRenderer.invoke('search:grep', { projectPath, query, options }),
  searchFiles: (projectPath: string, query: string) =>
    ipcRenderer.invoke('search:files', { projectPath, query }),
  getProjectStats: (projectPath: string) =>
    ipcRenderer.invoke('search:stats', { projectPath }),

  // ── Git ──────────────────────────────────────────────────────────────────
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

  // ── Terminal ─────────────────────────────────────────────────────────────
  terminalExec: (command: string, cwd: string, timeout?: number) =>
    ipcRenderer.invoke('terminal:exec', { command, cwd, timeout }),
  terminalExecStream: (id: string, command: string, cwd: string) =>
    ipcRenderer.invoke('terminal:execStream', { id, command, cwd }),
  terminalKill: (id: string) =>
    ipcRenderer.invoke('terminal:kill', { id }),

  onTerminalData: (cb: (data: { id: string; type: string; data: string }) => void) => {
    ipcRenderer.on('terminal:data', (_e, data) => cb(data));
    return () => ipcRenderer.removeAllListeners('terminal:data');
  },
  onTerminalExit: (cb: (data: { id: string; code: number }) => void) => {
    ipcRenderer.on('terminal:exit', (_e, data) => cb(data));
    return () => ipcRenderer.removeAllListeners('terminal:exit');
  },

  // ── Permissions ───────────────────────────────────────────────────────────
  getPermissionRules: () => ipcRenderer.invoke('permission:getRules'),
  addPermissionRule: (rule: any) => ipcRenderer.invoke('permission:addRule', rule),
  removePermissionRule: (index: number) => ipcRenderer.invoke('permission:removeRule', { index }),
  checkPermission: (request: any) => ipcRenderer.invoke('permission:check', request),

  onPermissionRequest: (cb: (req: any) => void) => {
    ipcRenderer.on('permission:request', (_e, req) => cb(req));
    return () => ipcRenderer.removeAllListeners('permission:request');
  },
  respondPermission: (decision: string) =>
    ipcRenderer.send('permission:response', decision),

  // ── Claude Code CLI ───────────────────────────────────────────────────────
  claudeCodeAvailable: () => ipcRenderer.invoke('claudeCode:isAvailable'),
  claudeCodeAuthStatus: () => ipcRenderer.invoke('claudeCode:authStatus'),
  claudeCodeExecute: (prompt: string, cwd: string, options?: any) =>
    ipcRenderer.invoke('claudeCode:execute', { prompt, cwd, options }),
  claudeCodeExecuteStream: (id: string, prompt: string, cwd: string, options?: any) =>
    ipcRenderer.invoke('claudeCode:executeStream', { id, prompt, cwd, options }),
  claudeCodeRunTeam: (tasks: any[]) =>
    ipcRenderer.invoke('claudeCode:runTeam', { tasks }),
  claudeCodeKill: (id: string) =>
    ipcRenderer.invoke('claudeCode:kill', { id }),

  onClaudeCodeData: (cb: (data: { id: string; data: string }) => void) => {
    ipcRenderer.on('claudeCode:data', (_e, data) => cb(data));
    return () => ipcRenderer.removeAllListeners('claudeCode:data');
  },
  onClaudeCodeComplete: (cb: (data: { id: string; exitCode: number }) => void) => {
    ipcRenderer.on('claudeCode:complete', (_e, data) => cb(data));
    return () => ipcRenderer.removeAllListeners('claudeCode:complete');
  },
  onClaudeCodeTaskUpdate: (cb: (data: { taskId: string; status: string; output: string }) => void) => {
    ipcRenderer.on('claudeCode:taskUpdate', (_e, data) => cb(data));
    return () => ipcRenderer.removeAllListeners('claudeCode:taskUpdate');
  },

  // ── Codex CLI ─────────────────────────────────────────────────────────────
  codexCliAvailable: () => ipcRenderer.invoke('codexCli:isAvailable'),
  codexCliAuthInfo: () => ipcRenderer.invoke('codexCli:authInfo'),
});
