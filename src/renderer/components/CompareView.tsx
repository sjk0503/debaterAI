import React, { useState } from 'react';

interface CompareData {
  claudeTaskId: string;
  codexTaskId: string;
  diff: string;
  claudeFiles: string[];
  codexFiles: string[];
}

interface Props {
  data: CompareData;
  onAccept: (taskId: string) => void;
  onClose: () => void;
}

/**
 * Side-by-side comparison of two agents' results.
 * Shows which files each agent changed and the diff between them.
 */
export function CompareView({ data, onAccept, onClose }: Props) {
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const allFiles = [...new Set([...data.claudeFiles, ...data.codexFiles])];

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--bg-0)' }}>
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-2 flex-shrink-0"
        style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-1)' }}
      >
        <span className="text-xs font-medium" style={{ color: 'var(--text-2)' }}>
          Compare: Claude vs Codex
        </span>
        <button
          onClick={onClose}
          className="text-xs px-2 py-0.5 rounded"
          style={{ color: 'var(--text-3)' }}
        >
          ✕
        </button>
      </div>

      {/* File comparison summary */}
      <div className="flex-shrink-0 px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
        <div className="grid grid-cols-2 gap-4 text-xs">
          {/* Claude column */}
          <div>
            <div className="font-semibold mb-1" style={{ color: 'var(--claude)' }}>
              Claude ({data.claudeFiles.length} files)
            </div>
            {data.claudeFiles.map((f) => (
              <div key={f} className="truncate py-0.5 font-mono" style={{ color: 'var(--text-2)' }}>
                {f}
              </div>
            ))}
            {data.claudeFiles.length === 0 && (
              <div style={{ color: 'var(--text-3)' }}>No changes</div>
            )}
          </div>

          {/* Codex column */}
          <div>
            <div className="font-semibold mb-1" style={{ color: 'var(--codex)' }}>
              Codex ({data.codexFiles.length} files)
            </div>
            {data.codexFiles.map((f) => (
              <div key={f} className="truncate py-0.5 font-mono" style={{ color: 'var(--text-2)' }}>
                {f}
              </div>
            ))}
            {data.codexFiles.length === 0 && (
              <div style={{ color: 'var(--text-3)' }}>No changes</div>
            )}
          </div>
        </div>
      </div>

      {/* Diff view */}
      <div className="flex-1 overflow-y-auto px-4 py-2 font-mono text-xs message-content">
        {data.diff ? (
          <pre style={{ color: 'var(--text-2)', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
            {data.diff}
          </pre>
        ) : (
          <div className="text-center py-8" style={{ color: 'var(--text-3)' }}>
            Both agents produced identical results, or no changes detected.
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div
        className="flex items-center gap-3 px-4 py-3 flex-shrink-0"
        style={{ borderTop: '1px solid var(--border)', background: 'var(--bg-1)' }}
      >
        <button
          onClick={() => onAccept(data.claudeTaskId)}
          className="flex-1 text-xs py-2 rounded font-medium transition"
          style={{ background: 'var(--claude)', color: 'white' }}
        >
          Accept Claude
        </button>
        <button
          onClick={() => onAccept(data.codexTaskId)}
          className="flex-1 text-xs py-2 rounded font-medium transition"
          style={{ background: 'var(--codex)', color: 'white' }}
        >
          Accept Codex
        </button>
        <button
          onClick={onClose}
          className="text-xs py-2 px-4 rounded transition"
          style={{ background: 'var(--bg-3)', color: 'var(--text-3)' }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
