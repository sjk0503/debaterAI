import { spawn, ChildProcess } from 'child_process';

/**
 * OpenAI Codex CLI 연동 서비스
 * codex exec를 subprocess로 실행
 */
export class CodexCliService {
  /**
   * Codex CLI가 설치되어 있는지 확인
   */
  async isAvailable(): Promise<boolean> {
    return new Promise((resolve) => {
      const proc = spawn('codex', ['--version'], { timeout: 5000 });
      let output = '';
      proc.stdout?.on('data', (d) => (output += d));
      proc.on('close', (code) => resolve(code === 0));
      proc.on('error', () => resolve(false));
    });
  }

  /**
   * Codex CLI 인증 상태 확인
   * codex는 ChatGPT 계정 인증을 사용하며, 실행 시 인증 여부가 확인됨
   */
  async getAuthStatus(): Promise<boolean> {
    return new Promise((resolve) => {
      // codex doesn't have a direct auth status command,
      // so we try a minimal exec to check if auth works
      const proc = spawn('codex', ['exec', '--ephemeral', '--json', '--model', 'gpt-5.4-nano', 'Say ok'], {
        timeout: 15000,
      });
      let output = '';
      proc.stdout?.on('data', (d) => (output += d));
      proc.on('close', (code) => {
        // Check if we got thread.started (means auth worked)
        resolve(output.includes('"type":"thread.started"'));
      });
      proc.on('error', () => resolve(false));
    });
  }
}
