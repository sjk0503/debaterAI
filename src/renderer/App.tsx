import React, { useState, useEffect } from 'react';
import { DebatePanel } from './components/DebatePanel';
import { FileExplorer } from './components/FileExplorer';
import { SessionList } from './components/SessionList';
import { EditorTabs, useEditorTabs } from './components/EditorTabs';
import { TerminalPanel } from './components/TerminalPanel';
import { PanelLayout } from './components/PanelLayout';
import { SettingsModal } from './components/SettingsModal';
import { PermissionModal } from './components/PermissionModal';
import { DiffView } from './components/DiffView';
import { DebateMessage, DebateMode, AppReadiness } from '../shared/types';

declare global {
  interface Window {
    api: {
      spawnAgent: (opts: any) => Promise<any>;
      killAgent: (agentId: string) => Promise<boolean>;
      killAllAgents: () => Promise<any>;
      onAgentEvent: (cb: (event: any) => void) => () => void;
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

type RightPanel = 'editor' | 'diff' | null;

export default function App() {
  const [messages, setMessages] = useState<DebateMessage[]>([]);
  const [status, setStatus] = useState<string>('idle');
  const [showSettings, setShowSettings] = useState(false);
  const [projectPath, setProjectPath] = useState<string>('');
  const [showSidebar, setShowSidebar] = useState(true);
  const [showTerminal, setShowTerminal] = useState(false);
  const [rightPanel, setRightPanel] = useState<RightPanel>(null);
  const [diffContent, setDiffContent] = useState('');
  const [selectedMode, setSelectedMode] = useState<DebateMode>('debate');
  const [permissionReq, setPermissionReq] = useState<any>(null);
  const [settingsVersion, setSettingsVersion] = useState(0);
  const [sidebarTab, setSidebarTab] = useState<'files' | 'sessions'>('sessions');
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [sessionRefresh, setSessionRefresh] = useState(0);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);

  const { openFile, openInEditor, clearFile } = useEditorTabs();

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
      if (s.status === 'done' || s.status === 'error') {
        setSessionRefresh((v) => v + 1);
      }
    });

    const cleanupPerm = window.api?.onPermissionRequest((req) => {
      setPermissionReq(req);
    });

    const handleKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
        e.preventDefault();
        setShowSidebar((p) => !p);
      }
      if ((e.metaKey || e.ctrlKey) && e.key === ',') {
        e.preventDefault();
        setShowSettings(true);
      }
      if ((e.metaKey || e.ctrlKey) && e.key === '`') {
        e.preventDefault();
        setShowTerminal((p) => !p);
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

  const handleFileSelect = (filePath: string) => {
    setSelectedFile(filePath);
    openInEditor(filePath);
    setRightPanel('editor');
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

  // ── Sidebar content ───────────────────────────────────────────────
  const sidebarContent = (
    <>
      <div
        className="px-1 py-1 flex items-center gap-1 flex-shrink-0"
        style={{ borderBottom: '1px solid var(--border-subtle)' }}
      >
        <button
          onClick={() => setSidebarTab('sessions')}
          className="flex-1 text-xs py-1 rounded transition"
          style={{
            background: sidebarTab === 'sessions' ? 'var(--bg-3)' : 'transparent',
            color: sidebarTab === 'sessions' ? 'var(--text-1)' : 'var(--text-3)',
          }}
        >
          Sessions
        </button>
        <button
          onClick={() => setSidebarTab('files')}
          className="flex-1 text-xs py-1 rounded transition"
          style={{
            background: sidebarTab === 'files' ? 'var(--bg-3)' : 'transparent',
            color: sidebarTab === 'files' ? 'var(--text-1)' : 'var(--text-3)',
          }}
        >
          Files
        </button>
        {sidebarTab === 'files' && (
          <button
            onClick={handleOpenDirectory}
            className="no-drag px-1.5 py-0.5 rounded text-xs transition"
            style={{ color: 'var(--text-3)' }}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text-1)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-3)')}
          >
            +
          </button>
        )}
      </div>
      <div className="flex-1 overflow-y-auto">
        {sidebarTab === 'sessions' ? (
          <SessionList
            currentSessionId={currentSessionId}
            onSelectSession={(id) => setCurrentSessionId(id)}
            onDeleteSession={(id) => {
              (window.api as any).sessionDelete?.(id);
              setSessionRefresh((v) => v + 1);
              if (currentSessionId === id) setCurrentSessionId(null);
            }}
            refreshTrigger={sessionRefresh}
          />
        ) : (
          <FileExplorer
            projectPath={projectPath}
            onFileSelect={handleFileSelect}
            selectedFile={selectedFile}
          />
        )}
      </div>
    </>
  );

  // ── Main content (debate panel) ───────────────────────────────────
  const mainContent = (
    <DebatePanel
      messages={messages}
      status={status}
      projectPath={projectPath}
      selectedMode={selectedMode}
      settingsVersion={settingsVersion}
      onProjectPathChange={setProjectPath}
      onOpenDirectory={handleOpenDirectory}
      onOpenSettings={() => setShowSettings(true)}
      onModeChange={setSelectedMode}
    />
  );

  // ── Right panel content — editor is always mounted to preserve state ─
  const rightContent = rightPanel !== null ? (
    <div className="flex flex-col h-full">
      {/* Editor (always mounted, visibility toggled) */}
      <div className="flex-1 min-h-0" style={{ display: rightPanel === 'editor' ? 'flex' : 'none', flexDirection: 'column' }}>
        <EditorTabs
          initialFile={openFile}
          onClose={() => { setRightPanel(null); }}
        />
      </div>
      {/* Diff (conditionally mounted) */}
      {rightPanel === 'diff' && (
        <div className="flex-1 min-h-0">
          <DiffView diff={diffContent} onClose={() => setRightPanel(null)} />
        </div>
      )}
    </div>
  ) : null;

  return (
    <div className="flex flex-col h-screen" style={{ background: 'var(--bg-0)', color: 'var(--text-1)' }}>
      {/* Title Bar */}
      <div
        className="h-10 flex items-center justify-between px-4 flex-shrink-0"
        style={{ background: 'var(--bg-1)', borderBottom: '1px solid var(--border)' }}
      >
        <div className="flex items-center gap-3">
          <div className="w-14" />
          <span className="text-sm font-semibold tracking-tight" style={{ color: 'var(--text-1)' }}>
            debaterAI
          </span>
          <StatusDot status={status} />
        </div>

        <div className="flex items-center gap-1">
          {projectPath && (
            <TitleButton onClick={handleShowDiff}>Diff</TitleButton>
          )}
          <TitleButton onClick={() => setShowTerminal((p) => !p)}>
            Terminal
          </TitleButton>
          <TitleButton onClick={() => setShowSidebar((p) => !p)}>
            Sidebar
          </TitleButton>
          <TitleButton onClick={() => setShowSettings(true)}>
            Settings
          </TitleButton>
        </div>
      </div>

      {/* Panel Layout */}
      <PanelLayout
        sidebar={sidebarContent}
        main={mainContent}
        bottom={<TerminalPanel projectPath={projectPath} />}
        right={rightContent}
        showSidebar={showSidebar}
        showBottom={showTerminal}
        showRight={rightPanel !== null}
      />

      {/* Modals */}
      {showSettings && (
        <SettingsModal onClose={() => { setShowSettings(false); setSettingsVersion((v) => v + 1); }} />
      )}
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

// ── Sub-components ──────────────────────────────────────────────────

function TitleButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="no-drag px-2 py-1 rounded text-xs transition"
      style={{ color: 'var(--text-2)', background: 'transparent' }}
      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-3)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      {children}
    </button>
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
