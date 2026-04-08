import { spawn } from 'child_process';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { ClaudeCodeService } from './claude-code-service';
import { CodexCliService } from './codex-cli-service';

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
// Uses: claude --print --bare --system-prompt "..." --model MODEL
//       --output-format text|stream-json --max-turns 1
//
// Prompt is piped via stdin to avoid OS ARG_MAX limits on long debates.
// ============================================================================

export class ClaudeCliAdapter implements TransportAdapter {
  constructor(
    private cli: ClaudeCodeService,
    private model: string,
    private cwd: string,
  ) {}

  async ask(
    systemPrompt: string,
    messages: TransportMessage[],
    onStream?: (chunk: string) => void,
  ): Promise<string> {
    const prompt = this.buildPrompt(messages);

    if (onStream) {
      return this.spawnClaude(systemPrompt, prompt, 'stream-json', onStream);
    } else {
      return this.spawnClaude(systemPrompt, prompt, 'text');
    }
  }

  /**
   * Spawn claude CLI process. Prompt is piped via stdin to avoid ARG_MAX.
   */
  private spawnClaude(
    systemPrompt: string,
    prompt: string,
    outputFormat: 'text' | 'stream-json',
    onStream?: (chunk: string) => void,
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const args = [
        '--print',
        '--bare',
        '--output-format', outputFormat,
        '--system-prompt', systemPrompt,
        '--model', this.model,
        '--max-turns', '1',
      ];

      // Pass prompt as the CLI argument for short prompts,
      // pipe via stdin for long ones to avoid OS ARG_MAX
      const useStdin = Buffer.byteLength(prompt, 'utf8') > 100000;
      if (!useStdin) {
        args.push(prompt);
      }

      const proc = spawn('claude', args, {
        cwd: this.cwd,
        env: { ...process.env, FORCE_COLOR: '0' },
        timeout: 180000,
        stdio: useStdin ? ['pipe', 'pipe', 'pipe'] : ['ignore', 'pipe', 'pipe'],
      });

      // Pipe prompt via stdin if needed
      if (useStdin && proc.stdin) {
        proc.stdin.write(prompt);
        proc.stdin.end();
      }

      let fullText = '';
      let stderr = '';
      let lineBuffer = ''; // Buffer for partial JSON lines

      proc.stdout?.on('data', (data: Buffer) => {
        const text = data.toString();

        if (outputFormat === 'text') {
          // Plain text mode — pass through directly
          fullText += text;
          onStream?.(text);
          return;
        }

        // stream-json mode — buffer lines and parse complete JSON
        lineBuffer += text;
        const lines = lineBuffer.split('\n');
        // Keep the last (potentially incomplete) line in the buffer
        lineBuffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const parsed = JSON.parse(line);
            if (parsed.type === 'assistant' && parsed.message?.content) {
              for (const block of parsed.message.content) {
                if (block.type === 'text') {
                  fullText += block.text;
                  onStream?.(block.text);
                }
              }
            } else if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
              fullText += parsed.delta.text;
              onStream?.(parsed.delta.text);
            } else if (parsed.type === 'result' && parsed.result) {
              if (!fullText && typeof parsed.result === 'string') {
                fullText = parsed.result;
                onStream?.(parsed.result);
              }
            }
          } catch {
            // Not valid JSON — ignore incomplete fragments
          }
        }
      });

      proc.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      proc.on('close', (code: number | null) => {
        // Process any remaining buffered content
        if (lineBuffer.trim()) {
          if (outputFormat === 'text') {
            fullText += lineBuffer;
            onStream?.(lineBuffer);
          } else {
            try {
              const parsed = JSON.parse(lineBuffer);
              if (parsed.type === 'assistant' && parsed.message?.content) {
                for (const block of parsed.message.content) {
                  if (block.type === 'text') {
                    fullText += block.text;
                    onStream?.(block.text);
                  }
                }
              }
            } catch {
              // Ignore
            }
          }
        }

        if (code === 0 || fullText) {
          resolve(fullText);
        } else {
          reject(new Error(`Claude CLI exited with code ${code}: ${stderr}`));
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

export class CodexCliAdapter implements TransportAdapter {
  constructor(
    _cli: CodexCliService, // kept for future use (e.g. auth checks)
    private model: string,
    private cwd: string,
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
      const args = [
        'exec',
        '--json',
        '--ephemeral',
        '--sandbox', 'read-only',
        '-a', 'never',
        '--model', this.model,
        '-C', this.cwd,
      ];

      // Pipe via stdin for long prompts to avoid ARG_MAX
      const useStdin = Buffer.byteLength(prompt, 'utf8') > 100000;
      if (!useStdin) {
        args.push(prompt);
      }

      const proc = spawn('codex', args, {
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

        if (code === 0 || fullText) {
          resolve(fullText);
        } else {
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
