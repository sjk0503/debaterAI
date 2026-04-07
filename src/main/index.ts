import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { DebateEngine } from './debate-engine';
import { AIService } from './ai-service';

let mainWindow: BrowserWindow | null = null;
let debateEngine: DebateEngine | null = null;

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
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// IPC Handlers
function setupIPC() {
  const aiService = new AIService();
  debateEngine = new DebateEngine(aiService);

  // 토론 시작
  ipcMain.handle('debate:start', async (_event, { prompt, projectPath }) => {
    if (!debateEngine || !mainWindow) return;

    debateEngine.onMessage((message) => {
      mainWindow?.webContents.send('debate:message', message);
    });

    debateEngine.onStatusChange((status) => {
      mainWindow?.webContents.send('debate:status', status);
    });

    return debateEngine.startDebate(prompt, projectPath);
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
    const fs = await import('fs/promises');
    const files = await getFileTree(projectPath);
    return files;
  });

  // 파일 읽기
  ipcMain.handle('project:readFile', async (_event, { filePath }) => {
    const fs = await import('fs/promises');
    return fs.readFile(filePath, 'utf-8');
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
