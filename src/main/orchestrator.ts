// ============================================================================
// Orchestrator — Multi-agent parallel execution
//
// The v2 debate flow: Implement-Then-Compare
//   1. Create worktree per agent
//   2. Both agents implement the task in parallel
//   3. Compare results (diff between worktrees)
//   4. User chooses which result to keep or merge
// ============================================================================

import { v4 as uuidv4 } from 'uuid';
import { AgentRuntime } from './agent-runtime';
import { GitService } from './git-service';
import { TaskManager, TaskSpec } from './task-manager';
import { SessionStore } from './session-store';
import { AgentEvent, createAgentEvent } from '../shared/agent-events';

export type OrchestratorEventType =
  | 'task_created'
  | 'task_started'
  | 'task_agent_event'
  | 'task_completed'
  | 'task_error'
  | 'compare_ready'
  | 'merge_complete';

export interface OrchestratorEvent {
  type: OrchestratorEventType;
  sessionId: string;
  taskId?: string;
  data: any;
  timestamp: number;
}

export class Orchestrator {
  private taskManager: TaskManager;

  constructor(
    private agentRuntime: AgentRuntime,
    private gitService: GitService,
    private sessionStore: SessionStore,
  ) {
    this.taskManager = new TaskManager();
  }

  getTaskManager(): TaskManager {
    return this.taskManager;
  }

  /**
   * Start a parallel debate: Claude + Codex both implement independently
   */
  async startParallelDebate(opts: {
    sessionId: string;
    prompt: string;
    projectPath: string;
    claudeModel: string;
    codexModel: string;
    claudeSystemPrompt?: string;
    codexSystemPrompt?: string;
    effort?: string;
    onEvent: (event: OrchestratorEvent) => void;
  }): Promise<{ claudeTask: TaskSpec; codexTask: TaskSpec }> {
    const { sessionId, prompt, projectPath, onEvent } = opts;

    // Require git repo — don't auto-init
    const isRepo = await this.gitService.isGitRepo(projectPath);
    if (!isRepo) {
      throw new Error('Project must be a Git repository for parallel debate. Run "git init" first.');
    }

    const baseBranch = await this.gitService.currentBranch(projectPath);

    // Create worktrees for each agent
    const claudeWt = await this.gitService.createWorktree(projectPath, `claude-${sessionId.slice(0, 8)}`);
    const codexWt = await this.gitService.createWorktree(projectPath, `codex-${sessionId.slice(0, 8)}`);

    // Create tasks with server-side metadata
    const claudeTask = this.taskManager.create({
      sessionId,
      prompt,
      agent: 'claude',
      projectPath,
      baseBranch,
      worktreePath: claudeWt.worktreePath,
      branchName: claudeWt.branchName,
    });

    const codexTask = this.taskManager.create({
      sessionId,
      prompt,
      agent: 'codex',
      projectPath,
      baseBranch,
      worktreePath: codexWt.worktreePath,
      branchName: codexWt.branchName,
    });

    this.emitEvent(onEvent, 'task_created', sessionId, claudeTask.id, { agent: 'claude', worktree: claudeWt });
    this.emitEvent(onEvent, 'task_created', sessionId, codexTask.id, { agent: 'codex', worktree: codexWt });

    // Spawn both agents in parallel
    const claudePromise = this.runTask(claudeTask, {
      model: opts.claudeModel,
      systemPrompt: opts.claudeSystemPrompt,
      effort: opts.effort,
      onEvent,
    });

    const codexPromise = this.runTask(codexTask, {
      model: opts.codexModel,
      systemPrompt: opts.codexSystemPrompt,
      onEvent,
    });

    // Wait for both to finish
    await Promise.allSettled([claudePromise, codexPromise]);

    // Both done — compute diff between worktrees
    if (claudeTask.status === 'done' && codexTask.status === 'done') {
      try {
        const diff = await this.gitService.diffBranches(
          projectPath,
          claudeWt.branchName,
          codexWt.branchName,
        );
        this.emitEvent(onEvent, 'compare_ready', sessionId, undefined, {
          claudeTaskId: claudeTask.id,
          codexTaskId: codexTask.id,
          diff,
          claudeFiles: claudeTask.filesChanged,
          codexFiles: codexTask.filesChanged,
        });
      } catch (err: any) {
        // Diff may fail if no changes — that's ok
        this.emitEvent(onEvent, 'compare_ready', sessionId, undefined, {
          claudeTaskId: claudeTask.id,
          codexTaskId: codexTask.id,
          diff: '',
          claudeFiles: claudeTask.filesChanged,
          codexFiles: codexTask.filesChanged,
        });
      }
    }

    return { claudeTask, codexTask };
  }

