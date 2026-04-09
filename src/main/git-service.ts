import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';
import crypto from 'crypto';

const exec = promisify(execFile);

/**
 * Git 서비스 — 워크트리, 커밋, 브랜치, diff 관리
 */
export class GitService {
  /**
   * Git 저장소인지 확인
   */
  async isGitRepo(projectPath: string): Promise<boolean> {
    try {
      await this.git(projectPath, ['rev-parse', '--is-inside-work-tree']);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Git 초기화
   */
  async init(projectPath: string): Promise<string> {
    return this.git(projectPath, ['init']);
  }

  /**
   * 현재 브랜치 이름
   */
  async currentBranch(projectPath: string): Promise<string> {
    const result = await this.git(projectPath, ['branch', '--show-current']);
    return result.trim();
  }

  /**
   * 브랜치 목록
   */
  async branches(projectPath: string): Promise<string[]> {
    const result = await this.git(projectPath, ['branch', '--list', '--format=%(refname:short)']);
    return result.trim().split('\n').filter(Boolean);
  }

  /**
   * 새 브랜치 생성
   */
  async createBranch(projectPath: string, branchName: string): Promise<string> {
    return this.git(projectPath, ['branch', branchName]);
  }

  /**
   * 브랜치 전환
   */
  async checkout(projectPath: string, branchName: string): Promise<string> {
    return this.git(projectPath, ['checkout', branchName]);
  }

  /**
   * 새 브랜치 생성 + 전환
   */
  async checkoutNew(projectPath: string, branchName: string): Promise<string> {
    return this.git(projectPath, ['checkout', '-b', branchName]);
  }

  // ============================================================================
  // Worktree — 토론별 격리 환경
  // ============================================================================

  /**
   * 워크트리 생성 (토론별 격리)
   */
  async createWorktree(
    projectPath: string,
    debateId: string,
    baseBranch?: string,
  ): Promise<{ worktreePath: string; branchName: string; baseBranch: string }> {
    const branchName = `debate/${debateId.slice(0, 8)}`;
    const projectHash = crypto.createHash('md5').update(projectPath).digest('hex').slice(0, 8);
    const worktreeBase = path.join(os.homedir(), '.debaterai', 'worktrees', projectHash);
    const worktreePath = path.join(worktreeBase, debateId.slice(0, 8));

    await fs.mkdir(worktreeBase, { recursive: true });

    // 베이스 브랜치에서 새 워크트리+브랜치 생성
    const base = baseBranch || (await this.currentBranch(projectPath));
    await this.git(projectPath, ['worktree', 'add', '-b', branchName, worktreePath, base]);

    return { worktreePath, branchName, baseBranch: base };
  }

  /**
   * 워크트리 목록
   */
  async listWorktrees(projectPath: string): Promise<WorktreeInfo[]> {
    const result = await this.git(projectPath, ['worktree', 'list', '--porcelain']);
    const worktrees: WorktreeInfo[] = [];
    let current: Partial<WorktreeInfo> = {};

    for (const line of result.split('\n')) {
      if (line.startsWith('worktree ')) {
        if (current.path) worktrees.push(current as WorktreeInfo);
        current = { path: line.slice(9) };
      } else if (line.startsWith('HEAD ')) {
        current.head = line.slice(5);
      } else if (line.startsWith('branch ')) {
        current.branch = line.slice(7).replace('refs/heads/', '');
      } else if (line === 'bare') {
        current.bare = true;
      }
    }
    if (current.path) worktrees.push(current as WorktreeInfo);

    return worktrees;
  }

  /**
   * 워크트리 삭제
   */
  async removeWorktree(projectPath: string, worktreePath: string): Promise<string> {
    await this.git(projectPath, ['worktree', 'remove', worktreePath, '--force']);
    return 'removed';
  }

  // ============================================================================
  // Commit & Status
  // ============================================================================

  /**
   * 변경 사항 상태
   */
  async status(projectPath: string): Promise<string> {
    return this.git(projectPath, ['status', '--short']);
  }

  /**
   * 모든 파일 스테이징
   */
  async addAll(projectPath: string): Promise<string> {
    return this.git(projectPath, ['add', '-A']);
  }

  /**
   * 커밋
   */
  async commit(projectPath: string, message: string): Promise<string> {
    await this.addAll(projectPath);
    return this.git(projectPath, ['commit', '-m', message]);
  }

  /**
   * Diff (워킹 디렉토리 vs HEAD)
   */
  async diff(projectPath: string, cached = false): Promise<string> {
    const args = ['diff'];
    if (cached) args.push('--cached');
    args.push('--no-color');
    return this.git(projectPath, args);
  }

  /**
   * 두 브랜치 간 diff
   */
  async diffBranches(projectPath: string, from: string, to: string): Promise<string> {
    return this.git(projectPath, ['diff', from, to, '--no-color']);
  }

  /**
   * 최근 커밋 로그
   */
  async log(projectPath: string, count = 10): Promise<string> {
    return this.git(projectPath, [
      'log',
      `--max-count=${count}`,
      '--oneline',
      '--decorate',
    ]);
  }

  // ============================================================================
  // Merge
  // ============================================================================

  /**
   * 브랜치 머지
   */
  async merge(projectPath: string, branchName: string): Promise<string> {
    return this.git(projectPath, ['merge', branchName, '--no-ff', '-m', `Merge debate branch: ${branchName}`]);
  }

  /**
   * 워크트리 작업 완료 → 메인 브랜치에 머지 → 워크트리 삭제
   */
  async completeDebate(
    projectPath: string,
    worktreePath: string,
    branchName: string,
    commitMessage: string,
    targetBranch?: string,
  ): Promise<{ merged: boolean; error?: string }> {
    try {
      // 워크트리에서 커밋
      const status = await this.status(worktreePath);
      if (status.trim()) {
        await this.commit(worktreePath, commitMessage);
      }

      // 머지 대상 브랜치로 전환 (워크트리 생성 시점의 브랜치 사용)
      if (targetBranch) {
        await this.checkout(projectPath, targetBranch);
      }
      await this.merge(projectPath, branchName);

      // 워크트리 삭제
      await this.removeWorktree(projectPath, worktreePath);

      // debate 브랜치 삭제
      try {
        await this.git(projectPath, ['branch', '-d', branchName]);
      } catch {}

      return { merged: true };
    } catch (err: any) {
      return { merged: false, error: err.message };
    }
  }

  // ============================================================================
  // Worktree Comparison (Phase 4)
  // ============================================================================

  /**
   * Diff between two worktrees (via their branches)
   */
  async diffWorktrees(projectPath: string, branchA: string, branchB: string): Promise<string> {
    return this.git(projectPath, ['diff', branchA, branchB, '--no-color', '--stat']);
  }

  /**
   * Full diff between two branches (file content)
   */
  async diffWorktreesFull(projectPath: string, branchA: string, branchB: string): Promise<string> {
    return this.git(projectPath, ['diff', branchA, branchB, '--no-color']);
  }

  /**
   * List changed files between two branches
   */
  async changedFiles(projectPath: string, branchA: string, branchB: string): Promise<string[]> {
    const result = await this.git(projectPath, ['diff', '--name-only', branchA, branchB]);
    return result.trim().split('\n').filter(Boolean);
  }

  /**
   * Delete a branch (force)
   */
  async deleteBranch(projectPath: string, branchName: string): Promise<void> {
    try {
      await this.git(projectPath, ['branch', '-D', branchName]);
    } catch {
      // Branch may not exist
    }
  }

  // ============================================================================
  // Orphan Worktree Cleanup
  // ============================================================================

  /**
   * Remove orphan worktrees that are not in the active list.
   * Scans ~/.debaterai/worktrees/ for all project hash dirs and their worktree subdirs.
   */
  async cleanupOrphanWorktrees(activeWorktreePaths: string[]): Promise<number> {
    const activeSet = new Set(activeWorktreePaths.map(p => path.resolve(p)));
    const worktreesRoot = path.join(os.homedir(), '.debaterai', 'worktrees');
    let removed = 0;

    try {
      const projectDirs = await fs.readdir(worktreesRoot);
      for (const projectHash of projectDirs) {
        const projectDir = path.join(worktreesRoot, projectHash);
        const stat = await fs.stat(projectDir);
        if (!stat.isDirectory()) continue;

        const worktreeDirs = await fs.readdir(projectDir);
        for (const wtDir of worktreeDirs) {
          const wtPath = path.resolve(path.join(projectDir, wtDir));
          if (!activeSet.has(wtPath)) {
            try {
              await fs.rm(wtPath, { recursive: true, force: true });
              removed++;
            } catch {}
          }
        }

        // Remove empty project hash directory
        try {
          const remaining = await fs.readdir(projectDir);
          if (remaining.length === 0) {
            await fs.rmdir(projectDir);
          }
        } catch {}
      }
    } catch {
      // worktrees root doesn't exist yet — nothing to clean
    }

    return removed;
  }

  // ============================================================================
  // Internal
  // ============================================================================

  private async git(cwd: string, args: string[]): Promise<string> {
    const { stdout } = await exec('git', args, {
      cwd,
      maxBuffer: 10 * 1024 * 1024, // 10MB
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
    });
    return stdout;
  }
}

export interface WorktreeInfo {
  path: string;
  head?: string;
  branch?: string;
  bare?: boolean;
}
