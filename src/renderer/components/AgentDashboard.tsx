import React from 'react';
import { AgentActivityPanel } from './AgentActivityPanel';

interface TaskInfo {
  id: string;
  agent: 'claude' | 'codex';
  status: 'pending' | 'running' | 'done' | 'error' | 'merged' | 'cancelled';
  events: any[];
  filesChanged: string[];
  duration?: number;
  error?: string;
}

interface Props {
  tasks: TaskInfo[];
  compareReady: boolean;
  onMerge: (taskId: string) => void;
  onDiscard: (taskId: string) => void;
  onCompare: () => void;
}

/**
 * Conductor-style agent dashboard — shows parallel agent tasks as cards
 */
export function AgentDashboard({ tasks, compareReady, onMerge, onDiscard, onCompare }: Props) {
  if (tasks.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-xs" style={{ color: 'var(--text-3)' }}>
        Start a parallel debate to see agent activity here.
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--bg-0)' }}>
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-2 flex-shrink-0"
        style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-1)' }}
      >
        <span className="text-xs font-medium" style={{ color: 'var(--text-2)' }}>
          Agent Dashboard
        </span>
        {compareReady && (
          <button
            onClick={onCompare}
            className="text-xs px-3 py-1 rounded transition"
            style={{ background: 'var(--accent)', color: 'white' }}
          >
            Compare Results
          </button>
        )}
      </div>

      {/* Agent cards grid */}
      <div className="flex-1 overflow-y-auto p-3 gap-3 grid grid-cols-1 lg:grid-cols-2 auto-rows-min">
        {tasks.map((task) => (
          <AgentCard
            key={task.id}
            task={task}
            onMerge={() => onMerge(task.id)}
            onDiscard={() => onDiscard(task.id)}
          />
        ))}
      </div>
    </div>
  );
}

function AgentCard({ task, onMerge, onDiscard }: {
  task: TaskInfo;
  onMerge: () => void;
  onDiscard: () => void;
}) {
  const color = task.agent === 'claude' ? 'var(--claude)' : 'var(--codex)';
  const statusLabel = {
    pending: 'Pending',
    running: 'Working...',
    done: 'Complete',
    error: 'Error',
    merged: 'Merged',
    cancelled: 'Cancelled',
  }[task.status];

  const statusColor = {
    pending: 'var(--text-3)',
    running: 'var(--accent)',
    done: 'var(--codex)',
    error: '#ef4444',
    merged: 'var(--codex)',
    cancelled: 'var(--text-3)',
  }[task.status];

  return (
    <div
      className="rounded-lg flex flex-col overflow-hidden"
      style={{ border: '1px solid var(--border)', background: 'var(--bg-1)' }}
    >
      {/* Card header */}
      <div
        className="flex items-center justify-between px-3 py-2"
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        <div className="flex items-center gap-2">
          <span
            className="w-2 h-2 rounded-full"
            style={{ background: task.status === 'running' ? statusColor : color }}
          />
          <span className="text-xs font-semibold" style={{ color }}>
            {task.agent === 'claude' ? 'Claude' : 'Codex'}
          </span>
          <span className="text-xs" style={{ color: statusColor }}>
            {statusLabel}
          </span>
        </div>

        <div className="flex items-center gap-1">
          {task.filesChanged.length > 0 && (
            <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'var(--bg-3)', color: 'var(--text-3)' }}>
              {task.filesChanged.length} files
            </span>
          )}
          {task.duration && (
            <span className="text-xs" style={{ color: 'var(--text-3)' }}>
              {Math.round(task.duration / 1000)}s
            </span>
          )}
        </div>
      </div>

      {/* Activity stream */}
      <div className="flex-1 overflow-y-auto px-3 py-2 max-h-[300px]">
        {task.events.length > 0 ? (
          <AgentActivityPanel
            events={task.events}
            isStreaming={task.status === 'running'}
            provider={task.agent}
          />
        ) : (
          <div className="text-xs" style={{ color: 'var(--text-3)' }}>
            {task.status === 'pending' ? 'Waiting to start...' : 'No activity yet'}
          </div>
        )}
        {task.error && (
          <div className="text-xs mt-2 px-2 py-1 rounded"
            style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>
            {task.error}
          </div>
        )}
      </div>

      {/* Actions */}
      {task.status === 'done' && (
        <div
          className="flex items-center gap-2 px-3 py-2"
          style={{ borderTop: '1px solid var(--border)' }}
        >
          <button
            onClick={onMerge}
            className="flex-1 text-xs py-1.5 rounded transition"
            style={{ background: 'var(--accent)', color: 'white' }}
          >
            Merge to Main
          </button>
          <button
            onClick={onDiscard}
            className="text-xs py-1.5 px-3 rounded transition"
            style={{ background: 'var(--bg-3)', color: 'var(--text-3)' }}
          >
            Discard
          </button>
        </div>
      )}
    </div>
  );
}
