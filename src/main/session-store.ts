// ============================================================================
// Session Store — JSONL-based session persistence
//
// Each session is an append-only JSONL file + a metadata JSON file.
// Storage: ~/.debaterai/sessions/{sessionId}.jsonl
//          ~/.debaterai/sessions/{sessionId}.meta.json
// ============================================================================

import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { SessionEvent, SessionMeta } from '../shared/session-types';
import { DebateMode, DebateStatus } from '../shared/types';

export class SessionStore {
  private basePath: string;

  constructor(basePath?: string) {
    this.basePath = basePath || path.join(
      process.env.HOME || process.env.USERPROFILE || '.',
      '.debaterai',
      'sessions',
    );
    fs.mkdirSync(this.basePath, { recursive: true });
  }

  // ── Create ──────────────────────────────────────────────────────────

  create(opts: { prompt: string; projectPath: string; mode: DebateMode }): string {
    const id = uuidv4();
    const now = Date.now();

    const meta: SessionMeta = {
      id,
      prompt: opts.prompt,
      projectPath: opts.projectPath,
      mode: opts.mode,
      status: 'thinking',
      createdAt: now,
      updatedAt: now,
      messageCount: 0,
      agents: [],
      filesChanged: [],
    };

    this.writeMeta(id, meta);

    // Write initial session_start event
    this.append(id, {
      type: 'session_start',
      timestamp: now,
      data: {
        kind: 'session_start',
        prompt: opts.prompt,
        projectPath: opts.projectPath,
        mode: opts.mode,
      },
    });

    return id;
  }

  // ── Append ──────────────────────────────────────────────────────────

  append(sessionId: string, event: SessionEvent): void {
    const filePath = this.jsonlPath(sessionId);
    const line = JSON.stringify(event) + '\n';
    fs.appendFileSync(filePath, line, 'utf-8');

    // Update metadata
    try {
      const meta = this.getMeta(sessionId);
      if (meta) {
        meta.updatedAt = event.timestamp;
        meta.messageCount++;

        // Track agents
        if (event.data.kind === 'agent_event') {
          const provider = event.data.event.provider;
          if (!meta.agents.includes(provider)) {
            meta.agents.push(provider);
          }
          // Track file changes
          if (event.data.event.data.kind === 'file_write') {
            const fp = (event.data.event.data as any).filePath;
            if (fp && !meta.filesChanged.includes(fp)) {
              meta.filesChanged.push(fp);
            }
          }
        }

        // Track status
        if (event.data.kind === 'status_change') {
          meta.status = event.data.status;
        }

        this.writeMeta(sessionId, meta);
      }
    } catch {
      // Non-critical — metadata update failure won't lose events
    }
  }

  // ── Read ────────────────────────────────────────────────────────────

  readEvents(sessionId: string): SessionEvent[] {
    const filePath = this.jsonlPath(sessionId);
    if (!fs.existsSync(filePath)) return [];

    const content = fs.readFileSync(filePath, 'utf-8');
    const events: SessionEvent[] = [];

    for (const line of content.split('\n')) {
      if (!line.trim()) continue;
      try {
        events.push(JSON.parse(line));
      } catch {
        // Skip corrupted lines
      }
    }

    return events;
  }

  // ── List ────────────────────────────────────────────────────────────

  list(): SessionMeta[] {
    if (!fs.existsSync(this.basePath)) return [];

    const files = fs.readdirSync(this.basePath)
      .filter((f) => f.endsWith('.meta.json'))
      .map((f) => {
        try {
          const content = fs.readFileSync(path.join(this.basePath, f), 'utf-8');
          return JSON.parse(content) as SessionMeta;
        } catch {
          return null;
        }
      })
      .filter((m): m is SessionMeta => m !== null);

    // Sort by updatedAt descending (most recent first)
    return files.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  // ── Delete ──────────────────────────────────────────────────────────

  delete(sessionId: string): void {
    const jsonl = this.jsonlPath(sessionId);
    const meta = this.metaPath(sessionId);
    if (fs.existsSync(jsonl)) fs.unlinkSync(jsonl);
    if (fs.existsSync(meta)) fs.unlinkSync(meta);
  }

  // ── Metadata ────────────────────────────────────────────────────────

  getMeta(sessionId: string): SessionMeta | null {
    const filePath = this.metaPath(sessionId);
    if (!fs.existsSync(filePath)) return null;
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    } catch {
      return null;
    }
  }

  updateMeta(sessionId: string, patch: Partial<SessionMeta>): void {
    const meta = this.getMeta(sessionId);
    if (meta) {
      Object.assign(meta, patch);
      this.writeMeta(sessionId, meta);
    }
  }

  // ── Helpers ─────────────────────────────────────────────────────────

  private writeMeta(sessionId: string, meta: SessionMeta): void {
    fs.writeFileSync(this.metaPath(sessionId), JSON.stringify(meta, null, 2), 'utf-8');
  }

  private jsonlPath(sessionId: string): string {
    return path.join(this.basePath, `${sessionId}.jsonl`);
  }

  private metaPath(sessionId: string): string {
    return path.join(this.basePath, `${sessionId}.meta.json`);
  }
}
