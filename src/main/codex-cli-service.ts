import { spawn, execSync } from 'child_process';

/**
 * OpenAI Codex CLI 연동 서비스
 * codex exec를 subprocess로 실행
 */
export class CodexCliService {
  private binaryPath: string | null = null;

  /**
   * Resolve the full path to codex binary (Electron may not inherit shell PATH)
   */
  private resolveBinary(): string {
    if (this.binaryPath) return this.binaryPath;
    try {
      this.binaryPath = execSync('which codex', { encoding: 'utf8', timeout: 3000 }).trim();
    } catch {
      // Fallback to common locations
      const candidates = ['/opt/homebrew/bin/codex', '/usr/local/bin/codex'];
      const fs = require('fs');
      for (const p of candidates) {
        if (fs.existsSync(p)) {
          this.binaryPath = p;
          return p;
        }
      }
      this.binaryPath = 'codex'; // fallback to bare name
    }
    return this.binaryPath!;
  }

  /**
   * Codex CLI가 설치되어 있는지 확인
   */
  async isAvailable(): Promise<boolean> {
    return new Promise((resolve) => {
      const bin = this.resolveBinary();
      const proc = spawn(bin, ['--version'], { timeout: 5000 });
      proc.on('close', (code) => resolve(code === 0));
      proc.on('error', () => resolve(false));
    });
  }

  getBinaryPath(): string {
    return this.resolveBinary();
  }

  /**
   * Get auth info from ~/.codex/auth.json
   */
  async getAuthInfo(): Promise<{ loggedIn: boolean; email?: string; plan?: string } | null> {
    try {
      const fs = require('fs');
      const path = require('path');
      const authPath = path.join(process.env.HOME || '', '.codex', 'auth.json');
      if (!fs.existsSync(authPath)) return { loggedIn: false };

      const raw = JSON.parse(fs.readFileSync(authPath, 'utf8'));
      if (!raw.tokens?.id_token) return { loggedIn: false };

      // Decode JWT payload (base64url)
      const parts = raw.tokens.id_token.split('.');
      if (parts.length < 2) return { loggedIn: false };
      const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));

      return {
        loggedIn: true,
        email: payload.email || undefined,
        plan: payload['https://api.openai.com/auth']?.chatgpt_plan_type || undefined,
      };
    } catch {
      return null;
    }
  }
}
