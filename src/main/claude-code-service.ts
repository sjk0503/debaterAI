import { spawn, ChildProcess, execSync } from 'child_process';
import { EventEmitter } from 'events';

/**
 * Claude Code CLI 연동 서비스
 * 실제 Claude Code를 subprocess로 실행하여 리서치/코딩 수행
 */
export class ClaudeCodeService extends EventEmitter {
  private processes: Map<string, ChildProcess> = new Map();
  private binaryPath: string | null = null;

  /**
   * Resolve the full path to claude binary (Electron may not inherit shell PATH)
   */
  resolveBinary(): string {
    if (this.binaryPath) return this.binaryPath;
    try {
      this.binaryPath = execSync('which claude', { encoding: 'utf8', timeout: 3000 }).trim();
    } catch {
      const fs = require('fs');
      const candidates = [
        `${process.env.HOME}/.local/bin/claude`,
        '/opt/homebrew/bin/claude',
        '/usr/local/bin/claude',
      ];
      for (const p of candidates) {
        if (fs.existsSync(p)) {
          this.binaryPath = p;
          return p;
        }
      }
      this.binaryPath = 'claude';
    }
    return this.binaryPath!;
  }

  /**
   * Claude Code CLI가 설치되어 있는지 확인
   */
  async isAvailable(): Promise<boolean> {
    return new Promise((resolve) => {
      const bin = this.resolveBinary();
      const proc = spawn(bin, ['--version'], { timeout: 5000 });
      proc.on('close', (code) => resolve(code === 0));
      proc.on('error', () => resolve(false));
    });
  }

  /**
   * Claude Code 인증 상태 확인
   */
  async getAuthStatus(): Promise<any> {
    return new Promise((resolve, reject) => {
      const proc = spawn(this.resolveBinary(), ['auth', 'status', '--json'], { timeout: 5000 });
      let output = '';
      proc.stdout?.on('data', (d) => (output += d));
      proc.on('close', () => {
        try {
          resolve(JSON.parse(output));
        } catch {
          reject(new Error('Failed to parse auth status'));
        }
      });
      proc.on('error', reject);
    });
  }

  /**
   * Claude Code로 명령 실행 (비대화형, 결과 반환)
   * --print 플래그로 결과만 출력
   */
  async execute(
    prompt: string,
    cwd: string,
    options: {
      model?: string;
      maxTurns?: number;
      allowedTools?: string[];
      timeout?: number;
    } = {},
  ): Promise<{ output: string; exitCode: number; isSpawnError?: boolean }> {
    return new Promise((resolve) => {
      const args = ['--print', '--output-format', 'text'];

      if (options.model) {
        args.push('--model', options.model);
      }
      if (options.maxTurns) {
        args.push('--max-turns', String(options.maxTurns));
      }
      if (options.allowedTools) {
        for (const tool of options.allowedTools) {
          args.push('--allowedTools', tool);
        }
      }

      args.push(prompt);

      const proc = spawn(this.resolveBinary(), args, {
        cwd,
        timeout: options.timeout || 120000,
        env: { ...process.env, FORCE_COLOR: '0' },
      });

      let output = '';
      let stderr = '';

      proc.stdout?.on('data', (data) => {
        output += data.toString();
      });

      proc.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        resolve({ output: output || stderr, exitCode: code ?? 1 });
      });

      proc.on('error', (err) => {
        resolve({ output: err.message, exitCode: -1, isSpawnError: true });
      });
    });
  }

  /**
   * Claude Code로 스트리밍 실행 (대화형)
   */
  executeStream(
    id: string,
    prompt: string,
    cwd: string,
    onData: (data: string) => void,
    onComplete: (exitCode: number) => void,
    options: {
      model?: string;
      maxTurns?: number;
      allowedTools?: string[];
    } = {},
  ): void {
    const args = ['--print', '--output-format', 'stream-json'];

    if (options.model) {
      args.push('--model', options.model);
    }
    if (options.maxTurns) {
      args.push('--max-turns', String(options.maxTurns));
    }
    if (options.allowedTools) {
      for (const tool of options.allowedTools) {
        args.push('--allowedTools', tool);
      }
    }

    args.push(prompt);

    const proc = spawn(this.resolveBinary(), args, {
      cwd,
      env: { ...process.env, FORCE_COLOR: '0' },
    });

    this.processes.set(id, proc);

    proc.stdout?.on('data', (data) => {
      const text = data.toString();
      // stream-json 포맷: 각 줄이 JSON
      for (const line of text.split('\n').filter(Boolean)) {
        try {
          const parsed = JSON.parse(line);
          if (parsed.type === 'assistant' && parsed.message?.content) {
            for (const block of parsed.message.content) {
              if (block.type === 'text') {
                onData(block.text);
              }
            }
          }
        } catch {
          // JSON이 아니면 그냥 텍스트로 전달
          onData(line);
        }
      }
    });

    proc.stderr?.on('data', (data) => {
      onData(`[stderr] ${data.toString()}`);
    });

    proc.on('close', (code) => {
      this.processes.delete(id);
      onComplete(code ?? 1);
    });

    proc.on('error', (err) => {
      this.processes.delete(id);
      onData(`[error] ${err.message}`);
      onComplete(1);
    });
  }

  /**
   * Agent Teams — 병렬 Claude Code 실행
   */
  async runTeam(
    tasks: { id: string; prompt: string; cwd: string }[],
    onTaskUpdate: (taskId: string, status: 'running' | 'done' | 'error', output: string) => void,
  ): Promise<Map<string, { output: string; exitCode: number }>> {
    const results = new Map<string, { output: string; exitCode: number }>();

    // 병렬 실행
    const promises = tasks.map(async (task) => {
      onTaskUpdate(task.id, 'running', 'Starting...');
      try {
        const result = await this.execute(task.prompt, task.cwd, { timeout: 300000 });
        results.set(task.id, result);
        onTaskUpdate(task.id, result.exitCode === 0 ? 'done' : 'error', result.output);
      } catch (err: any) {
        results.set(task.id, { output: err.message, exitCode: 1 });
        onTaskUpdate(task.id, 'error', err.message);
      }
    });

    await Promise.allSettled(promises);
    return results;
  }

  /**
   * 프로세스 종료
   */
  kill(id: string): boolean {
    const proc = this.processes.get(id);
    if (proc) {
      proc.kill('SIGTERM');
      this.processes.delete(id);
      return true;
    }
    return false;
  }

  /**
   * 모든 프로세스 종료
   */
  killAll(): void {
    for (const [, proc] of this.processes) {
      proc.kill('SIGTERM');
    }
    this.processes.clear();
  }
}
