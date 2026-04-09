import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { ClaudeCodeService } from './claude-code-service';
import { CodexCliService } from './codex-cli-service';
import { ClaudeStreamParser } from './stream-parsers/claude-stream-parser';

/**
 * Find and verify the Codex rollout JSONL file created during a debate exec.
 * Returns the resumable session UUID, or null if no valid rollout is found.
 *
 * Codex CLI writes sessions to ~/.codex/sessions/YYYY/MM/DD/rollout-<ts>-<uuid>.jsonl.
 * Verification (filename recency alone is racy):
 *   1. File mtime >= sinceMs (created during this exec)
 *   2. First JSONL line is `session_meta` with payload.id
 *   3. session_meta.payload.cwd matches expected cwd
 *   4. Optional sandbox policy check (skipped — only first turn matters)
 *
 * @param sinceMs  Timestamp before the exec started (filesystem clock safe)
 * @param expectedCwd  The projectPath passed to -C (for cwd match verification)
 */
function findLatestCodexRolloutSince(sinceMs: number, expectedCwd?: string): string | null {
  try {
    const sessionsRoot = path.join(os.homedir(), '.codex', 'sessions');
    if (!fs.existsSync(sessionsRoot)) return null;

    // Walk only recent YYYY/MM/DD dirs — today and yesterday cover creation window
    const now = new Date();
    const candidates: Array<{ full: string; mtime: number }> = [];

    for (let dayOffset = 0; dayOffset <= 1; dayOffset++) {
      const d = new Date(now.getTime() - dayOffset * 86400000);
      const yyyy = String(d.getFullYear());
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      const dayDir = path.join(sessionsRoot, yyyy, mm, dd);
      if (!fs.existsSync(dayDir)) continue;

      for (const name of fs.readdirSync(dayDir)) {
        if (!name.startsWith('rollout-') || !name.endsWith('.jsonl')) continue;
        const full = path.join(dayDir, name);
        try {
          const st = fs.statSync(full);
          if (st.mtimeMs >= sinceMs) {
            candidates.push({ full, mtime: st.mtimeMs });
          }
        } catch {}
      }
    }

    if (candidates.length === 0) return null;
    candidates.sort((a, b) => b.mtime - a.mtime);

    // Verify each candidate by reading session_meta + turn_context events.
    // We need:
    //   1. session_meta.payload.id — the resumable UUID
    //   2. session_meta.payload.cwd === expectedCwd (match current project)
    //   3. turn_context.payload.sandbox_policy.type === 'read-only' (debate contract)
    for (const cand of candidates) {
      try {
        // Read enough of the file to cover session_meta + first turn_context
        const fd = fs.openSync(cand.full, 'r');
        const buf = Buffer.alloc(64 * 1024); // 64KB covers the opening events
        const bytesRead = fs.readSync(fd, buf, 0, buf.length, 0);
        fs.closeSync(fd);

        const content = buf.subarray(0, bytesRead).toString('utf-8');
        const lines = content.split('\n').filter((l) => l.trim());

        let sessionMeta: any = null;
        let turnContext: any = null;
        for (const line of lines) {
          try {
            const ev = JSON.parse(line);
            if (!sessionMeta && ev.type === 'session_meta') sessionMeta = ev;
            if (!turnContext && ev.type === 'turn_context') turnContext = ev;
            if (sessionMeta && turnContext) break;
          } catch {}
        }

        if (!sessionMeta?.payload?.id) continue;
        if (expectedCwd && sessionMeta.payload.cwd !== expectedCwd) continue;

        // Verify sandbox policy if turn_context is present — debate contract is read-only
        const sbType = turnContext?.payload?.sandbox_policy?.type;
        if (sbType && sbType !== 'read-only') continue;

        return sessionMeta.payload.id;
      } catch {
        continue;
      }
    }

    return null;
  } catch {
    return null;
  }
}

