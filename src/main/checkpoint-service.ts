// ============================================================================
// Checkpoint Service — snapshot project state before agent runs
//
// Saves file-level snapshots to ~/.debaterai/checkpoints/{id}/.
// No git operations — safe for any project state.
// ============================================================================

import * as fs from 'fs/promises';
import * as path from 'path';
import { homedir } from 'os';

export interface Checkpoint {
  id: string;
  projectPath: string;
  snapshotPath: string;
  /** Files that existed and were snapshotted (relative to projectPath) */
  snapshotFiles: string[];
  /** Files that did not exist at checkpoint time — rollback will delete them */
  createdFiles: string[];
  timestamp: number;
  description: string;
}

const CHECKPOINTS_DIR = path.join(homedir(), '.debaterai', 'checkpoints');

export class CheckpointService {
  private checkpoints: Map<string, Checkpoint> = new Map();

  /**
   * Create a checkpoint by copying the current content of targetFiles.
   * Files that don't exist yet are recorded so rollback can delete them.
   */
  async create(
    projectPath: string,
    description: string,
    targetFiles: string[] = [],
  ): Promise<Checkpoint> {
    const id = `debaterai-cp-${Date.now()}`;
    const snapshotPath = path.join(CHECKPOINTS_DIR, id);
    await fs.mkdir(snapshotPath, { recursive: true });

    const snapshotFiles: string[] = [];
    const createdFiles: string[] = [];

    for (const relPath of targetFiles) {
      const absPath = path.isAbsolute(relPath)
        ? relPath
        : path.join(projectPath, relPath);
      const normalizedRel = path.isAbsolute(relPath)
        ? path.relative(projectPath, relPath)
        : relPath;

      try {
        const content = await fs.readFile(absPath);
        const dest = path.join(snapshotPath, normalizedRel);
        await fs.mkdir(path.dirname(dest), { recursive: true });
        await fs.writeFile(dest, content);
        snapshotFiles.push(normalizedRel);
      } catch {
        // File doesn't exist yet — record it so rollback can delete it
        createdFiles.push(normalizedRel);
      }
    }

    // Write metadata
    const checkpoint: Checkpoint = {
      id,
      projectPath,
      snapshotPath,
      snapshotFiles,
      createdFiles,
      timestamp: Date.now(),
      description,
    };

    await fs.writeFile(
      path.join(snapshotPath, '_checkpoint.json'),
      JSON.stringify(checkpoint, null, 2),
    );

    this.checkpoints.set(id, checkpoint);
    return checkpoint;
  }

  /**
   * Rollback to a checkpoint.
   * Restores snapshotted files and deletes files created after the checkpoint.
   */
  async rollback(checkpointId: string): Promise<{ success: boolean; error?: string }> {
    const checkpoint = this.checkpoints.get(checkpointId);
    if (!checkpoint) return { success: false, error: 'Checkpoint not found' };

    try {
      // Restore each snapshotted file
      for (const relPath of checkpoint.snapshotFiles) {
        const src = path.join(checkpoint.snapshotPath, relPath);
        const dest = path.join(checkpoint.projectPath, relPath);
        await fs.mkdir(path.dirname(dest), { recursive: true });
        await fs.copyFile(src, dest);
      }

      // Delete files that were created after the checkpoint
      for (const relPath of checkpoint.createdFiles) {
        const target = path.join(checkpoint.projectPath, relPath);
        try {
          await fs.unlink(target);
        } catch {
          // Already deleted or never created — ignore
        }
      }

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
   * Clean up old checkpoint snapshot directories
   */
  async cleanup(projectPath: string, keepLast = 5): Promise<void> {
    const checkpoints = this.listForProject(projectPath);
    const toRemove = checkpoints.slice(keepLast);

    for (const cp of toRemove) {
      try {
        await fs.rm(cp.snapshotPath, { recursive: true, force: true });
      } catch {}
      this.checkpoints.delete(cp.id);
    }
  }
}
