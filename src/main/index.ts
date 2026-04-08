import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import path from 'path';
import { DebateEngine } from './debate-engine';
import { AIService } from './ai-service';
import { GitService } from './git-service';
import { TerminalService } from './terminal-service';
import { SearchService } from './search-service';
import { PermissionService } from './permission-service';
import { ClaudeCodeService } from './claude-code-service';
import { CodexCliService } from './codex-cli-service';
import { AppReadiness, ReadinessAction } from '../shared/types';
import { AgentRuntime } from './agent-runtime';

let mainWindow: BrowserWindow | null = null;
let debateEngine: DebateEngine | null = null;
let agentRuntime: AgentRuntime | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    title: 'debaterAI',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 15, y: 15 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
    backgroundColor: '#1a1a1a',
  });

  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// IPC Handlers
function setupIPC() {
  const claudeCode = new ClaudeCodeService();
  const codexCli = new CodexCliService();
  const aiService = new AIService(claudeCode, codexCli);
  const gitService = new GitService();
  const terminalService = new TerminalService();
  const searchService = new SearchService();
  const permissionService = new PermissionService();
  debateEngine = new DebateEngine(aiService);
  agentRuntime = new AgentRuntime();

  // ============================================================================
  // Agent Runtime — spawn full CLI agents
  // ============================================================================
  ipcMain.handle('agent:spawn', async (_event, opts) => {
    if (!agentRuntime || !mainWindow) return { error: 'Not initialized' };

    const result = await agentRuntime.spawn({
      ...opts,
      onEvent: (event) => {
        mainWindow?.webContents.send('agent:event', event);
      },
    });
    return result;
  });

  ipcMain.handle('agent:kill', async (_event, { agentId }) => {
    return agentRuntime?.kill(agentId) ?? false;
  });

  ipcMain.handle('agent:killAll', async () => {
    agentRuntime?.killAll();
    return { success: true };
  });

  // ============================================================================
  // Session persistence
  // ============================================================================
  ipcMain.handle('session:list', async () => {
    return debateEngine?.getSessionStore().list() ?? [];
  });

  ipcMain.handle('session:load', async (_event, { sessionId }) => {
    return debateEngine?.getSessionStore().readEvents(sessionId) ?? [];
  });

  ipcMain.handle('session:getMeta', async (_event, { sessionId }) => {
    return debateEngine?.getSessionStore().getMeta(sessionId);
  });

  ipcMain.handle('session:delete', async (_event, { sessionId }) => {
    debateEngine?.getSessionStore().delete(sessionId);
    return { success: true };
  });

  // Readiness check — single aggregated IPC
  ipcMain.handle('app:getReadiness', async (_event, { projectPath }) => {
    if (!debateEngine) return null;
    const providers = await aiService.getProviderStatus();
    const modes = debateEngine.getEnabledModes();
    const settings = aiService.getSettings();
    const projectReady = !!projectPath;

    // Compute primary action
    let primaryAction: ReadinessAction | null = null;
    if (!projectReady) {
      primaryAction = { type: 'browseProject' };
    } else if (!providers.claude.ready && !providers.codex.ready) {
      primaryAction = { type: 'openSettings', tab: 'claude' };
    } else {
      const enabledMode = modes.find((m) => m.enabled);
      if (enabledMode) {
        primaryAction = { type: 'startMode', mode: enabledMode.mode };
      } else {
        primaryAction = { type: 'openSettings', tab: providers.claude.ready ? 'codex' : 'claude' };
      }
    }

    const readiness: AppReadiness = {
      project: { ready: projectReady, path: projectPath || '' },
      providers,
      modes,
      preferredMode: settings.debate.preferredMode,
      primaryAction,
    };
    return readiness;
  });

  // Validate before starting debate
  ipcMain.handle('debate:validateStart', async () => {
    if (!debateEngine) return { valid: false, error: 'Engine not initialized' };
    const settings = aiService.getSettings();
    return debateEngine.validateStart(settings.debate.preferredMode);
  });

  // 토론 시작
  ipcMain.handle('debate:start', async (_event, { prompt, projectPath, mode }) => {
    if (!debateEngine || !mainWindow) return;

    // Use provided mode or fall back to preferred mode
    const resolvedMode = mode || aiService.getSettings().debate.preferredMode;
    const validation = debateEngine.validateStart(resolvedMode);
    if (!validation.valid) {
      return { error: validation.error };
    }

    debateEngine.onMessage((message) => {
      mainWindow?.webContents.send('debate:message', message);
    });

    debateEngine.onStatusChange((status) => {
      mainWindow?.webContents.send('debate:status', status);
    });

    // Set project path for CLI adapter
    aiService.setProjectPath(projectPath);

    // 프로젝트 컨텍스트 수집 → AI에게 전달
    let projectContext = '';
    try {
      projectContext = await getProjectContext(projectPath, 10);
    } catch (err) {
      console.warn('Failed to collect project context:', err);
    }

    return debateEngine.startDebate(prompt, projectPath, projectContext, resolvedMode);
  });

  // 토론 중 사용자 개입
  ipcMain.handle('debate:intervene', async (_event, { decision }) => {
    return debateEngine?.userIntervene(decision);
  });

  // 합의된 코드 적용
  ipcMain.handle('debate:apply', async (_event, { debateId }) => {
    return debateEngine?.applyConsensus(debateId);
  });

  // AI 설정
  ipcMain.handle('settings:get', async () => {
    return aiService.getSettings();
  });

  ipcMain.handle('settings:save', async (_event, settings) => {
    return aiService.saveSettings(settings);
  });

  // 프로젝트 파일 목록
  ipcMain.handle('project:files', async (_event, { projectPath }) => {
    return getFileTree(projectPath);
  });

  // 파일 읽기
  ipcMain.handle('project:readFile', async (_event, { filePath }) => {
    const fs = await import('fs/promises');
    return fs.readFile(filePath, 'utf-8');
  });

  // 파일 쓰기
  ipcMain.handle('project:writeFile', async (_event, { filePath, content }) => {
    const fs = await import('fs/promises');
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(filePath, content, 'utf-8');
    return { success: true };
  });

  // 폴더 선택 다이얼로그
  ipcMain.handle('dialog:openDirectory', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: ['openDirectory'],
      title: '프로젝트 폴더 선택',
    });
    if (result.canceled) return null;
    return result.filePaths[0];
  });

  // 프로젝트 컨텍스트 읽기 (주요 파일 내용 수집)
  ipcMain.handle('project:getContext', async (_event, { projectPath, maxFiles }) => {
    return getProjectContext(projectPath, maxFiles || 10);
  });

  // ============================================================================
  // Git
  // ============================================================================
  ipcMain.handle('git:isRepo', async (_event, { projectPath }) => {
    return gitService.isGitRepo(projectPath);
  });

  ipcMain.handle('git:status', async (_event, { projectPath }) => {
    return gitService.status(projectPath);
  });

  ipcMain.handle('git:branches', async (_event, { projectPath }) => {
    return gitService.branches(projectPath);
  });

  ipcMain.handle('git:currentBranch', async (_event, { projectPath }) => {
    return gitService.currentBranch(projectPath);
  });

  ipcMain.handle('git:commit', async (_event, { projectPath, message }) => {
    return gitService.commit(projectPath, message);
  });

  ipcMain.handle('git:diff', async (_event, { projectPath, cached }) => {
    return gitService.diff(projectPath, cached);
  });

  ipcMain.handle('git:log', async (_event, { projectPath, count }) => {
    return gitService.log(projectPath, count);
  });

  ipcMain.handle('git:createWorktree', async (_event, { projectPath, debateId, baseBranch }) => {
    return gitService.createWorktree(projectPath, debateId, baseBranch);
  });

  ipcMain.handle('git:listWorktrees', async (_event, { projectPath }) => {
    return gitService.listWorktrees(projectPath);
  });

  ipcMain.handle('git:completeDebate', async (_event, { projectPath, worktreePath, branchName, commitMessage }) => {
    return gitService.completeDebate(projectPath, worktreePath, branchName, commitMessage);
  });

  // ============================================================================
  // Terminal
  // ============================================================================
  ipcMain.handle('terminal:exec', async (_event, { command, cwd, timeout }) => {
    return terminalService.exec(command, cwd, timeout);
  });

  ipcMain.handle('terminal:execStream', async (_event, { id, command, cwd }) => {
    terminalService.execStream(
      id,
      command,
      cwd,
      (type, data) => mainWindow?.webContents.send('terminal:data', { id, type, data }),
      (code) => mainWindow?.webContents.send('terminal:exit', { id, code }),
    );
    return { started: true };
  });

  ipcMain.handle('terminal:kill', async (_event, { id }) => {
    return terminalService.kill(id);
  });

  // ============================================================================
  // Search
  // ============================================================================
  ipcMain.handle('search:grep', async (_event, { projectPath, query, options }) => {
    return searchService.grep(projectPath, query, options);
  });

  ipcMain.handle('search:files', async (_event, { projectPath, query, options }) => {
    return searchService.findFiles(projectPath, query, options);
  });

  ipcMain.handle('search:stats', async (_event, { projectPath }) => {
    return searchService.getProjectStats(projectPath);
  });

  // ============================================================================
  // Permissions
  // ============================================================================
  ipcMain.handle('permission:getRules', async () => {
    return permissionService.getRules();
  });

  ipcMain.handle('permission:addRule', async (_event, rule) => {
    permissionService.addRule(rule);
    return { success: true };
  });

  ipcMain.handle('permission:removeRule', async (_event, { index }) => {
    permissionService.removeRule(index);
    return { success: true };
  });

  ipcMain.handle('permission:check', async (_event, request) => {
    return permissionService.check(request);
  });

  // ============================================================================
  // Claude Code CLI
  // ============================================================================
  ipcMain.handle('claudeCode:isAvailable', async () => {
    return claudeCode.isAvailable();
  });

  ipcMain.handle('claudeCode:authStatus', async () => {
    return claudeCode.getAuthStatus();
  });

  ipcMain.handle('claudeCode:execute', async (_event, { prompt, cwd, options }) => {
    return claudeCode.execute(prompt, cwd, options);
  });

  ipcMain.handle('claudeCode:executeStream', async (_event, { id, prompt, cwd, options }) => {
    claudeCode.executeStream(
      id,
      prompt,
      cwd,
      (data) => mainWindow?.webContents.send('claudeCode:data', { id, data }),
      (exitCode) => mainWindow?.webContents.send('claudeCode:complete', { id, exitCode }),
      options,
    );
    return { started: true };
  });

  ipcMain.handle('claudeCode:runTeam', async (_event, { tasks }) => {
    const results = await claudeCode.runTeam(tasks, (taskId, status, output) => {
      mainWindow?.webContents.send('claudeCode:taskUpdate', { taskId, status, output });
    });
    return Object.fromEntries(results);
  });

  ipcMain.handle('claudeCode:kill', async (_event, { id }) => {
    return claudeCode.kill(id);
  });

  // ============================================================================
  // Codex CLI
  // ============================================================================
  ipcMain.handle('codexCli:isAvailable', async () => {
    return codexCli.isAvailable();
  });

  ipcMain.handle('codexCli:authInfo', async () => {
    return codexCli.getAuthInfo();
  });

  // 권한 요청 시 렌더러에 물어보기
  permissionService.onPermissionRequest(async (request) => {
    return new Promise((resolve) => {
      mainWindow?.webContents.send('permission:request', request);
      ipcMain.once('permission:response', (_event, decision) => {
        resolve(decision);
      });
    });
  });
}