  /**
   * Merge a task's worktree back to main
   */
  async mergeTask(
    taskId: string,
    commitMessage?: string,
  ): Promise<{ merged: boolean; error?: string }> {
    const task = this.taskManager.get(taskId);
    if (!task) return { merged: false, error: 'Task not found' };

    // Use server-side metadata — never trust client-supplied paths
    const result = await this.gitService.completeDebate(
      task.projectPath,
      task.worktreePath,
      task.branchName,
      commitMessage || `debaterai: merge ${task.agent} implementation`,
    );

    if (result.merged) {
      this.taskManager.updateStatus(taskId, 'merged');
    }

    return result;
  }

  /**
   * Clean up a task's worktree without merging
   */
  async discardTask(taskId: string): Promise<void> {
    const task = this.taskManager.get(taskId);
    if (!task) return;

    try {
      await this.gitService.removeWorktree(task.projectPath, task.worktreePath);
      await this.gitService.deleteBranch(task.projectPath, task.branchName);
    } catch {
      // Best effort cleanup
    }
    this.taskManager.updateStatus(taskId, 'cancelled');
  }

  // ── Internal ──────────────────────────────────────────────────────

  private async runTask(
    task: TaskSpec,
    opts: {
      model: string;
      systemPrompt?: string;
      effort?: string;
      onEvent: (event: OrchestratorEvent) => void;
    },
  ): Promise<void> {
    this.taskManager.updateStatus(task.id, 'running');
    this.emitEvent(opts.onEvent, 'task_started', task.sessionId, task.id, { agent: task.agent });

    try {
      const result = await this.agentRuntime.spawn({
        prompt: task.prompt,
        cwd: task.worktreePath,
        model: opts.model,
        provider: task.agent,
        systemPrompt: opts.systemPrompt,
        effort: opts.effort,
        onEvent: (agentEvent) => {
          this.taskManager.addEvent(task.id, agentEvent);
          this.emitEvent(opts.onEvent, 'task_agent_event', task.sessionId, task.id, agentEvent);

          // Also persist to session store
          this.sessionStore.append(task.sessionId, {
            type: 'agent_event',
            timestamp: agentEvent.timestamp,
            data: { kind: 'agent_event', event: agentEvent },
          });
        },
      });

      this.taskManager.setAgentId(task.id, result.agentId);
      task.filesChanged = result.filesChanged;

      // Commit changes in the worktree
      try {
        const status = await this.gitService.status(task.worktreePath);
        if (status.trim()) {
          await this.gitService.commit(
            task.worktreePath,
            `debaterai: ${task.agent} implementation`,
          );
        }
      } catch {
        // No changes to commit
      }

      this.taskManager.updateStatus(task.id, 'done');
      this.emitEvent(opts.onEvent, 'task_completed', task.sessionId, task.id, {
        agent: task.agent,
        filesChanged: result.filesChanged,
        duration: result.duration,
      });
    } catch (err: any) {
      this.taskManager.updateStatus(task.id, 'error', err.message);
      this.emitEvent(opts.onEvent, 'task_error', task.sessionId, task.id, {
        agent: task.agent,
        error: err.message,
      });
    }
  }

  private emitEvent(
    onEvent: (event: OrchestratorEvent) => void,
    type: OrchestratorEventType,
    sessionId: string,
    taskId: string | undefined,
    data: any,
  ): void {
    onEvent({ type, sessionId, taskId, data, timestamp: Date.now() });
  }
}
