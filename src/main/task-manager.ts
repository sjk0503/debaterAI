// ============================================================================
// Task Manager — tracks individual agent tasks within a parallel session
// ============================================================================

import { v4 as uuidv4 } from 'uuid';
import { AgentEvent, AgentProvider } from '../shared/agent-events';

export type TaskStatus = 'pending' | 'running' | 'done' | 'error' | 'merged' | 'cancelled';

export interface TaskSpec {
  id: string;
  sessionId: string;
  prompt: string;
  agent: AgentProvider;
  agentId?: string;
  projectPath: string;
  baseBranch: string;
  worktreePath: string;
  branchName: string;
  status: TaskStatus;
  events: AgentEvent[];
  filesChanged: string[];
  startTime?: number;
  endTime?: number;
  error?: string;
}

export class TaskManager {
  private tasks: Map<string, TaskSpec> = new Map();

  create(opts: {
    sessionId: string;
    prompt: string;
    agent: AgentProvider;
    projectPath: string;
    baseBranch: string;
    worktreePath: string;
    branchName: string;
  }): TaskSpec {
    const task: TaskSpec = {
      id: uuidv4(),
      sessionId: opts.sessionId,
      prompt: opts.prompt,
      agent: opts.agent,
      projectPath: opts.projectPath,
      baseBranch: opts.baseBranch,
      worktreePath: opts.worktreePath,
      branchName: opts.branchName,
      status: 'pending',
      events: [],
      filesChanged: [],
    };
    this.tasks.set(task.id, task);
    return task;
  }

  get(taskId: string): TaskSpec | undefined {
    return this.tasks.get(taskId);
  }

  getForSession(sessionId: string): TaskSpec[] {
    return [...this.tasks.values()].filter((t) => t.sessionId === sessionId);
  }

  updateStatus(taskId: string, status: TaskStatus, error?: string): void {
    const task = this.tasks.get(taskId);
    if (!task) return;
    task.status = status;
    if (status === 'running') task.startTime = Date.now();
    if (status === 'done' || status === 'error') task.endTime = Date.now();
    if (error) task.error = error;
  }

  addEvent(taskId: string, event: AgentEvent): void {
    const task = this.tasks.get(taskId);
    if (!task) return;
    task.events.push(event);
    if (event.data.kind === 'file_write') {
      const fp = (event.data as any).filePath;
      if (fp && !task.filesChanged.includes(fp)) {
        task.filesChanged.push(fp);
      }
    }
  }

  setAgentId(taskId: string, agentId: string): void {
    const task = this.tasks.get(taskId);
    if (task) task.agentId = agentId;
  }

  delete(taskId: string): void {
    this.tasks.delete(taskId);
  }
}