async function getFileTree(dir: string, prefix = ''): Promise<any[]> {
  const fs = await import('fs/promises');
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const items: any[] = [];

  for (const entry of entries) {
    // 무시할 폴더
    if (['.git', 'node_modules', 'dist', '.next', '__pycache__'].includes(entry.name)) continue;
    if (entry.name.startsWith('.') && entry.name !== '.env.example') continue;

    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      items.push({
        name: entry.name,
        path: fullPath,
        type: 'directory',
        children: await getFileTree(fullPath, prefix + '  '),
      });
    } else {
      items.push({
        name: entry.name,
        path: fullPath,
        type: 'file',
      });
    }
  }

  return items.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

/**
 * 프로젝트 컨텍스트 수집 — AI에게 프로젝트 구조와 주요 파일을 전달
 */
async function getProjectContext(projectPath: string, maxFiles: number): Promise<string> {
  const fs = await import('fs/promises');
  let context = `## Project: ${projectPath}\n\n`;

  // package.json
  try {
    const pkg = await fs.readFile(path.join(projectPath, 'package.json'), 'utf-8');
    context += `### package.json\n\`\`\`json\n${pkg}\n\`\`\`\n\n`;
  } catch {}

  // tsconfig.json
  try {
    const tsconfig = await fs.readFile(path.join(projectPath, 'tsconfig.json'), 'utf-8');
    context += `### tsconfig.json\n\`\`\`json\n${tsconfig}\n\`\`\`\n\n`;
  } catch {}

  // 파일 트리 (구조 파악용)
  const tree = await getFileTree(projectPath);
  context += `### File Structure\n\`\`\`\n${formatFileTree(tree)}\n\`\`\`\n\n`;

  // 주요 파일 내용 수집 (소스 파일 우선)
  const sourceFiles = collectSourceFiles(tree);
  const filesToRead = sourceFiles.slice(0, maxFiles);

  for (const filePath of filesToRead) {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      if (content.length > 5000) continue; // 너무 큰 파일 스킵
      const ext = path.extname(filePath).slice(1) || 'text';
      const relPath = path.relative(projectPath, filePath);
      context += `### ${relPath}\n\`\`\`${ext}\n${content}\n\`\`\`\n\n`;
    } catch {}
  }

  return context;
}

function formatFileTree(items: any[], prefix = ''): string {
  let result = '';
  for (const item of items) {
    result += `${prefix}${item.type === 'directory' ? '📁' : '📄'} ${item.name}\n`;
    if (item.children) {
      result += formatFileTree(item.children, prefix + '  ');
    }
  }
  return result;
}

function collectSourceFiles(items: any[]): string[] {
  const files: string[] = [];
  const sourceExts = ['.ts', '.tsx', '.js', '.jsx', '.py', '.rs', '.go', '.vue', '.svelte'];
  for (const item of items) {
    if (item.type === 'file' && sourceExts.some(ext => item.name.endsWith(ext))) {
      files.push(item.path);
    }
    if (item.children) {
      files.push(...collectSourceFiles(item.children));
    }
  }
  return files;
}

app.whenReady().then(() => {
  createWindow();
  setupIPC();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
