import React, { useState, useEffect } from 'react';
import { DebatePanel } from './components/DebatePanel';
import { FileExplorer } from './components/FileExplorer';
import { CodeView } from './components/CodeView';
import { SettingsModal } from './components/SettingsModal';
import { PermissionModal } from './components/PermissionModal';
import { DiffView } from './components/DiffView';
import { DebateMessage, DebateMode, AppReadiness } from '../shared/types';

declare global {
  interface Window {
    api: {
      // Agent Runtime
      spawnAgent: (opts: any) => Promise<any>;
      killAgent: (agentId: string) => Promise<boolean>;
      killAllAgents: () => Promise<any>;
      onAgentEvent: (cb: (event: any) => void) => () => void;
      // Readiness
      getReadiness: (projectPath: string) => Promise<AppReadiness>;
      validateStart: () => Promise<{ valid: boolean; error?: string }>;
      startDebate: (prompt: string, projectPath: string, mode?: string) => Promise<string>;
      intervene: (decision: string) => Promise<any>;
      applyCode: (debateId: string) => Promise<any>;
      onDebateMessage: (cb: (msg: DebateMessage) => void) => () => void;
      onDebateStatus: (cb: (status: any) => void) => () => void;
      getSettings: () => Promise<any>;
      saveSettings: (settings: any) => Promise<any>;
      getFiles: (projectPath: string) => Promise<any>;
      readFile: (filePath: string) => Promise<string>;
      writeFile: (filePath: string, content: string) => Promise<any>;
      getProjectContext: (projectPath: string, maxFiles?: number) => Promise<string>;
      openDirectory: () => Promise<string | null>;
      searchGrep: (projectPath: string, query: string, options?: any) => Promise<any>;
      searchFiles: (projectPath: string, query: string) => Promise<string[]>;
      gitStatus: (projectPath: string) => Promise<string>;
      gitDiff: (projectPath: string) => Promise<string>;
      gitLog: (projectPath: string, count?: number) => Promise<string>;
      gitCurrentBranch: (projectPath: string) => Promise<string>;
      onPermissionRequest: (cb: (req: any) => void) => () => void;
      respondPermission: (decision: string) => void;
      onTerminalData: (cb: (data: any) => void) => () => void;
    };
  }
}

type RightPanel = 'code' | 'diff' | null;

