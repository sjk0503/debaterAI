import React, { useState, useEffect, useRef } from 'react';

interface Props {
  isActive: boolean;
  latestEvent: any | null; // AgentEvent
  selectedMode: string;
}

export function ActivityBar({ isActive, latestEvent, selectedMode }: Props) {
  const [actionText, setActionText] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const startTimeRef = useRef<number>(0);
  const timerRef = useRef<number>(0);

  // Start/stop elapsed timer
  useEffect(() => {
    if (isActive) {
      startTimeRef.current = Date.now();
      timerRef.current = window.setInterval(() => {
        setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }, 1000);
    } else {
      clearInterval(timerRef.current);
      setElapsed(0);
    }
    return () => clearInterval(timerRef.current);
  }, [isActive]);

  // Update action text from latest event
  useEffect(() => {
    if (!latestEvent?.data) return;
    const { kind } = latestEvent.data;
    switch (kind) {
      case 'file_read':
        setActionText(`Reading ${shortenPath(latestEvent.data.filePath)}`);
        break;
      case 'file_write':
        setActionText(`Editing ${shortenPath(latestEvent.data.filePath)}`);
        break;
      case 'bash_exec':
        setActionText(`Running: ${truncate(latestEvent.data.command, 60)}`);
        break;
      case 'tool_use_start':
        setActionText(`${latestEvent.data.toolName}...`);
        break;
      case 'thinking':
        setActionText('Thinking...');
        break;
      case 'text_delta':
        setActionText('Writing response...');
        break;
      case 'status':
        setActionText(latestEvent.data.message || 'Processing...');
        break;
      default:
        break;
    }
  }, [latestEvent]);

  if (!isActive) return null;

  const providerColor = latestEvent?.provider === 'codex' ? 'var(--codex)' : 'var(--claude)';
  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return m > 0 ? `${m}:${sec.toString().padStart(2, '0')}` : `${sec}s`;
  };

  return (
    <div
      className="flex items-center gap-2 px-4 py-1 flex-shrink-0"
      style={{
        background: 'var(--bg-1)',
        borderTop: '1px solid var(--border)',
        height: 28,
        minHeight: 28,
      }}
    >
      {/* Spinner */}
      <span className="activity-spinner text-xs" style={{ color: providerColor }}>
        ◐
      </span>

      {/* Action text */}
      <span className="flex-1 text-xs truncate" style={{ color: 'var(--text-2)' }}>
        {actionText || 'Processing...'}
      </span>

      {/* Elapsed time */}
      <span className="text-xs font-mono flex-shrink-0" style={{ color: 'var(--text-3)' }}>
        {formatTime(elapsed)}
      </span>
    </div>
  );
}

function shortenPath(filePath: string): string {
  if (!filePath) return '';
  const parts = filePath.split('/');
  if (parts.length <= 3) return filePath;
  return '.../' + parts.slice(-2).join('/');
}

function truncate(str: string, maxLen: number): string {
  if (!str) return '';
  return str.length > maxLen ? str.slice(0, maxLen) + '...' : str;
}
