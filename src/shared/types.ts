// ============================================================================
// debaterAI — Core Types
// ============================================================================

export type AIProvider = 'claude' | 'codex';
export type TransportType = 'api' | 'cli';
export type DebateMode = 'debate' | 'claude-only' | 'codex-only';
export type DebateStatus = 'idle' | 'thinking' | 'debating' | 'consensus' | 'coding' | 'done' | 'error';
export type Agreement = 'agree' | 'partial' | 'disagree';
export type MessageRole = 'user' | 'claude' | 'codex' | 'system';
export type ReasoningEffort = 'none' | 'low' | 'medium' | 'high';

export interface DebateMessage {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: number;
  round?: number;
  agreement?: Agreement;
  codeBlocks?: CodeBlock[];
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
  };
  git: {
    useWorktree: boolean;
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