export default function App() {
  const [messages, setMessages] = useState<DebateMessage[]>([]);
  const [status, setStatus] = useState<string>('idle');
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string>('');
  const [showSettings, setShowSettings] = useState(false);
  const [projectPath, setProjectPath] = useState<string>('');
  const [showSidebar, setShowSidebar] = useState(true);
  const [rightPanel, setRightPanel] = useState<RightPanel>(null);
  const [diffContent, setDiffContent] = useState('');
  const [selectedMode, setSelectedMode] = useState<DebateMode>('debate');
  const [permissionReq, setPermissionReq] = useState<any>(null);
  const [settingsVersion, setSettingsVersion] = useState(0);

  useEffect(() => {
    const cleanupMsg = window.api?.onDebateMessage((msg) => {
      setMessages((prev) => {
        const existing = prev.findIndex((m) => m.id === msg.id);
        if (existing >= 0) {
          const updated = [...prev];
          updated[existing] = msg;
          return updated;
        }
        return [...prev, msg];
      });
    });

    const cleanupStatus = window.api?.onDebateStatus((s) => {
      setStatus(s.status);
    });

    const cleanupPerm = window.api?.onPermissionRequest((req) => {
      setPermissionReq(req);
    });

    // Keyboard shortcuts
    const handleKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
        e.preventDefault();
        setShowSidebar((p) => !p);
      }
      if ((e.metaKey || e.ctrlKey) && e.key === ',') {
        e.preventDefault();
        setShowSettings(true);
      }
    };
    window.addEventListener('keydown', handleKey);

    return () => {
      cleanupMsg?.();
      cleanupStatus?.();
      cleanupPerm?.();
      window.removeEventListener('keydown', handleKey);
    };
  }, []);

  const handleFileSelect = async (filePath: string) => {
    setSelectedFile(filePath);
    setRightPanel('code');
    try {
      const content = await window.api.readFile(filePath);
      setFileContent(content);
    } catch {
      setFileContent('// Failed to read file');
    }
  };

  const handleOpenDirectory = async () => {
    const dir = await window.api?.openDirectory();
    if (dir) setProjectPath(dir);
  };

  const handleShowDiff = async () => {
    if (!projectPath) return;
    try {
      const diff = await window.api.gitDiff(projectPath);
      setDiffContent(diff || 'No changes.');
      setRightPanel('diff');
    } catch {
      setDiffContent('Could not get diff.');
      setRightPanel('diff');
    }
  };

  const handlePermissionDecision = (decision: 'allow' | 'deny' | 'always-allow') => {
    window.api?.respondPermission(decision);
    setPermissionReq(null);
  };

  return (
    <div className="flex flex-col h-screen" style={{ background: 'var(--bg-0)', color: 'var(--text-1)' }}>
      {/* Title Bar */}
      <div
        className="h-10 flex items-center justify-between px-4 flex-shrink-0"
        style={{ background: 'var(--bg-1)', borderBottom: '1px solid var(--border)' }}
      >
        <div className="flex items-center gap-3">
          {/* macOS traffic lights space */}
          <div className="w-14" />
          <span className="text-sm font-semibold tracking-tight" style={{ color: 'var(--text-1)' }}>
            debaterAI
          </span>
          <StatusDot status={status} />
        </div>

        <div className="flex items-center gap-2">
          {projectPath && (
            <button
              onClick={handleShowDiff}
              className="no-drag px-2 py-1 rounded text-xs transition"
              style={{ color: 'var(--text-2)', background: 'transparent' }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-3)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              Diff
            </button>
          )}
          <button
            onClick={() => setShowSidebar((p) => !p)}
            className="no-drag px-2 py-1 rounded text-xs transition"
            style={{ color: 'var(--text-2)', background: 'transparent' }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-3)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            Sidebar
          </button>
          <button
            onClick={() => setShowSettings(true)}
            className="no-drag px-2 py-1 rounded text-xs transition"
            style={{ color: 'var(--text-2)', background: 'transparent' }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-3)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            Settings
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex flex-1 min-h-0">
        {/* Sidebar */}
        {showSidebar && (
          <div
            className="w-56 flex-shrink-0 flex flex-col"
            style={{ borderRight: '1px solid var(--border)', background: 'var(--bg-1)' }}
          >
            {/* Project selector */}
            <div
              className="px-3 py-2 flex items-center justify-between"
              style={{ borderBottom: '1px solid var(--border-subtle)' }}
            >
              <span className="text-xs font-medium" style={{ color: 'var(--text-3)', letterSpacing: '0.05em' }}>
                EXPLORER
              </span>
              <button
                onClick={handleOpenDirectory}
                className="no-drag px-1.5 py-0.5 rounded text-xs transition"
                style={{ color: 'var(--text-3)' }}
                onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text-1)')}
                onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-3)')}
                title="Open Folder"
              >
                Open
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <FileExplorer
                projectPath={projectPath}
                onFileSelect={handleFileSelect}
                selectedFile={selectedFile}
              />
            </div>
          </div>
        )}

        {/* Debate Panel */}
        <div className="flex-1 min-w-0">
          <DebatePanel
            messages={messages}
            status={status}
            projectPath={projectPath}
            selectedMode={selectedMode}
            settingsVersion={settingsVersion}
            onProjectPathChange={setProjectPath}
            onOpenDirectory={handleOpenDirectory}
            onOpenSettings={(tab) => setShowSettings(true)}
            onModeChange={setSelectedMode}
          />
        </div>

        {/* Right Panel */}
        {rightPanel === 'code' && selectedFile && (
          <div
            className="w-[480px] flex-shrink-0"
            style={{ borderLeft: '1px solid var(--border)' }}
          >
            <CodeView
              filePath={selectedFile}
              content={fileContent}
              onClose={() => setRightPanel(null)}
            />
          </div>
        )}
        {rightPanel === 'diff' && (
          <div
            className="w-[480px] flex-shrink-0"
            style={{ borderLeft: '1px solid var(--border)' }}
          >
            <DiffView diff={diffContent} onClose={() => setRightPanel(null)} />
          </div>
        )}
      </div>

      {/* Modals */}
      {showSettings && <SettingsModal onClose={() => { setShowSettings(false); setSettingsVersion(v => v + 1); }} />}
      {permissionReq && (
        <PermissionModal
          action={permissionReq.action}
          detail={permissionReq.detail}
          reason={permissionReq.reason}
          onDecision={handlePermissionDecision}
        />
      )}
    </div>
  );
}

function StatusDot({ status }: { status: string }) {
  const labels: Record<string, { label: string; dotClass: string }> = {
    idle:      { label: 'Ready',    dotClass: 'dot-idle' },
    thinking:  { label: 'Thinking', dotClass: 'dot-thinking' },
    debating:  { label: 'Debating', dotClass: 'dot-debating' },
    consensus: { label: 'Consensus',dotClass: 'dot-consensus' },
    coding:    { label: 'Coding',   dotClass: 'dot-coding' },
    done:      { label: 'Done',     dotClass: 'dot-done' },
    error:     { label: 'Error',    dotClass: 'dot-error' },
  };
  const cfg = labels[status] || labels.idle;
  return (
    <div className="flex items-center gap-1.5">
      <span className={`dot ${cfg.dotClass}`} />
      <span className="text-xs" style={{ color: 'var(--text-3)' }}>{cfg.label}</span>
    </div>
  );
}
