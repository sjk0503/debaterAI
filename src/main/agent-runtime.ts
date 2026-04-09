// ============================================================================
// Agent Runtime — Spawn and manage CLI agents as real agents
//
// This is the core v2 service. Instead of treating CLI as text generators,
// we spawn them as full agents that read files, edit code, and run commands.
// We capture ALL their structured events and stream them to the UI.
// ============================================================================

import { spawn, ChildProcess, execSync } from 'child_process';
import { v4 as uuidv4 } from 'uuid';
import { AgentEvent, AgentProvider, AgentTerminalStatus, createAgentEvent } from '../shared/agent-events';
import { ClaudeStreamParser } from './stream-parsers/claude-stream-parser';
import { CodexStreamParser } from './stream-parsers/codex-stream-parser';

export interface AgentSpawnOptions {
  prompt: string;
  cwd: string;
  model: string;
  provider: AgentProvider;
  systemPrompt?: string;
  maxTurns?: number;
  effort?: string;           // Claude only: low/medium/high/max
  onEvent: (event: AgentEvent) => void;
}

export interface AgentRunResult {
  agentId: string;
  exitCode: number;
  status: AgentTerminalStatus;
  fullText: string;
  filesChanged: string[];
  toolsUsed: string[];
  duration: number;
}

interface AgentRun {
  agentId: string;
  provider: AgentProvider;
  process: ChildProcess;
  startTime: number;
  parser: ClaudeStreamParser | CodexStreamParser;
}

export class AgentRuntime {
  private runs: Map<string, AgentRun> = new Map();
  private cancelledSet: Set<string> = new Set();
  private claudeBin: string | null = null;
  private codexBin: string | null = null;

  constructor() {
    this.resolveBinaries();
  }

  private resolveBinaries(): void {
    this.claudeBin = this.findBinary('claude', [
      `${process.env.HOME}/.local/bin/claude`,
      '/opt/homebrew/bin/claude',
      '/usr/local/bin/claude',
    ]);
    this.codexBin = this.findBinary('codex', [
      '/opt/homebrew/bin/codex',
      '/usr/local/bin/codex',
    ]);
  }

  private findBinary(name: string, fallbacks: string[]): string {
    try {
      return execSync(`which ${name}`, { encoding: 'utf8', timeout: 3000 }).trim();
    } catch {
      const fs = require('fs');
      for (const p of fallbacks) {
        if (fs.existsSync(p)) return p;
      }
      return name;
    }
  }

  /** Spawn a CLI agent. Returns agentId immediately and a `done` promise for the result. */
  spawn(opts: AgentSpawnOptions): { agentId: string; done: Promise<AgentRunResult> } {
    const agentId = uuidv4();
    const startTime = Date.now();

    // Emit agent_start event
    opts.onEvent(createAgentEvent('agent_start', agentId, opts.provider, {
      kind: 'agent_start',
      provider: opts.provider,
      model: opts.model,
      cwd: opts.cwd,
    }));

    const done = opts.provider === 'claude'
      ? this.spawnClaude(agentId, opts, startTime)
      : this.spawnCodex(agentId, opts, startTime);

    return { agentId, done };
  }

  private spawnClaude(agentId: string, opts: AgentSpawnOptions, startTime: number): Promise<AgentRunResult> {
    return new Promise((resolve, reject) => {
      const bin = this.claudeBin || 'claude';
      const args = [
        '--print',
        '--output-format', 'stream-json',
        '--verbose',
        '--model', opts.model,
      ];

      if (opts.systemPrompt) {
        args.push('--system-prompt', opts.systemPrompt);
      }
      if (opts.maxTurns) {
        args.push('--max-turns', String(opts.maxTurns));
      }
      if (opts.effort) {
        args.push('--effort', opts.effort);
      }

      // Pipe prompt via stdin if too long
      const useStdin = Buffer.byteLength(opts.prompt, 'utf8') > 100000;
      if (!useStdin) {
        args.push(opts.prompt);
      }

      const proc = spawn(bin, args, {
        cwd: opts.cwd,
        env: { ...process.env, FORCE_COLOR: '0' },
        timeout: 600000, // 10 min
        stdio: useStdin ? ['pipe', 'pipe', 'pipe'] : ['ignore', 'pipe', 'pipe'],
      });

      if (useStdin && proc.stdin) {
        proc.stdin.write(opts.prompt);
        proc.stdin.end();
      }

      const parser = new ClaudeStreamParser(agentId, opts.onEvent);
      this.runs.set(agentId, { agentId, provider: 'claude', process: proc, startTime, parser });

      proc.stdout?.on('data', (data: Buffer) => parser.feed(data.toString()));
      proc.stderr?.on('data', () => {}); // Claude CLI writes status to stderr

      proc.on('close', (code: number | null) => {
        parser.flush();
        const isCancelled = this.cancelledSet.has(agentId);
        this.runs.delete(agentId);
        this.cancelledSet.delete(agentId);

        const status: AgentTerminalStatus = isCancelled
          ? 'cancelled'
          : code === 0
            ? 'success'
            : 'error';

        const result: AgentRunResult = {
          agentId,
          exitCode: code ?? 1,
          status,
          fullText: parser.getFullText(),
          filesChanged: parser.getFilesChanged(),
          toolsUsed: parser.getToolsUsed(),
          duration: Date.now() - startTime,
        };

        opts.onEvent(createAgentEvent('agent_done', agentId, 'claude', {
          kind: 'agent_done',
          exitCode: result.exitCode,
          status,
          totalText: result.fullText,
          filesChanged: result.filesChanged,
          toolsUsed: result.toolsUsed,
          duration: result.duration,
        }));

        resolve(result);
      });

      proc.on('error', (err: Error) => {
        this.runs.delete(agentId);
        opts.onEvent(createAgentEvent('error', agentId, 'claude', {
          kind: 'error',
          message: err.message,
        }));
        reject(err);
      });
    });
  }

