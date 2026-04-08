// ============================================================================
// debaterAI v2 — Session Persistence Types
// ============================================================================

import { AgentEvent, AgentProvider } from './agent-events';
import { DebateMode, DebateStatus, Agreement } from './types';

// ── Session Events (each line in the JSONL file) ────────────────────────

export type SessionEventType =
  | 'session_start'
  | 'user_message'
  | 'debate_message'
  | 'agent_event'
  | 'status_change'
  | 'consensus'
  | 'system_message'
  | 'mode_change'
  | 'session_end';

export interface SessionEvent {
  type: SessionEventType;
  timestamp: number;
  data: SessionEventData;
}

export type SessionEventData =
  | { kind: 'session_start'; prompt: string; projectPath: string; mode: DebateMode }
  | { kind: 'user_message'; content: string }
  | { kind: 'debate_message'; role: 'claude' | 'codex'; content: string; round?: number; agreement?: string }
  | { kind: 'agent_event'; event: AgentEvent }
  | { kind: 'status_change'; status: DebateStatus }
  | { kind: 'consensus'; agreement: Agreement; round: number; decidedBy: string }
  | { kind: 'system_message'; content: string }
  | { kind: 'mode_change'; from: DebateMode; to: DebateMode }
  | { kind: 'session_end'; reason: 'completed' | 'cancelled' | 'error' };

// ── Session Metadata (fast listing without reading full JSONL) ──────────

export interface SessionMeta {
  id: string;
  prompt: string;
  projectPath: string;
  mode: DebateMode;
  status: DebateStatus;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
  agents: AgentProvider[];
  filesChanged: string[];
}
