import React, { useState, useRef, useEffect } from 'react';
import { DebateMessage, DebateMode, AppReadiness, ModeStatus } from '../../shared/types';
import { MarkdownMessage } from './MarkdownMessage';
import { AgentActivityPanel } from './AgentActivityPanel';
import { SlashCommandPalette } from './SlashCommandPalette';
import { ActivityBar } from './ActivityBar';
import { useSlashCommands } from '../hooks/useSlashCommands';

interface Props {
  messages: DebateMessage[];
  status: string;
  projectPath: string;
  selectedMode: DebateMode;
  settingsVersion: number;
  currentSessionId?: string | null;
  latestAgentEvent?: any;
  onProjectPathChange: (path: string) => void;
  onOpenDirectory: () => void;
  onOpenSettings: (tab?: string) => void;
  onModeChange: (mode: DebateMode) => void;
  onClearMessages?: () => void;
  onShowDiff?: () => void;
  onApplyCode?: () => void;
  onAddSystemMessage?: (content: string) => void;
  onSessionStarted?: (debateId: string) => void;
}

export function DebatePanel({
  messages, status, projectPath, selectedMode, settingsVersion,
  currentSessionId, latestAgentEvent,
  onProjectPathChange, onOpenDirectory, onOpenSettings, onModeChange,
  onClearMessages, onShowDiff, onApplyCode, onAddSystemMessage, onSessionStarted,
}: Props) {
  const [input, setInput] = useState('');
  const [readiness, setReadiness] = useState<AppReadiness | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const isActive = status !== 'idle' && status !== 'done' && status !== 'error';

  // Mode-aware labels
  const activeLabel = selectedMode === 'debate'
    ? 'Debating...'
    : selectedMode === 'claude-only'
      ? 'Claude working...'
      : 'Codex working...';

  // Slash commands
  const slashCmds = useSlashCommands({
    projectPath,
    selectedMode,
    currentSessionId: currentSessionId ?? null,
    onModeChange,
    onClearMessages: onClearMessages || (() => {}),
    onShowDiff: onShowDiff || (() => {}),
    onApplyCode: onApplyCode || (() => {}),
    onAddSystemMessage: onAddSystemMessage || (() => {}),
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    window.api.getReadiness?.(projectPath).then(setReadiness).catch(() => {});
  }, [projectPath, status, settingsVersion]);

  const handleSubmit = async () => {
    if (!input.trim() || !projectPath.trim() || isActive) return;

    // Try slash command first
    if (slashCmds.tryExecuteSlashCommand(input)) {
      setInput('');
      return;
    }

    const debateId = await window.api.startDebate(input.trim(), projectPath.trim(), selectedMode, currentSessionId || undefined);
    if (debateId) onSessionStarted?.(debateId);
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Slash command palette gets priority
    if (slashCmds.handleKeyDown(e, input)) {
      // Check if slash command set a pending input
      const pending = slashCmds.getPendingInput();
      if (pending !== null) setInput(pending);
      return;
    }

    // Enter to send (no modifier), Shift+Enter for newline
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
      return;
    }

    // Cmd/Ctrl+Enter for backward compat
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleInputChange = (value: string) => {
    setInput(value);
    const cursorPos = inputRef.current?.selectionStart ?? value.length;
    slashCmds.handleInputChange(value, cursorPos);
  };

  const handlePaletteSelect = (cmd: any) => {
    const newInput = slashCmds.handleSelect(cmd);
    setInput(newInput);
    inputRef.current?.focus();
  };

  const roleMeta: Record<string, { label: string; color: string }> = {
    user:   { label: 'You',    color: 'var(--user)' },
    claude: { label: 'Claude', color: 'var(--claude)' },
    codex:  { label: 'Codex',  color: 'var(--codex)' },
    system: { label: '',       color: 'transparent' },
  };

  const agreementLabel: Record<string, string> = {
    agree:    'agreed',
    partial:  'partial',
    disagree: 'rejected',
  };

  return (
    <div className="flex flex-col h-full no-drag" style={{ background: 'var(--bg-0)' }}>
      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {messages.length === 0 && (
          <ReadinessDashboard
            readiness={readiness}
            projectPath={projectPath}
            selectedMode={selectedMode}
            onOpenDirectory={onOpenDirectory}
            onOpenSettings={onOpenSettings}
            onModeChange={onModeChange}
          />
        )}

        {/* Compact readiness strip when idle with messages */}
        {messages.length > 0 && status === 'idle' && readiness && (
          <div className="flex items-center gap-3 px-2 py-1.5 rounded text-xs" style={{ background: 'var(--bg-1)', border: '1px solid var(--border)' }}>
            <StatusBadge ready={readiness.providers.claude.ready} label="Claude" />
            <StatusBadge ready={readiness.providers.codex.ready} label="Codex" />
            {readiness.modes.filter(m => m.enabled).length > 0 && (
              <span style={{ color: 'var(--text-3)' }}>
                {readiness.modes.filter(m => m.enabled).map(m => m.mode).join(' / ')}
              </span>
            )}
          </div>
        )}

        {messages.map((msg) => {
          const meta = roleMeta[msg.role] || roleMeta.system;

          if (msg.role === 'system') {
            return (
              <div key={msg.id} className="flex items-center gap-3 py-1">
                <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
                <span className="text-xs shrink-0 selectable-text" style={{ color: 'var(--text-3)' }}>
                  {msg.content}
                </span>
                <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
              </div>
            );
          }

          return (
            <div key={msg.id} className="group">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-semibold" style={{ color: meta.color }}>
                  {meta.label}
                </span>
                {msg.round && (
                  <span className="text-xs" style={{ color: 'var(--text-3)' }}>
                    round {msg.round}
                  </span>
                )}
                {msg.agreement && (
                  <span
                    className="text-xs px-1.5 py-0.5 rounded"
                    style={{
                      background: msg.agreement === 'agree'
                        ? 'rgba(16,185,129,0.15)'
                        : msg.agreement === 'partial'
                          ? 'rgba(245,158,11,0.15)'
                          : 'rgba(239,68,68,0.15)',
                      color: msg.agreement === 'agree'
                        ? '#10b981'
                        : msg.agreement === 'partial'
                          ? '#f59e0b'
                          : '#ef4444',
                    }}
                  >
                    {agreementLabel[msg.agreement]}
                  </span>
                )}
              </div>

              {msg.agentEvents && msg.agentEvents.length > 0 ? (
                <AgentActivityPanel
                  events={msg.agentEvents}
                  isStreaming={isActive && msg === messages[messages.length - 1]}
                  provider={msg.role === 'claude' ? 'claude' : 'codex'}
                />
              ) : (
                <div
                  className="message-content rounded-md px-3 py-2.5 text-xs"
                  style={{
                    background: 'var(--bg-2)',
                    border: '1px solid var(--border)',
                    lineHeight: 1.6,
                  }}
                >
                  <MarkdownMessage
                    content={msg.content}
                    isStreaming={isActive && msg === messages[messages.length - 1]}
                  />
                </div>
              )}
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Activity Bar */}
      <ActivityBar
        isActive={isActive}
        latestEvent={latestAgentEvent}
        selectedMode={selectedMode}
      />

      {/* Apply Code Banner — shown when code generation is done */}
      {status === 'done' && (() => {
        const lastAgentMsg = [...messages].reverse().find(
          m => (m.role === 'claude' || m.role === 'codex')
        );

        // Agent mode: files already modified directly
        if (lastAgentMsg?.agentEvents?.length) {
          const fileCount = lastAgentMsg.filesChanged?.length || 0;
          if (fileCount === 0) return null;
          return (
            <div
              className="flex items-center justify-between px-4 py-2 flex-shrink-0"
              style={{ background: 'rgba(16,185,129,0.1)', borderTop: '1px solid rgba(16,185,129,0.3)' }}
            >
              <span className="text-xs" style={{ color: '#10b981' }}>
                Agent가 {fileCount}개 파일을 수정했습니다.
              </span>
              <button
                onClick={() => onShowDiff?.()}
                className="text-xs px-3 py-1 rounded font-medium transition"
                style={{ background: '#10b981', color: 'white', border: 'none' }}
              >
                Diff 보기
              </button>
            </div>
          );
        }

        // Text mode: show apply banner
        if (lastAgentMsg?.content?.includes('```')) {
          return (
            <div
              className="flex items-center justify-between px-4 py-2 flex-shrink-0"
              style={{ background: 'rgba(16,185,129,0.1)', borderTop: '1px solid rgba(16,185,129,0.3)' }}
            >
              <span className="text-xs" style={{ color: '#10b981' }}>
                코드 생성 완료 — 프로젝트에 적용하시겠습니까?
              </span>
              <div className="flex gap-2">
                <button onClick={() => onShowDiff?.()} className="text-xs px-3 py-1 rounded transition"
                  style={{ background: 'var(--bg-3)', color: 'var(--text-2)', border: '1px solid var(--border)' }}>
                  Diff 보기
                </button>
                <button onClick={() => onApplyCode?.()} className="text-xs px-3 py-1 rounded font-medium transition"
                  style={{ background: '#10b981', color: 'white', border: 'none' }}>
                  코드 적용
                </button>
              </div>
            </div>
          );
        }

        return null;
      })()}

      {/* Input */}
      <div
        className="flex-shrink-0 px-4 py-3"
        style={{ borderTop: '1px solid var(--border)', background: 'var(--bg-1)' }}
      >
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs" style={{ color: 'var(--text-3)' }}>Project</span>
          <input
            type="text"
            value={projectPath}
            onChange={(e) => onProjectPathChange(e.target.value)}
            placeholder="/path/to/your/project"
            className="flex-1 text-xs rounded px-2 py-1 outline-none transition"
            style={{
              background: 'var(--bg-2)',
              border: '1px solid var(--border)',
              color: 'var(--text-2)',
            }}
            onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--accent)')}
            onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
          />
          <button
            onClick={onOpenDirectory}
            className="text-xs px-2 py-1 rounded transition"
            style={{ background: 'var(--bg-3)', color: 'var(--text-2)', border: '1px solid var(--border)' }}
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--accent)')}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
          >
            Browse
          </button>
        </div>

        <div className="flex gap-2 items-end relative">
          {/* Slash Command Palette */}
          {slashCmds.showPalette && (
            <SlashCommandPalette
              commands={slashCmds.filteredCommands}
              selectedIndex={slashCmds.selectedIndex}
              visible={slashCmds.showPalette}
              onSelect={handlePaletteSelect}
              onClose={slashCmds.closePalette}
            />
          )}

          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => handleInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isActive ? activeLabel : 'Describe what to build... (Enter to send, Shift+Enter for new line)'}
            rows={2}
            disabled={isActive}
            className="flex-1 text-xs rounded px-3 py-2 resize-none outline-none transition"
            style={{
              background: 'var(--bg-2)',
              border: '1px solid var(--border)',
              color: 'var(--text-1)',
            }}
            onFocus={(e) => !isActive && (e.currentTarget.style.borderColor = 'var(--accent)')}
            onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
          />
          <button
            onClick={handleSubmit}
            disabled={!input.trim() || !projectPath.trim() || isActive}
            className="text-xs px-4 py-2 rounded font-medium transition h-10"
            style={{
              background: isActive || !input.trim() || !projectPath.trim()
                ? 'var(--bg-3)'
                : 'var(--accent)',
              color: isActive || !input.trim() || !projectPath.trim()
                ? 'var(--text-3)'
                : 'white',
              border: 'none',
              cursor: isActive ? 'not-allowed' : 'pointer',
              minWidth: 96,
            }}
          >
            {isActive ? activeLabel : 'Send'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Readiness Dashboard — shown in empty state
// ============================================================================

function ReadinessDashboard({
  readiness,
  projectPath,
  selectedMode,
  onOpenDirectory,
  onOpenSettings,
  onModeChange,
}: {
  readiness: AppReadiness | null;
  projectPath: string;
  selectedMode: DebateMode;
  onOpenDirectory: () => void;
  onOpenSettings: (tab?: string) => void;
  onModeChange: (mode: DebateMode) => void;
}) {
  if (!readiness) {
    return (
      <div className="flex flex-col items-center justify-center h-full" style={{ color: 'var(--text-3)' }}>
        <div className="mb-6 text-4xl font-bold tracking-tight" style={{ color: 'var(--text-2)' }}>
          debaterAI
        </div>
        <p className="text-xs text-center max-w-xs leading-relaxed" style={{ color: 'var(--text-3)' }}>
          Two AI agents debate every decision before writing a single line of code.
        </p>
      </div>
    );
  }

  const { project, providers, modes } = readiness;

  return (
    <div className="flex flex-col items-center justify-center h-full gap-6" style={{ color: 'var(--text-3)' }}>
      <div className="text-3xl font-bold tracking-tight" style={{ color: 'var(--text-2)' }}>
        debaterAI
      </div>

      {/* Status Cards */}
      <div className="w-full max-w-sm space-y-2">
        <ProviderCard
          label="Project"
          ready={project.ready}
          detail={project.ready ? project.path.split('/').pop() || project.path : 'No project selected'}
          action={!project.ready ? { label: 'Browse', onClick: onOpenDirectory } : undefined}
        />
        <ProviderCard
          label="Claude"
          color="var(--claude)"
          ready={providers.claude.ready}
          detail={`${providers.claude.selectedTransport.toUpperCase()} · ${providers.claude.detail}`}
          modelLabel={providers.claude.modelLabel}
          action={!providers.claude.ready ? {
            label: providers.claude.status === 'needsCliInstall' ? 'Install Guide'
              : providers.claude.status === 'needsCliLogin' ? 'Login Guide'
              : 'Configure',
            onClick: () => onOpenSettings('claude'),
          } : undefined}
        />
        <ProviderCard
          label="Codex"
          color="var(--codex)"
          ready={providers.codex.ready}
          detail={`${providers.codex.selectedTransport.toUpperCase()} · ${providers.codex.detail}`}
          modelLabel={providers.codex.modelLabel}
          action={!providers.codex.ready ? {
            label: 'Configure',
            onClick: () => onOpenSettings('codex'),
          } : undefined}
        />
      </div>

      {/* Mode Selector */}
      <div className="flex gap-2">
        {modes.map((m) => (
          <ModeChip
            key={m.mode}
            mode={m}
            selected={m.mode === selectedMode}
            onClick={() => m.enabled && onModeChange(m.mode)}
          />
        ))}
      </div>

      <button
        onClick={() => onOpenSettings()}
        className="text-xs px-3 py-1.5 rounded transition"
        style={{ color: 'var(--text-3)', border: '1px solid var(--border)' }}
        onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--text-1)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-3)'; }}
      >
        Open Settings
      </button>
    </div>
  );
}

function ProviderCard({
  label,
  color,
  ready,
  detail,
  modelLabel,
  action,
}: {
  label: string;
  color?: string;
  ready: boolean;
  detail: string;
  modelLabel?: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div
      className="flex items-center justify-between px-3 py-2 rounded"
      style={{ background: 'var(--bg-1)', border: '1px solid var(--border)' }}
    >
      <div className="flex items-center gap-2 min-w-0">
        <span
          className="w-1.5 h-1.5 rounded-full flex-shrink-0"
          style={{ background: ready ? '#10b981' : '#ef4444' }}
        />
        <span className="text-xs font-medium" style={{ color: color || 'var(--text-2)' }}>
          {label}
        </span>
        <span className="text-xs truncate" style={{ color: 'var(--text-3)' }}>
          {detail}
        </span>
        {modelLabel && (
          <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'var(--bg-3)', color: 'var(--text-3)' }}>
            {modelLabel}
          </span>
        )}
      </div>
      {action && (
        <button
          onClick={action.onClick}
          className="text-xs px-2 py-0.5 rounded flex-shrink-0 transition"
          style={{ background: 'var(--accent)', color: 'white' }}
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

function ModeChip({ mode, selected, onClick }: { mode: ModeStatus; selected: boolean; onClick: () => void }) {
  const labels: Record<string, string> = {
    'debate': 'Debate',
    'claude-only': 'Claude Only',
    'codex-only': 'Codex Only',
  };
  const isActive = mode.enabled && selected;
  return (
    <button
      onClick={onClick}
      disabled={!mode.enabled}
      className="text-xs px-3 py-1.5 rounded transition"
      style={{
        background: isActive ? 'var(--accent)' : mode.enabled ? 'rgba(99,102,241,0.1)' : 'var(--bg-2)',
        color: isActive ? 'white' : mode.enabled ? 'var(--accent)' : 'var(--text-3)',
        border: `1px solid ${isActive ? 'var(--accent)' : mode.enabled ? 'rgba(99,102,241,0.3)' : 'var(--border)'}`,
        opacity: mode.enabled ? 1 : 0.4,
        cursor: mode.enabled ? 'pointer' : 'not-allowed',
      }}
      title={mode.blockers.length > 0 ? mode.blockers.join(', ') : selected ? 'Selected' : 'Click to select'}
    >
      {labels[mode.mode] || mode.mode}
    </button>
  );
}

function StatusBadge({ ready, label }: { ready: boolean; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <span
        className="w-1.5 h-1.5 rounded-full"
        style={{ background: ready ? '#10b981' : '#ef4444' }}
      />
      <span style={{ color: 'var(--text-3)' }}>{label}</span>
    </span>
  );
}