// ============================================================================
// Transport Adapter — abstraction over API / CLI execution paths
// ============================================================================

export interface TransportMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface TransportAdapter {
  ask(
    systemPrompt: string,
    messages: TransportMessage[],
    onStream?: (chunk: string) => void,
  ): Promise<string>;
}

// ============================================================================
// Claude API Adapter — direct Anthropic SDK calls
// ============================================================================

export class ClaudeApiAdapter implements TransportAdapter {
  constructor(
    private client: Anthropic,
    private model: string,
    private maxTokens: number,
    private temperature: number,
  ) {}

  async ask(
    systemPrompt: string,
    messages: TransportMessage[],
    onStream?: (chunk: string) => void,
  ): Promise<string> {
    if (onStream) {
      const stream = this.client.messages.stream({
        model: this.model,
        max_tokens: this.maxTokens,
        temperature: this.temperature,
        system: systemPrompt,
        messages,
      });

      let fullText = '';
      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          fullText += event.delta.text;
          onStream(event.delta.text);
        }
      }
      return fullText;
    } else {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: this.maxTokens,
        temperature: this.temperature,
        system: systemPrompt,
        messages,
      });

      return response.content
        .filter((block): block is Anthropic.TextBlock => block.type === 'text')
        .map((block) => block.text)
        .join('');
    }
  }
}

// ============================================================================
// Claude CLI Adapter — delegates to locally installed Claude Code CLI
//
// Uses: claude --print --output-format text --system-prompt "..." --model MODEL
//       --max-turns 20
//
// Always uses --output-format text so stdout streams the response progressively.
// stream-json with --print only emits complete messages at turn end, not mid-turn.
// Prompt is piped via stdin to avoid OS ARG_MAX limits on long debates.
// ============================================================================

export interface ClaudeCliAdapterOptions {
  /** Session UUID — if set, this specific session will be used (new if sessionResume=false, resume if true) */
  sessionId?: string;
  /** If true, use --resume to continue existing session. If false, use --session-id to create new. */
  sessionResume?: boolean;
  /** If true, disable all tools (`--tools ""`) — used for debate mode (text-only responses) */
  disableTools?: boolean;
}

export class ClaudeCliAdapter implements TransportAdapter {
  constructor(
    private cli: ClaudeCodeService,
    private model: string,
    private cwd: string,
    private effort?: string,
    private options: ClaudeCliAdapterOptions = {},
  ) {}

  async ask(
    systemPrompt: string,
    messages: TransportMessage[],
    onStream?: (chunk: string) => void,
  ): Promise<string> {
    const prompt = this.buildPrompt(messages);
    return this.spawnClaude(systemPrompt, prompt, onStream);
  }

