// ============================================================================
// Checkpoint Service — snapshot project state before agent runs
//
// Uses git tags to mark safe points. Enables rollback if agent breaks things.
// ============================================================================

import { execFile } from 'child_process';
import { promisify } from 'util';

const exec = promisify(execFile);

export interface Checkpoint {
  id: string;
  projectPath: string;
  tag: string;
  timestamp: number;
  description: string;
}

export class CheckpointService {
  private checkpoints: Map<string, Checkpoint> = new Map();

  /**
   * Create a checkpoint (git tag) before an agent run.
   * Stages and commits all current changes so the tag captures the full state.
   * Returns error if the state can't be captured cleanly.
   */
  async create(projectPath: string, description: string): Promise<Checkpoint> {
    const id = `debaterai-cp-${Date.now()}`;
    const tag = `checkpoint/${id}`;

    // Commit all current changes so the tag captures them
    const { stdout: status } = await this.git(projectPath, ['status', '--porcelain']);
    if (status.trim()) {
      await this.git(projectPath, ['add', '-A']);
      await this.git(projectPath, ['commit', '-m', `checkpoint: ${description}`]);
    }

    // Create tag at current HEAD
    await this.git(projectPath, ['tag', tag]);

    const checkpoint: Checkpoint = {
      id,
      projectPath,
      tag,
      timestamp: Date.now(),
      description,
    };

    this.checkpoints.set(id, checkpoint);
    return checkpoint;
  }

  /**
   * Rollback to a checkpoint.
   * Resets tracked files AND removes untracked files created after the checkpoint.
   */
  async rollback(checkpointId: string): Promise<{ success: boolean; error?: string }> {
    const checkpoint = this.checkpoints.get(checkpointId);
    if (!checkpoint) return { success: false, error: 'Checkpoint not found' };

    try {
      // Reset tracked files
      await this.git(checkpoint.projectPath, ['reset', '--hard', checkpoint.tag]);
      // Remove untracked files and directories
      await this.git(checkpoint.projectPath, ['clean', '-fd']);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  /**
   * List all checkpoints for a project
   */
  listForProject(projectPath: string): Checkpoint[] {
    return [...this.checkpoints.values()]
      .filter((c) => c.projectPath === projectPath)
      .sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Clean up old checkpoint tags
   */
  async cleanup(projectPath: string, keepLast = 5): Promise<void> {
    const checkpoints = this.listForProject(projectPath);
    const toRemove = checkpoints.slice(keepLast);

    for (const cp of toRemove) {
      try {
        await this.git(cp.projectPath, ['tag', '-d', cp.tag]);
      } catch {}
      this.checkpoints.delete(cp.id);
    }
  }

  private async git(cwd: string, args: string[]): Promise<{ stdout: string }> {
    return exec('git', args, {
      cwd,
      maxBuffer: 10 * 1024 * 1024,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
    });
  }
}
