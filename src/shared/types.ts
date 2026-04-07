// ============================================================================
// debaterAI — Core Types
// ============================================================================

export type AIProvider = 'claude' | 'codex';
export type DebateMode = 'auto' | 'guided' | 'watch';
export type DebateStatus = 'idle' | 'thinking' | 'debating' | 'consensus' | 'coding' | 'done' | 'error';
export type Agreement = 'agree' | 'partial' | 'disagree';
export type MessageRole = 'user' | 'claude' | 'codex' | 'system';

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

export interface AISettings {
  claude: {
    authType: 'oauth' | 'apiKey';
    apiKey?: string;
    oauthToken?: string;
    model: string;
  };
  codex: {
    authType: 'oauth' | 'apiKey';
    apiKey?: string;
    oauthToken?: string;
    model: string;
  };
  debate: {
    mode: DebateMode;
    maxRounds: number;
    autoApply: boolean;
  };
}

export interface FileTreeItem {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: FileTreeItem[];
}