  /**
   * Spawn claude CLI process with stream-json for structured output.
   * Uses ClaudeStreamParser to extract text deltas for real-time streaming.
   */
  private spawnClaude(
    systemPrompt: string,
    prompt: string,
    onStream?: (chunk: string) => void,
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const args: string[] = [];

      // NOTE: --bare would be ideal for debate mode (strips MCP/plugins/hooks)
      // but it REQUIRES ANTHROPIC_API_KEY — "OAuth and keychain are never read".
      // CLI transport is specifically for subscription/OAuth users, so --bare
      // would break auth entirely. We rely on --tools "" + --max-turns 1 to
      // minimize pollution. Hidden turns from hooks/plugins may still happen
      // but they don't produce assistant text in stdout, so the final response
      // stays clean from the user's perspective.

      args.push(
        '--print',
        '--output-format', 'stream-json',
        '--verbose',
        '--model', this.model,
      );

      // Session management
      if (this.options.sessionResume && this.options.sessionId) {
        args.push('--resume', this.options.sessionId);
      } else {
        if (this.options.sessionId) {
          args.push('--session-id', this.options.sessionId);
        }
        args.push('--system-prompt', systemPrompt);
      }

      // Debate mode: disable ALL tools (built-in + MCP) and limit to single turn.
      //
      // Critical: `--tools ""` only disables built-in tools. MCP servers are
      // still loaded and Claude will try to invoke them (e.g., claude-mem,
      // codex-dialog), hitting permission walls and consuming the --max-turns
      // budget on tool attempts → exits with `error_max_turns`.
      //
      // Fix: combine `--strict-mcp-config --mcp-config '{"mcpServers":{}}'`
      // to override the default MCP config with an empty one, disabling all
      // MCP servers for this invocation.
      if (this.options.disableTools) {
        args.push('--tools', '');
        args.push('--strict-mcp-config');
        args.push('--mcp-config', '{"mcpServers":{}}');
        args.push('--max-turns', '1');
      } else {
        args.push('--max-turns', '20');
      }

      if (this.effort) {
        args.push('--effort', this.effort);
      }

      const useStdin = Buffer.byteLength(prompt, 'utf8') > 100000;
      if (!useStdin) {
        args.push(prompt);
      }

      const binaryPath = this.cli.resolveBinary();
      const proc = spawn(binaryPath, args, {
        cwd: this.cwd,
        env: { ...process.env, FORCE_COLOR: '0' },
        timeout: 300000,
        stdio: useStdin ? ['pipe', 'pipe', 'pipe'] : ['ignore', 'pipe', 'pipe'],
      });

      if (useStdin && proc.stdin) {
        proc.stdin.write(prompt);
        proc.stdin.end();
      }

      let stderr = '';
      let rawStdout = ''; // captured for error diagnostics

      // Use stream parser to extract text from structured events
      const parser = new ClaudeStreamParser(`cli-${Date.now()}`, (event: any) => {
        if (event.data?.kind === 'text_delta' && onStream) {
          onStream(event.data.text);
        }
      });

      proc.stdout?.on('data', (data: Buffer) => {
        const str = data.toString();
        rawStdout += str;
        parser.feed(str);
      });

      proc.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      proc.on('close', (code: number | null) => {
        parser.flush();
        const fullText = parser.getFullText();
        if (code === 143 || code === 137) {
          // SIGTERM/SIGKILL = cancelled, resolve with whatever we have
          resolve(fullText);
        } else if (code === 0) {
          resolve(fullText);
        } else {
          // Real error — include everything we captured for diagnosis
          const argsSanitized = args.map((a) => {
            if (a.length > 200) return `<${a.length}chars>`;
            return a;
          });
          const lastStdout = rawStdout.slice(-2000);
          const errorDetail = [
            `code=${code}`,
            `bin=${binaryPath}`,
            `cwd=${this.cwd}`,
            `args=${argsSanitized.join(' ')}`,
            `stderr=${stderr || '(empty)'}`,
            `stdout(tail)=${lastStdout || '(empty)'}`,
          ].join(' | ');
          console.error('[ClaudeCliAdapter] spawn failed:', errorDetail);
          reject(new Error(`Claude CLI exited with code ${code}: ${stderr || lastStdout.slice(0, 500) || '(no output)'}`));
        }
      });

      proc.on('error', (err: Error) => {
        reject(new Error(`Claude CLI spawn error: ${err.message}`));
      });
    });
  }

  /**
   * Combine multi-turn messages into a single prompt string.
   * CLI --print mode accepts one prompt, so we serialize the conversation.
   */
  private buildPrompt(messages: TransportMessage[]): string {
    if (messages.length === 1) {
      return messages[0].content;
    }

    const parts: string[] = [];
    for (const msg of messages) {
      const label = msg.role === 'user' ? 'User' : 'Assistant';
      parts.push(`[${label}]\n${msg.content}`);
    }
    return parts.join('\n\n');
  }
}

// ============================================================================
// OpenAI API Adapter — direct OpenAI SDK calls
// ============================================================================

