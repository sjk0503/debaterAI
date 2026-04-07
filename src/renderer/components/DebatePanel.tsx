import React, { useState, useRef, useEffect } from 'react';
import { DebateMessage } from '../../shared/types';
import { MarkdownMessage } from './MarkdownMessage';

interface Props {
  messages: DebateMessage[];
  status: string;
  projectPath: string;
  onProjectPathChange: (path: string) => void;
  onOpenDirectory: () => void;
}

export function DebatePanel({ messages, status, projectPath, onProjectPathChange, onOpenDirectory }: Props) {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const isActive = status !== 'idle' && status !== 'done' && status !== 'error';

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = async () => {
    if (!input.trim() || !projectPath.trim() || isActive) return;
    await window.api.startDebate(input.trim(), projectPath.trim());
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    }
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
          <div className="flex flex-col items-center justify-center h-full" style={{ color: 'var(--text-3)' }}>
            <div className="mb-6 text-4xl font-bold tracking-tight" style={{ color: 'var(--text-2)' }}>
              debaterAI
            </div>
            <p className="text-xs text-center max-w-xs leading-relaxed" style={{ color: 'var(--text-3)' }}>
              Two AI agents debate every decision before writing a single line of code.
            </p>
          </div>
        )}

        {messages.map((msg) => {
          const meta = roleMeta[msg.role] || roleMeta.system;

          // System messages — 심플한 구분선
          if (msg.role === 'system') {
            return (
              <div key={msg.id} className="flex items-center gap-3 py-1">
                <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
                <span className="text-xs shrink-0" style={{ color: 'var(--text-3)' }}>
                  {msg.content}
                </span>
                <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
              </div>
            );
          }

          return (
            <div key={msg.id} className="group">
              {/* Header */}
              <div className="flex items-center gap-2 mb-1">
                <span
                  className="text-xs font-semibold"
                  style={{ color: meta.color }}
                >
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

              {/* Content */}
              <div
                className="rounded-md px-3 py-2.5 text-xs"
                style={{
                  background: 'var(--bg-2)',
                  border: '1px solid var(--border)',
                  lineHeight: 1.6,
                }}
              >
                <MarkdownMessage
                  content={msg.content}
                  isStreaming={
                    isActive &&
                    msg === messages[messages.length - 1]
                  }
                />
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div
        className="flex-shrink-0 px-4 py-3"
        style={{ borderTop: '1px solid var(--border)', background: 'var(--bg-1)' }}
      >
        {/* Project path row */}
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

        {/* Input row */}
        <div className="flex gap-2 items-end">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isActive ? 'Debating...' : 'Describe what to build... (⌘ Enter to start)'}
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
            {isActive ? 'Debating...' : 'Start Debate'}
          </button>
        </div>
      </div>
    </div>
  );
}
