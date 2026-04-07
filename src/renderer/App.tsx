import React, { useState, useEffect, useRef } from 'react';
import { DebatePanel } from './components/DebatePanel';
import { FileExplorer } from './components/FileExplorer';
import { CodeView } from './components/CodeView';
import { SettingsModal } from './components/SettingsModal';
import { DebateMessage } from '../shared/types';

declare global {
  interface Window {
    api: {
      // Debate
      startDebate: (prompt: string, projectPath: string) => Promise<string>;
      intervene: (decision: string) => Promise<any>;
      applyCode: (debateId: string) => Promise<any>;
      onDebateMessage: (cb: (msg: DebateMessage) => void) => () => void;
      onDebateStatus: (cb: (status: any) => void) => () => void;
      // Settings
      getSettings: () => Promise<any>;
      saveSettings: (settings: any) => Promise<any>;
      // Project
      getFiles: (projectPath: string) => Promise<any>;
      readFile: (filePath: string) => Promise<string>;
      writeFile: (filePath: string, content: string) => Promise<any>;
      getProjectContext: (projectPath: string, maxFiles?: number) => Promise<string>;
      // Dialog
      openDirectory: () => Promise<string | null>;
      // Search
      searchGrep: (projectPath: string, query: string, options?: any) => Promise<any>;
      searchFiles: (projectPath: string, query: string, options?: any) => Promise<any>;
      searchStats: (projectPath: string) => Promise<any>;
      // Permissions
      permissionGetRules: () => Promise<any>;
      permissionAddRule: (rule: any) => Promise<any>;
      permissionRemoveRule: (index: number) => Promise<any>;
      permissionCheck: (request: any) => Promise<boolean>;
      onPermissionRequest: (cb: (request: any) => void) => () => void;
      respondPermission: (decision: string) => void;
      // Claude Code
      claudeCodeIsAvailable: () => Promise<boolean>;
      claudeCodeAuthStatus: () => Promise<any>;
      claudeCodeExecute: (prompt: string, cwd: string, options?: any) => Promise<any>;
      claudeCodeExecuteStream: (id: string, prompt: string, cwd: string, options?: any) => Promise<any>;
      claudeCodeRunTeam: (tasks: any[]) => Promise<any>;
      claudeCodeKill: (id: string) => Promise<boolean>;
      onClaudeCodeData: (cb: (data: any) => void) => () => void;
      onClaudeCodeComplete: (cb: (data: any) => void) => () => void;
      onClaudeCodeTaskUpdate: (cb: (data: any) => void) => () => void;
      // Terminal
      terminalExec: (command: string, cwd: string, timeout?: number) => Promise<any>;
      terminalExecStream: (id: string, command: string, cwd: string) => Promise<any>;
      terminalKill: (id: string) => Promise<boolean>;
      onTerminalData: (cb: (data: any) => void) => () => void;
      onTerminalExit: (cb: (data: any) => void) => () => void;
      // Git
      gitIsRepo: (projectPath: string) => Promise<boolean>;
      gitStatus: (projectPath: string) => Promise<string>;
      gitBranches: (projectPath: string) => Promise<string[]>;
      gitCurrentBranch: (projectPath: string) => Promise<string>;
      gitCommit: (projectPath: string, message: string) => Promise<string>;
      gitDiff: (projectPath: string, cached?: boolean) => Promise<string>;
      gitLog: (projectPath: string, count?: number) => Promise<string>;
      gitCreateWorktree: (projectPath: string, debateId: string, baseBranch?: string) => Promise<any>;
      gitListWorktrees: (projectPath: string) => Promise<any>;
      gitCompleteDebate: (projectPath: string, worktreePath: string, branchName: string, commitMessage: string) => Promise<any>;
    };
  }
}

export default function App() {
  const [messages, setMessages] = useState<DebateMessage[]>([]);
  const [status, setStatus] = useState<string>('idle');
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string>('');
  const [showSettings, setShowSettings] = useState(false);
  const [projectPath, setProjectPath] = useState<string>('');
  const [sidebarWidth, setSidebarWidth] = useState(260);

  useEffect(() => {
    const cleanupMsg = window.api?.onDebateMessage((msg) => {
      setMessages((prev) => {
        // 스트리밍: 같은 ID면 업데이트
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

    return () => {
      cleanupMsg?.();
      cleanupStatus?.();
    };
  }, []);

  const handleFileSelect = async (filePath: string) => {
    setSelectedFile(filePath);
    try {
      const content = await window.api.readFile(filePath);
      setFileContent(content);
    } catch (e) {
      setFileContent('// Failed to read file');
    }
  };

  return (
    <div className="flex h-screen bg-[#1a1a1a] text-white">
      {/* Sidebar - File Explorer */}
      <div
        className="flex-shrink-0 border-r border-[#383838] bg-[#1e1e1e]"
        style={{ width: sidebarWidth }}
      >
        <div className="h-10 flex items-center px-4 border-b border-[#383838]">
          <span className="text-sm font-semibold text-gray-400">EXPLORER</span>
        </div>
        <FileExplorer
          projectPath={projectPath}
          onFileSelect={handleFileSelect}
          selectedFile={selectedFile}
        />
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Title Bar */}
        <div className="h-10 flex items-center justify-between px-4 border-b border-[#383838] bg-[#242424]">
          <div className="flex items-center gap-3">
            <span className="text-lg font-bold bg-gradient-to-r from-purple-400 to-green-400 bg-clip-text text-transparent">
              debaterAI
            </span>
            <StatusBadge status={status} />
          </div>
          <button
            onClick={() => setShowSettings(true)}
            className="no-drag text-gray-400 hover:text-white text-sm px-2 py-1 rounded hover:bg-[#383838] transition"
          >
            ⚙️ Settings
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 flex min-h-0">
          {/* Debate Panel - 메인 */}
          <div className="flex-1 min-w-0">
            <DebatePanel
              messages={messages}
              status={status}
              projectPath={projectPath}
              onProjectPathChange={setProjectPath}
            />
          </div>

          {/* Code View - 사이드 */}
          {selectedFile && (
            <div className="w-[500px] flex-shrink-0 border-l border-[#383838]">
              <CodeView
                filePath={selectedFile}
                content={fileContent}
                onClose={() => setSelectedFile(null)}
              />
            </div>
          )}
        </div>
      </div>

      {/* Settings Modal */}
      {showSettings && (
        <SettingsModal onClose={() => setShowSettings(false)} />
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const configs: Record<string, { label: string; color: string }> = {
    idle: { label: 'Ready', color: 'bg-gray-500' },
    thinking: { label: 'Thinking...', color: 'bg-yellow-500' },
    debating: { label: '🔥 Debating', color: 'bg-purple-500' },
    consensus: { label: '🤝 Consensus', color: 'bg-green-500' },
    coding: { label: '💻 Coding', color: 'bg-blue-500' },
    done: { label: '✅ Done', color: 'bg-green-600' },
    error: { label: '❌ Error', color: 'bg-red-500' },
  };
  const cfg = configs[status] || configs.idle;

  return (
    <span className={`text-xs px-2 py-0.5 rounded-full ${cfg.color} text-white`}>
      {cfg.label}
    </span>
  );
}
