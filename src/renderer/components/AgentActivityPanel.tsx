import React, { useState, useRef, useEffect } from 'react';
import { AgentEvent } from '../../shared/agent-events';
import { MarkdownMessage } from './MarkdownMessage';

interface Props {
  events: AgentEvent[];
  isStreaming: boolean;
  provider: 'claude' | 'codex';
}

/**
 * Displays agent activity in real-time: text output, tool use cards,
 * file operations, bash commands — everything the agent does.
 */
export function AgentActivityPanel({ events, isStreaming, provider }: Props) {
  const endRef = useRef<HTMLDivElement>(null);
  const [expandedTools, setExpandedTools] = useState<Set<string>>(new Set());

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [events.length]);

  // Aggregate text deltas into a single text block
  const segments = buildSegments(events);

  const toggleTool = (id: string) => {
    setExpandedTools((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const color = provider === 'claude' ? 'var(--claude)' : 'var(--codex)';

  return (
    <div className="space-y-2">
      {segments.map((seg, i) => {
        switch (seg.type) {
          case 'text':
            return (
              <div key={i} className="message-content rounded-md px-3 py-2.5 text-xs"
                style={{ background: 'var(--bg-2)', border: '1px solid var(--border)', lineHeight: 1.6 }}>
                <MarkdownMessage
                  content={seg.text}
                  isStreaming={isStreaming && i === segments.length - 1}
                />
              </div>
            );

          case 'tool':
            return (
              <ToolCard
                key={seg.id}
                toolName={seg.toolName}
                detail={seg.detail}
                output={seg.output}
                isError={seg.isError}
                expanded={expandedTools.has(seg.id)}
                onToggle={() => toggleTool(seg.id)}
                color={color}
              />
            );

          case 'file_op':
            return (
              <FileOpCard key={i} filePath={seg.filePath} action={seg.action} color={color} />
            );

          case 'bash':
            return (
              <BashCard key={i} command={seg.command} output={seg.output} exitCode={seg.exitCode} />
            );

          case 'status':
            return (
              <div key={i} className="text-xs px-2 py-1" style={{ color: 'var(--text-3)' }}>
                {seg.message}
              </div>
            );

          case 'error':
            return (
              <div key={i} className="text-xs px-3 py-2 rounded"
                style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444' }}>
                {seg.message}
              </div>
            );

          default:
            return null;
        }
      })}
      <div ref={endRef} />
    </div>
  );
}

// ── Sub-Components ────────────────────────────────────────────────────

function ToolCard({ toolName, detail, output, isError, expanded, onToggle, color }: {
  toolName: string;
  detail: string;
  output?: string;
  isError?: boolean;
  expanded: boolean;
  onToggle: () => void;
  color: string;
}) {
  return (
    <div className="rounded text-xs" style={{ border: '1px solid var(--border)', background: 'var(--bg-1)' }}>
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-3 py-1.5 text-left"
        style={{ color: 'var(--text-2)' }}
      >
        <span style={{ color, fontSize: 10 }}>{expanded ? '▼' : '▶'}</span>
        <span className="font-mono" style={{ color }}>{toolName}</span>
        <span className="truncate flex-1" style={{ color: 'var(--text-3)' }}>{detail}</span>
        {isError && <span style={{ color: '#ef4444' }}>failed</span>}
      </button>
      {expanded && output && (
        <div className="px-3 py-2 font-mono text-xs overflow-x-auto"
          style={{ borderTop: '1px solid var(--border)', background: 'var(--bg-0)', color: 'var(--text-3)', whiteSpace: 'pre-wrap', maxHeight: 200, overflowY: 'auto' }}>
          {output}
        </div>
      )}
    </div>
  );
}

function FileOpCard({ filePath, action, color }: {
  filePath: string;
  action: 'read' | 'write';
  color: string;
}) {
  const icon = action === 'read' ? '📄' : '✏️';
  const label = action === 'read' ? 'Read' : 'Edited';
  return (
    <div className="flex items-center gap-2 px-3 py-1 text-xs rounded"
      style={{ background: 'var(--bg-1)', border: '1px solid var(--border)' }}>
      <span>{icon}</span>
      <span style={{ color }}>{label}</span>
      <span className="font-mono truncate" style={{ color: 'var(--text-2)' }}>{filePath}</span>
    </div>
  );
}

function BashCard({ command, output, exitCode }: {
  command: string;
  output?: string;
  exitCode?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const success = exitCode === undefined || exitCode === 0;
  return (
    <div className="rounded text-xs" style={{ border: '1px solid var(--border)', background: 'var(--bg-1)' }}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-1.5 text-left font-mono"
      >
        <span style={{ color: success ? 'var(--codex)' : '#ef4444' }}>$</span>
        <span className="truncate" style={{ color: 'var(--text-2)' }}>{command}</span>
        {exitCode !== undefined && (
          <span style={{ color: success ? 'var(--text-3)' : '#ef4444' }}>exit {exitCode}</span>
        )}
      </button>
      {expanded && output && (
        <div className="px-3 py-2 font-mono overflow-x-auto"
          style={{ borderTop: '1px solid var(--border)', background: 'var(--bg-0)', color: 'var(--text-3)', whiteSpace: 'pre-wrap', maxHeight: 200, overflowY: 'auto' }}>
          {output}
        </div>
      )}
    </div>
  );
}

// ── Segment Builder ─────────────────────────────────────────────────

type Segment =
  | { type: 'text'; text: string }
  | { type: 'tool'; id: string; toolName: string; detail: string; output?: string; isError?: boolean }
  | { type: 'file_op'; filePath: string; action: 'read' | 'write' }
  | { type: 'bash'; command: string; output?: string; exitCode?: number }
  | { type: 'status'; message: string }
  | { type: 'error'; message: string };

function buildSegments(events: AgentEvent[]): Segment[] {
  const segments: Segment[] = [];
  let currentText = '';

  const flushText = () => {
    if (currentText) {
      segments.push({ type: 'text', text: currentText });
      currentText = '';
    }
  };

  for (const event of events) {
    switch (event.data.kind) {
      case 'text_delta':
        currentText += event.data.text;
        break;

      case 'tool_use_start':
        flushText();
        segments.push({
          type: 'tool',
          id: event.data.toolId,
          toolName: event.data.toolName,
          detail: summarizeInput(event.data.input),
        });
        break;

      case 'tool_use_done': {
        // Find and update the matching tool segment
        const idx = segments.findLastIndex(
          (s) => s.type === 'tool' && s.id === event.data.toolId,
        );
        if (idx >= 0) {
          const s = segments[idx] as Extract<Segment, { type: 'tool' }>;
          s.output = event.data.output;
          s.isError = event.data.isError;
        }
        break;
      }

      case 'file_read':
        flushText();
        segments.push({ type: 'file_op', filePath: event.data.filePath, action: 'read' });
        break;

      case 'file_write':
        flushText();
        segments.push({ type: 'file_op', filePath: event.data.filePath, action: 'write' });
        break;

      case 'bash_exec':
        flushText();
        segments.push({ type: 'bash', command: event.data.command });
        break;

      case 'bash_result': {
        // Find and update matching bash segment
        const bi = segments.findLastIndex(
          (s) => s.type === 'bash' && s.command === event.data.command,
        );
        if (bi >= 0) {
          const s = segments[bi] as Extract<Segment, { type: 'bash' }>;
          s.output = event.data.stdout + (event.data.stderr ? '\n' + event.data.stderr : '');
          s.exitCode = event.data.exitCode;
        }
        break;
      }

      case 'status':
        flushText();
        segments.push({ type: 'status', message: event.data.message });
        break;

      case 'error':
        flushText();
        segments.push({ type: 'error', message: event.data.message });
        break;

      // agent_start, agent_done, thinking — skip in segments
    }
  }

  flushText();
  return segments;
}

function summarizeInput(input: Record<string, any>): string {
  if (input.file_path) return input.file_path;
  if (input.path) return input.path;
  if (input.command) return input.command;
  if (input.pattern) return input.pattern;
  if (input.query) return input.query;
  const keys = Object.keys(input);
  if (keys.length === 0) return '';
  return `${keys[0]}: ${String(input[keys[0]]).slice(0, 60)}`;
}
