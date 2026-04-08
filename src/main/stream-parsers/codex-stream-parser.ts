// ============================================================================
// Codex CLI JSONL Parser
//
// Parses NDJSON output from: codex exec --json
//
// Event types from Codex CLI:
//   - thread.started → session began
//   - turn.started → agent turn began
//   - item.started → individual item (command, message) started
//   - item.updated → item progress
//   - item.completed → item finished (agent_message, function_call, etc.)
//   - turn.completed → turn finished
//   - error → error occurred
// ============================================================================

import {
  AgentEvent,
  createAgentEvent,
} from '../../shared/agent-events';

export class CodexStreamParser {
  private lineBuffer = '';
  private fullText = '';
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

  /** Flush remaining buffer */
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
      const event = JSON.parse(line);
      this.processEvent(event);
    } catch {
      // Not valid JSON — ignore
    }
  }

  private processEvent(event: any): void {
    if (!event || !event.type) return;

    switch (event.type) {
      case 'thread.started': {
        this.emit('status', { kind: 'status', message: 'Agent session started' });
        break;
      }

      case 'turn.started': {
        this.emit('status', { kind: 'status', message: 'Agent working...' });
        break;
      }

      case 'item.started': {
        const item = event.item;
        if (!item) break;

        if (item.type === 'command_execution' || item.type === 'function_call') {
          const name = item.name || item.function?.name || 'command';
          this.toolsUsed.push(name);
          this.emit('tool_use_start', {
            kind: 'tool_use_start',
            toolName: name,
            toolId: item.id || `tool-${Date.now()}`,
            input: item.arguments ? JSON.parse(item.arguments) : (item.input || {}),
          });

          // Detect bash commands
          if (item.type === 'command_execution') {
            this.emit('bash_exec', {
              kind: 'bash_exec',
              command: item.command || item.input?.command || name,
            });
          }
        }
        break;
      }

      case 'item.completed': {
        const item = event.item;
        if (!item) break;

        // Agent text message
        if (item.type === 'agent_message' || item.type === 'assistant_message') {
          const text = this.extractText(item);
          if (text) {
            this.fullText += text;
            this.emit('text_delta', { kind: 'text_delta', text });
          }
        }

        // Function call result
        if (item.type === 'function_call_output' || item.type === 'command_output') {
          const output = item.output || item.text || '';
          this.emit('tool_use_done', {
            kind: 'tool_use_done',
            toolName: item.name || 'command',
            toolId: item.call_id || item.id || `tool-${Date.now()}`,
            output: typeof output === 'string' ? output : JSON.stringify(output),
            isError: !!item.error,
          });

          // Detect file operations from function call results
          if (item.name === 'write_file' || item.name === 'edit_file') {
            const path = item.arguments ? JSON.parse(item.arguments).path : '';
            if (path) {
              this.filesChanged.push(path);
              this.emit('file_write', { kind: 'file_write', filePath: path });
            }
          }
        }

        // Function call (tool use complete)
        if (item.type === 'function_call') {
          const name = item.name || item.function?.name || 'unknown';
          this.emit('tool_use_done', {
            kind: 'tool_use_done',
            toolName: name,
            toolId: item.id || `tool-${Date.now()}`,
            output: item.output || '',
            isError: false,
          });
        }
        break;
      }

      case 'turn.completed': {
        this.emit('status', { kind: 'status', message: 'Turn completed' });
        break;
      }

      case 'error': {
        const msg = event.message || event.error?.message || 'Unknown error';
        this.emit('error', { kind: 'error', message: msg });
        break;
      }

      case 'turn.failed': {
        const msg = event.error?.message || 'Turn failed';
        this.emit('error', { kind: 'error', message: msg });
        break;
      }
    }
  }

  /** Extract text from item — handles both flat and nested content formats */
  private extractText(item: any): string {
    if (typeof item.text === 'string') return item.text;
    if (Array.isArray(item.content)) {
      return item.content
        .filter((c: any) => c.type === 'text' || c.type === 'output_text')
        .map((c: any) => c.text || '')
        .join('');
    }
    return '';
  }

  private emit(type: AgentEvent['type'], data: AgentEvent['data']): void {
    this.onEvent(createAgentEvent(type, this.agentId, 'codex', data));
  }
}