export class OpenAIApiAdapter implements TransportAdapter {
  constructor(
    private client: OpenAI,
    private model: string,
    private maxTokens: number,
    private temperature: number,
    private reasoningEffort?: string,
  ) {}

  async ask(
    systemPrompt: string,
    messages: TransportMessage[],
    onStream?: (chunk: string) => void,
  ): Promise<string> {
    const openaiMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      ...messages.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
    ];

    const useReasoning = this.reasoningEffort && this.reasoningEffort !== 'none';

    const requestParams: any = {
      model: this.model,
      messages: openaiMessages,
      max_completion_tokens: this.maxTokens,
    };

    // Reasoning models don't support temperature
    if (!useReasoning) {
      requestParams.temperature = this.temperature;
    }

    if (useReasoning) {
      requestParams.reasoning_effort = this.reasoningEffort;
    }

    if (onStream) {
      requestParams.stream = true;
      const stream = await this.client.chat.completions.create(requestParams);

      let fullText = '';
      for await (const chunk of stream as AsyncIterable<OpenAI.Chat.ChatCompletionChunk>) {
        const delta = chunk.choices[0]?.delta?.content || '';
        fullText += delta;
        onStream(delta);
      }
      return fullText;
    } else {
      const response = await this.client.chat.completions.create(requestParams) as OpenAI.Chat.ChatCompletion;
      return response.choices[0]?.message?.content || '';
    }
  }
}

// ============================================================================
// Codex CLI Adapter — delegates to locally installed OpenAI Codex CLI
//
// Uses: codex exec --json --ephemeral --full-auto --model MODEL -C DIR "prompt"
//
// Codex CLI has no --system-prompt flag, so we prepend the system prompt
// to the user prompt.
// ============================================================================

export interface CodexCliAdapterOptions {
  /** Session UUID — captured from session_meta event on first exec, passed to resume on subsequent calls */
  sessionId?: string;
  /** If true, use `codex exec resume <sessionId>` to continue existing session */
  sessionResume?: boolean;
  /** Sandbox policy: 'read-only' (debate) or 'workspace-write' (implementation). Only applied on initial exec, not on resume. */
  sandbox?: 'read-only' | 'workspace-write';
  /** Callback invoked when a session_meta event is parsed (receives the new session UUID) */
  onSessionMeta?: (sessionId: string) => void;
}

export class CodexCliAdapter implements TransportAdapter {
  constructor(
    private cli: CodexCliService,
    private model: string,
    private cwd: string,
    private options: CodexCliAdapterOptions = {},
  ) {}

  async ask(
    systemPrompt: string,
    messages: TransportMessage[],
    onStream?: (chunk: string) => void,
  ): Promise<string> {
    // Codex CLI has no system-prompt flag — prepend it to the prompt
    const userPrompt = this.buildPrompt(messages);
    const fullPrompt = `## System Instructions\n${systemPrompt}\n\n## Task\n${userPrompt}`;

    return this.spawnCodex(fullPrompt, onStream);
  }

