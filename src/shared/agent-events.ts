// ============================================================================
// debaterAI v2 — Unified Agent Event System
//
// Both Claude CLI (stream-json) and Codex CLI (JSONL) output is normalized
// into this event model for display in the UI.
// ============================================================================

export type AgentProvider = 'claude' | 'codex';

export type AgentEventType =
  | 'text_delta'       // streaming text chunk
  | 'text_done'        // full text block complete
  | 'tool_use_start'   // agent is calling a tool (Read, Edit, Bash, etc.)
  | 'tool_use_done'    // tool call complete with result
  | 'file_read'        // agent read a file
  | 'file_write'       // agent wrote/edited a file
  | 'bash_exec'        // agent ran a bash command
  | 'bash_result'      // bash command result
  | 'thinking'         // extended thinking / reasoning
  | 'error'            // error occurred
  | 'status'           // status message (e.g. "searching files...")
  | 'agent_start'      // agent process started
  | 'agent_done';      // agent process completed

export interface AgentEvent {
  type: AgentEventType;
  agentId: string;
  provider: AgentProvider;
  timestamp: number;
  data: AgentEventData;
}

// ── Event Data Types ────────────────────────────────────────────────────

export interface TextDeltaData {
  kind: 'text_delta';
  text: string;
}

export interface TextDoneData {
  kind: 'text_done';
  fullText: string;
}

export interface ToolUseStartData {
  kind: 'tool_use_start';
  toolName: string;
  toolId: string;
  input: Record<string, any>;
}

export interface ToolUseDoneData {
  kind: 'tool_use_done';
  toolName: string;
  toolId: string;
  output: string;
  isError: boolean;
}

export interface FileReadData {
  kind: 'file_read';
  filePath: string;
  lineCount?: number;
}

export interface FileWriteData {
  kind: 'file_write';
  filePath: string;
  diff?: string;
  linesChanged?: number;
}

export interface BashExecData {
  kind: 'bash_exec';
  command: string;
}

export interface BashResultData {
  kind: 'bash_result';
  command: string;
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface ThinkingData {
  kind: 'thinking';
  text: string;
}

export interface ErrorData {
  kind: 'error';
  message: string;
  code?: string;
}

export interface StatusData {
  kind: 'status';
  message: string;
}

export interface AgentStartData {
  kind: 'agent_start';
  provider: AgentProvider;
  model: string;
  cwd: string;
}

export interface AgentDoneData {
  kind: 'agent_done';
  exitCode: number;
  totalText: string;
  filesChanged: string[];
  toolsUsed: string[];
  duration: number;
}

export type AgentEventData =
  | TextDeltaData
  | TextDoneData
  | ToolUseStartData
  | ToolUseDoneData
  | FileReadData
  | FileWriteData
  | BashExecData
  | BashResultData
  | ThinkingData
  | ErrorData
  | StatusData
  | AgentStartData
  | AgentDoneData;

// ── Helpers ─────────────────────────────────────────────────────────────

export function createAgentEvent(
  type: AgentEventType,
  agentId: string,
  provider: AgentProvider,
  data: AgentEventData,
): AgentEvent {
  return { type, agentId, provider, timestamp: Date.now(), data };
}

/** Extract tool name from known tool patterns */
export function classifyTool(toolName: string): 'file_read' | 'file_write' | 'bash' | 'search' | 'other' {
  const lower = toolName.toLowerCase();
  if (lower === 'read' || lower === 'glob' || lower === 'grep') return 'file_read';
  if (lower === 'edit' || lower === 'write') return 'file_write';
  if (lower === 'bash' || lower === 'terminal' || lower === 'shell') return 'bash';
  if (lower === 'search' || lower === 'websearch') return 'search';
  return 'other';
}
