// ============================================================================
// debaterAI — Core Types
// ============================================================================

import { AgentEvent } from './agent-events';

export type AIProvider = 'claude' | 'codex';
export type TransportType = 'api' | 'cli';
export type DebateMode = 'debate' | 'claude-only' | 'codex-only';
export type DebateStatus = 'idle' | 'thinking' | 'debating' | 'consensus' | 'coding' | 'done' | 'error' | 'awaiting_confirmation' | 'awaiting_tiebreak' | 'worktree_review';
export type Agreement = 'agree' | 'partial' | 'disagree';
export type MessageRole = 'user' | 'claude' | 'codex' | 'system';
export type ReasoningEffort = 'none' | 'low' | 'medium' | 'high';
export type ClaudeEffort = 'low' | 'medium' | 'high' | 'max';

export interface DebateMessage {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: number;
  round?: number;
  agreement?: Agreement;
  codeBlocks?: CodeBlock[];
  agentEvents?: AgentEvent[];
  filesChanged?: string[];
  toolsUsed?: string[];
}

export interface CodeBlock {
  language: string;
  code: string;
  filePath?: string;
  action?: 'create' | 'modify' | 'delete';
}

export interface DebateSession {
  id: string;
  prompt: string;
  projectPath: string;
  projectContext: string;
  mode: DebateMode;
  status: DebateStatus;
  messages: DebateMessage[];
  rounds: DebateRound[];
  currentRound: number;
  maxRounds: number;
  consensus?: ConsensusResult;
  artifactMessageId?: string;
  executionCwd?: string;
  worktreePath?: string;
  worktreeBranch?: string;
  worktreeBaseBranch?: string;
  consensusPlan?: string;
  pendingUserInput?: string;
  /** Claude CLI session UUID for debate phase (tools disabled, max-turns 1) */
  claudeDebateSessionId?: string;
  /** Codex CLI session UUID for debate phase (captured from session_meta on first exec) */
  codexDebateSessionId?: string;
  createdAt: number;
  updatedAt: number;
}

export interface DebateRound {
  round: number;
  claudeResponse: string;
  codexResponse: string;
  agreement: Agreement;
  summary?: string;
}

export interface ConsensusResult {
  agreed: boolean;
  summary: string;
  approach: string;
  codeChanges: CodeChange[];
  decidedBy: 'mutual' | 'claude-priority' | 'user';
}

export interface CodeChange {
  filePath: string;
  action: 'create' | 'modify' | 'delete';
  content: string;
  diff?: string;
}

// ============================================================================
// Provider Settings — transport-aware, no OAuth
// ============================================================================

export interface ClaudeSettings {
  selectedTransport: TransportType;
  apiKey?: string;
  model: string;
  temperature: number;
  maxTokens: number;
  effort?: ClaudeEffort;
  systemPrompt?: string;
}

export interface OpenAISettings {
  selectedTransport: TransportType;
  apiKey?: string;
  model: string;
  temperature: number;
  maxTokens: number;
  reasoningEffort?: ReasoningEffort;
  systemPrompt?: string;
}

export interface AISettings {
  claude: ClaudeSettings;
  codex: OpenAISettings;
  debate: {
    preferredMode: DebateMode;
    maxRounds: number;
    autoApply: boolean;
    alwaysUseWorktree?: boolean;
  };
  git: {
    autoCommit: boolean;
    commitPrefix: string;
  };
  general: {
    theme: 'dark' | 'light';
    language: 'ko' | 'en';
    fontSize: number;
  };
}

// ============================================================================
// Readiness — provider status + mode gating
// ============================================================================

export type CliStatus = 'notInstalled' | 'notLoggedIn' | 'configured' | 'error';

export interface ProviderStatus {
  provider: AIProvider;
  selectedTransport: TransportType;
  supportedTransports: TransportType[];
  ready: boolean;
  status: 'configured' | 'needsKey' | 'needsCliLogin' | 'needsCliInstall' | 'error';
  detail: string;
  modelLabel?: string;
}

export interface ModeStatus {
  mode: DebateMode;
  enabled: boolean;
  blockers: string[];
}

export type ReadinessAction =
  | { type: 'browseProject' }
  | { type: 'openSettings'; tab: string }
  | { type: 'openExternalLink'; url: string }
  | { type: 'startMode'; mode: DebateMode };

export interface AppReadiness {
  project: { ready: boolean; path: string };
  providers: {
    claude: ProviderStatus;
    codex: ProviderStatus;
  };
  modes: ModeStatus[];
  preferredMode: DebateMode;
  primaryAction: ReadinessAction | null;
}

export interface FileTreeItem {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: FileTreeItem[];
}
