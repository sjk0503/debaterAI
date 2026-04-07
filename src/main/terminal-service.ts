import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';

/**
 * 터미널 서비스 — 명령 실행, 스트리밍 출력
 */
export class TerminalService extends EventEmitter {
  private processes: Map<string, ChildProcess> = new Map();

  /**
   * 명령 실행 (결과 대기)
   */
  async exec(
    command: string,
    cwd: string,
    timeout = 30000,
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    return new Promise((resolve) => {
      const proc = spawn('sh', ['-c', command], {
        cwd,
        env: { ...process.env, FORCE_COLOR: '0' },
        timeout,
      });

      let stdout = '';
      let stderr = '';

      proc.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        resolve({ stdout, stderr, exitCode: code ?? 1 });
      });

      proc.on('error', (err) => {
        resolve({ stdout, stderr: err.message, exitCode: 1 });
      });
    });
  }

  /**
   * 명령 실행 (스트리밍 출력)
   */
  execStream(
    id: string,
    command: string,
    cwd: string,
    onData: (type: 'stdout' | 'stderr', data: string) => void,
    onExit: (code: number) => void,
  ): void {
    const proc = spawn('sh', ['-c', command], {
      cwd,
      env: { ...process.env, FORCE_COLOR: '1' },
    });

    this.processes.set(id, proc);

    proc.stdout?.on('data', (data) => {
      onData('stdout', data.toString());
    });

    proc.stderr?.on('data', (data) => {
      onData('stderr', data.toString());
    });

    proc.on('close', (code) => {
      this.processes.delete(id);
      onExit(code ?? 1);
    });

    proc.on('error', (err) => {
      this.processes.delete(id);
      onData('stderr', err.message);
      onExit(1);
    });
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
    for (const [id, proc] of this.processes) {
      proc.kill('SIGTERM');
    }
    this.processes.clear();
  }
}