  private spawnCodex(agentId: string, opts: AgentSpawnOptions, startTime: number): Promise<AgentRunResult> {
    return new Promise((resolve, reject) => {
      const bin = this.codexBin || 'codex';

      // Codex CLI has no --system-prompt, so prepend to prompt
      const fullPrompt = opts.systemPrompt
        ? `## System Instructions\n${opts.systemPrompt}\n\n## Task\n${opts.prompt}`
        : opts.prompt;

      const args = [
        'exec',
        '--json',
        '--ephemeral',
        '--full-auto',
        '--model', opts.model,
        '-C', opts.cwd,
      ];

      const useStdin = Buffer.byteLength(fullPrompt, 'utf8') > 100000;
      if (!useStdin) {
        args.push(fullPrompt);
      }

      const proc = spawn(bin, args, {
        cwd: opts.cwd,
        env: { ...process.env, FORCE_COLOR: '0' },
        timeout: 600000,
        stdio: useStdin ? ['pipe', 'pipe', 'pipe'] : ['ignore', 'pipe', 'pipe'],
      });

      if (useStdin && proc.stdin) {
        proc.stdin.write(fullPrompt);
        proc.stdin.end();
      }

      const parser = new CodexStreamParser(agentId, opts.onEvent);
      this.runs.set(agentId, { agentId, provider: 'codex', process: proc, startTime, parser });

      proc.stdout?.on('data', (data: Buffer) => parser.feed(data.toString()));
      proc.stderr?.on('data', () => {}); // Codex CLI writes status to stderr

      proc.on('close', (code: number | null) => {
        parser.flush();
        const isCancelled = this.cancelledSet.has(agentId);
        this.runs.delete(agentId);
        this.cancelledSet.delete(agentId);

        const status: AgentTerminalStatus = isCancelled
          ? 'cancelled'
          : code === 0
            ? 'success'
            : 'error';

        const result: AgentRunResult = {
          agentId,
          exitCode: code ?? 1,
          status,
          fullText: parser.getFullText(),
          filesChanged: parser.getFilesChanged(),
          toolsUsed: parser.getToolsUsed(),
          duration: Date.now() - startTime,
        };

        opts.onEvent(createAgentEvent('agent_done', agentId, 'codex', {
          kind: 'agent_done',
          exitCode: result.exitCode,
          status,
          totalText: result.fullText,
          filesChanged: result.filesChanged,
          toolsUsed: result.toolsUsed,
          duration: result.duration,
        }));

        resolve(result);
      });

      proc.on('error', (err: Error) => {
        this.runs.delete(agentId);
        opts.onEvent(createAgentEvent('error', agentId, 'codex', {
          kind: 'error',
          message: err.message,
        }));
        reject(err);
      });
    });
  }

  /** Kill a running agent */
  kill(agentId: string): boolean {
    const run = this.runs.get(agentId);
    if (!run) return false;
    this.cancelledSet.add(agentId);
    run.process.kill('SIGTERM');
    return true;
  }

  /** Kill all running agents */
  killAll(): void {
    for (const [agentId, run] of this.runs) {
      this.cancelledSet.add(agentId);
      run.process.kill('SIGTERM');
    }
  }

  /** Check how many agents are running */
  getRunningCount(): number {
    return this.runs.size;
  }

  /** Get IDs of all running agents */
  getRunningIds(): string[] {
    return [...this.runs.keys()];
  }

  isClaudeAvailable(): boolean { return this.claudeBin !== 'claude'; }
  isCodexAvailable(): boolean { return this.codexBin !== 'codex'; }
}