  private spawnCodex(
    prompt: string,
    onStream?: (chunk: string) => void,
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const useResume = this.options.sessionResume && this.options.sessionId;
      // Capture start time to detect rollout files created during this exec.
      // Codex `thread.started` event's id is NOT the resumable id — we must
      // find the actual rollout file that was written during this spawn.
      const startTime = Date.now() - 1000; // 1s backdate for filesystem clock drift

      const args: string[] = useResume
        ? [
            'exec',
            'resume',
            this.options.sessionId!,
            '--json',
            '--model', this.model,
          ]
        : [
            'exec',
            '--json',
            '--sandbox', this.options.sandbox || 'read-only',
            '--model', this.model,
            '-C', this.cwd,
          ];

      // Pipe via stdin for long prompts to avoid ARG_MAX
      const useStdin = Buffer.byteLength(prompt, 'utf8') > 100000;
      if (!useStdin) {
        args.push(prompt);
      }

      const proc = spawn(this.cli.getBinaryPath(), args, {
        env: { ...process.env, FORCE_COLOR: '0' },
        timeout: 180000,
        stdio: useStdin ? ['pipe', 'pipe', 'pipe'] : ['ignore', 'pipe', 'pipe'],
      });

      if (useStdin && proc.stdin) {
        proc.stdin.write(prompt);
        proc.stdin.end();
      }

      let fullText = '';
      let stderr = '';
      let lineBuffer = '';

      proc.stdout?.on('data', (data: Buffer) => {
        lineBuffer += data.toString();
        const lines = lineBuffer.split('\n');
        lineBuffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const event = JSON.parse(line);

            // NOTE: session_meta/thread.started ids are NOT reliably resumable.
            // The real resumable id comes from the rollout file written on disk,
            // which we scan for in the close handler below.

            // Extract text from item.completed events with agent_message type
            if (event.type === 'item.completed' && event.item) {
              const item = event.item;
              if (item.type === 'agent_message' || item.type === 'assistant_message') {
                const text = extractItemText(item);
                if (text) {
                  fullText += text;
                  onStream?.(text);
                }
              }
            }

            // Handle errors
            if (event.type === 'error') {
              stderr += event.message || 'Unknown error';
            }
          } catch {
            // Not valid JSON — ignore
          }
        }
      });

      proc.stderr?.on('data', (data: Buffer) => {
        // Codex CLI prints status info to stderr — ignore non-errors
        const text = data.toString();
        if (!text.includes('Reading additional input') && !text.includes('codex-cli')) {
          stderr += text;
        }
      });

      proc.on('close', (code: number | null) => {
        // Process remaining buffer
        if (lineBuffer.trim()) {
          try {
            const event = JSON.parse(lineBuffer);
            if (event.type === 'item.completed' && event.item) {
              const item = event.item;
              if (item.type === 'agent_message' || item.type === 'assistant_message') {
                const text = extractItemText(item);
                if (text) {
                  fullText += text;
                  onStream?.(text);
                }
              }
            }
          } catch {
            // Ignore
          }
        }

        // Only for fresh exec (not resume): scan filesystem for the actual
        // rollout file written during this process. Verify the first
        // session_meta event matches our cwd to guard against race conditions
        // where another concurrent codex exec races with ours.
        if (!useResume && this.options.onSessionMeta) {
          const rolloutUuid = findLatestCodexRolloutSince(startTime, this.cwd);
          if (rolloutUuid) {
            this.options.onSessionMeta(rolloutUuid);
          }
        }

        if (code === 143 || code === 137) {
          // SIGTERM/SIGKILL = cancelled, resolve with whatever we have
          resolve(fullText);
        } else if (code === 0) {
          resolve(fullText);
        } else {
          // Real error — reject even if there's partial text
          reject(new Error(`Codex CLI exited with code ${code}: ${stderr}`));
        }
      });

      proc.on('error', (err: Error) => {
        reject(new Error(`Codex CLI spawn error: ${err.message}`));
      });
    });
  }

  private buildPrompt(messages: TransportMessage[]): string {
    if (messages.length === 1) {
      return messages[0].content;
    }

    const parts: string[] = [];
    for (const msg of messages) {
      const label = msg.role === 'user' ? 'User' : 'Assistant';
      parts.push(`[${label}]\n${msg.content}`);
    }
    return parts.join('\n\n');
  }
}

// ============================================================================
// Helpers
// ============================================================================

/** Extract text from a Codex CLI item — handles both flat and nested content formats */
function extractItemText(item: any): string {
  // Format 1: item.text (flat)
  if (typeof item.text === 'string') return item.text;
  // Format 2: item.content[] array (OpenAI Responses API style)
  if (Array.isArray(item.content)) {
    return item.content
      .filter((c: any) => c.type === 'text' || c.type === 'output_text')
      .map((c: any) => c.text || '')
      .join('');
  }
  return '';
}
