// ============================================================================
// Claude CLI stream-json Parser
//
// Parses NDJSON output from: claude --print --output-format stream-json --verbose
//
// Event types from Claude CLI:
//   - message_start → message metadata
//   - content_block_start → new text or tool_use block
//   - content_block_delta → incremental text or tool input
//   - content_block_stop → block complete
//   - message_delta → stop reason, usage
//   - message_stop → end of message
//   - result → final summary (in some versions)
//
// All events may be wrapped in { type: "stream_event", event: {...} }
// ============================================================================

import {
  AgentEvent,
  AgentProvider,
  createAgentEvent,
  classifyTool,
} from '../../shared/agent-events';

interface PendingToolUse {
  toolId: string;
  toolName: string;
  inputJson: string;
}

export class ClaudeStreamParser {
  private lineBuffer = '';
  private fullText = '';
  private pendingToolUse: PendingToolUse | null = null;
  private toolsUsed: string[] = [];
  private filesChanged: string[] = [];

  constructor(
    private agentId: string,
    private onEvent: (event: AgentEvent) => void,
  ) {}

  /** Feed raw stdout data from the CLI process */
  feed(chunk: string): void {
    this.lineBuffer += chunk;
    const lines = this.lineBuffer.split('\n');
    this.lineBuffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.trim()) continue;
      this.parseLine(line);
    }
  }

  /** Flush any remaining buffer (call on process close) */
  flush(): void {
    if (this.lineBuffer.trim()) {
      this.parseLine(this.lineBuffer);
      this.lineBuffer = '';
    }
  }

  getFullText(): string { return this.fullText; }
  getFilesChanged(): string[] { return [...this.filesChanged]; }
  getToolsUsed(): string[] { return [...new Set(this.toolsUsed)]; }

  private parseLine(line: string): void {
    try {
      const raw = JSON.parse(line);
      // Unwrap stream_event envelope if present
      const event = raw.type === 'stream_event' ? raw.event : raw;
      this.processEvent(event);
    } catch {
      // Not JSON — could be raw text output from the CLI
      if (line.trim() && !line.startsWith('Reading ') && !line.startsWith('OpenAI ')) {
        this.fullText += line + '\n';
        this.emit('text_delta', { kind: 'text_delta', text: line + '\n' });
      }
    }
  }

  private processEvent(event: any): void {
    if (!event || !event.type) return;

    switch (event.type) {
      case 'content_block_start': {
        const block = event.content_block;
        if (block?.type === 'tool_use') {
          this.pendingToolUse = {
            toolId: block.id || `tool-${Date.now()}`,
            toolName: block.name || 'unknown',
            inputJson: '',
          };
          this.toolsUsed.push(block.name);
          this.emit('tool_use_start', {
            kind: 'tool_use_start',
            toolName: block.name,
            toolId: this.pendingToolUse.toolId,
            input: {},
          });

          // Classify and emit specific events
          const cls = classifyTool(block.name);
          if (cls === 'bash') {
            this.emit('status', { kind: 'status', message: `Running command...` });
          } else if (cls === 'file_read') {
            this.emit('status', { kind: 'status', message: `Reading file...` });
          } else if (cls === 'file_write') {
            this.emit('status', { kind: 'status', message: `Editing file...` });
          }
        } else if (block?.type === 'thinking') {
          this.emit('status', { kind: 'status', message: 'Thinking...' });
        }
        break;
      }

      case 'content_block_delta': {
        const delta = event.delta;
        if (delta?.type === 'text_delta' && delta.text) {
          this.fullText += delta.text;
          this.emit('text_delta', { kind: 'text_delta', text: delta.text });
        } else if (delta?.type === 'input_json_delta' && this.pendingToolUse) {
          this.pendingToolUse.inputJson += delta.partial_json || '';
        } else if (delta?.type === 'thinking_delta' && delta.thinking) {
          this.emit('thinking', { kind: 'thinking', text: delta.thinking });
        }
        break;
      }

      case 'content_block_stop': {
        if (this.pendingToolUse) {
          // Parse tool input to extract file path / command
          try {
            const input = JSON.parse(this.pendingToolUse.inputJson || '{}');
            const cls = classifyTool(this.pendingToolUse.toolName);

            if (cls === 'file_read' && input.file_path) {
              this.emit('file_read', { kind: 'file_read', filePath: input.file_path });
            } else if (cls === 'file_write' && input.file_path) {
              this.filesChanged.push(input.file_path);
              this.emit('file_write', { kind: 'file_write', filePath: input.file_path });
            } else if (cls === 'bash' && input.command) {
              this.emit('bash_exec', { kind: 'bash_exec', command: input.command });
            }
          } catch {
            // Failed to parse tool input
          }
        }
        break;
      }

      // Tool result comes as a separate assistant message with tool_result
      // In stream-json, results appear in the conversation flow

      case 'message_stop':
      case 'message_delta': {
        // End of a message turn
        break;
      }

      // Legacy formats (some CLI versions)
      case 'assistant': {
        if (event.message?.content) {
          for (const block of event.message.content) {
            if (block.type === 'text') {
              this.fullText += block.text;
              this.emit('text_delta', { kind: 'text_delta', text: block.text });
            } else if (block.type === 'tool_use') {
              this.toolsUsed.push(block.name);
              this.emit('tool_use_start', {
                kind: 'tool_use_start',
                toolName: block.name,
                toolId: block.id || `tool-${Date.now()}`,
                input: block.input || {},
              });
            }
          }
        }
        break;
      }

      case 'result': {
        if (event.result && typeof event.result === 'string' && !this.fullText) {
          this.fullText = event.result;
          this.emit('text_delta', { kind: 'text_delta', text: event.result });
        }
        break;
      }
    }
  }

  private emit(type: AgentEvent['type'], data: AgentEvent['data']): void {
    this.onEvent(createAgentEvent(type, this.agentId, 'claude', data));
  }
}
