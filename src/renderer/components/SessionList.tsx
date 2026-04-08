import React, { useState, useEffect } from 'react';

interface SessionMeta {
  id: string;
  prompt: string;
  projectPath: string;
  mode: string;
  status: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
  agents: string[];
  filesChanged: string[];
}

interface Props {
  currentSessionId: string | null;
  runningSessionId?: string | null;
  onSelectSession: (sessionId: string) => void;
  onDeleteSession: (sessionId: string) => void;
  refreshTrigger: number;
}

export function SessionList({ currentSessionId, runningSessionId, onSelectSession, onDeleteSession, refreshTrigger }: Props) {
  const [sessions, setSessions] = useState<SessionMeta[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    (window.api as any).sessionList?.()
      .then((list: SessionMeta[]) => {
        setSessions(list || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [refreshTrigger]);

  if (loading) {
    return (
      <div className="p-3 text-xs" style={{ color: 'var(--text-3)' }}>
        Loading sessions...
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div className="p-3 text-xs text-center" style={{ color: 'var(--text-3)' }}>
        No sessions yet.
        <br />
        Start a debate to create one.
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {sessions.map((session) => (
        <SessionCard
          key={session.id}
          session={session}
          isActive={session.id === currentSessionId}
          isRunning={session.id === runningSessionId}
          onSelect={() => onSelectSession(session.id)}
          onDelete={() => onDeleteSession(session.id)}
        />
      ))}
    </div>
  );
}

function SessionCard({ session, isActive, isRunning, onSelect, onDelete }: {
  session: SessionMeta;
  isActive: boolean;
  isRunning?: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) {
  const [showMenu, setShowMenu] = useState(false);
  const timeAgo = formatTimeAgo(session.updatedAt);
  const statusColor = session.status === 'done' ? 'var(--codex)'
    : session.status === 'error' ? '#ef4444'
    : session.status === 'idle' ? 'var(--text-3)'
    : 'var(--accent)';

  return (
    <div
      className="group px-3 py-2 cursor-pointer transition relative"
      style={{
        background: isActive ? 'var(--bg-3)' : 'transparent',
        borderLeft: isActive ? '2px solid var(--accent)' : '2px solid transparent',
      }}
      onClick={onSelect}
      onContextMenu={(e) => { e.preventDefault(); setShowMenu(!showMenu); }}
    >
      {/* Prompt preview */}
      <div className="text-xs truncate" style={{ color: 'var(--text-1)' }}>
        {session.prompt}
      </div>

      {/* Metadata row */}
      <div className="flex items-center gap-2 mt-1">
        <span
          className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${isRunning ? 'pulse' : ''}`}
          style={{ background: statusColor }}
        />
        <span className="text-xs" style={{ color: 'var(--text-3)' }}>
          {timeAgo}
        </span>
        {session.agents.map((a) => (
          <span
            key={a}
            className="text-xs"
            style={{ color: a === 'claude' ? 'var(--claude)' : 'var(--codex)' }}
          >
            {a === 'claude' ? 'C' : 'G'}
          </span>
        ))}
        {session.filesChanged.length > 0 && (
          <span className="text-xs" style={{ color: 'var(--text-3)' }}>
            {session.filesChanged.length} files
          </span>
        )}
      </div>

      {/* Context menu */}
      {showMenu && (
        <div
          className="absolute right-2 top-2 rounded shadow-lg py-1 z-50"
          style={{ background: 'var(--bg-3)', border: '1px solid var(--border)' }}
        >
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); setShowMenu(false); }}
            className="block w-full text-left px-3 py-1 text-xs hover:bg-red-900/30"
            style={{ color: '#ef4444' }}
          >
            삭제
          </button>
        </div>
      )}
    </div>
  );
}

function formatTimeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return '방금';
  if (mins < 60) return `${mins}분 전`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  return `${days}일 전`;
}
