import React, { useEffect, useRef, useState } from 'react';

/**
 * Embedded terminal panel using xterm.js.
 * Connects to the main process TerminalService via IPC.
 */
export function TerminalPanel({ projectPath }: { projectPath: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<any>(null);
  const fitRef = useRef<any>(null);
  const [input, setInput] = useState('');
  const [running, setRunning] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [historyIdx, setHistoryIdx] = useState(-1);
  const outputRef = useRef<HTMLDivElement>(null);

  // Simple terminal — no xterm dependency issues in dev mode
  // Uses a text-based approach that's more reliable in Electron
  const [output, setOutput] = useState<Array<{ type: 'input' | 'stdout' | 'stderr' | 'exit'; text: string }>>([]);

  useEffect(() => {
    outputRef.current?.scrollTo(0, outputRef.current.scrollHeight);
  }, [output]);

  const runCommand = async () => {
    if (!input.trim() || running) return;
    const cmd = input.trim();
    setInput('');
    setRunning(true);
    setHistory((h) => [...h, cmd]);
    setHistoryIdx(-1);

    setOutput((o) => [...o, { type: 'input', text: `$ ${cmd}` }]);

    try {
      const result = await (window.api as any).terminalExec?.(cmd, projectPath || '.', 30000);
      if (result) {
        if (result.stdout) {
          setOutput((o) => [...o, { type: 'stdout', text: result.stdout }]);
        }
        if (result.stderr) {
          setOutput((o) => [...o, { type: 'stderr', text: result.stderr }]);
        }
        setOutput((o) => [...o, { type: 'exit', text: `exit ${result.code ?? 0}` }]);
      }
    } catch (err: any) {
      setOutput((o) => [...o, { type: 'stderr', text: err.message }]);
    }

    setRunning(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      runCommand();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (history.length > 0) {
        const newIdx = historyIdx < 0 ? history.length - 1 : Math.max(0, historyIdx - 1);
        setHistoryIdx(newIdx);
        setInput(history[newIdx]);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIdx >= 0) {
        const newIdx = historyIdx + 1;
        if (newIdx >= history.length) {
          setHistoryIdx(-1);
          setInput('');
        } else {
          setHistoryIdx(newIdx);
          setInput(history[newIdx]);
        }
      }
    }
  };

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--bg-0)' }}>
      {/* Header */}
      <div
        className="flex items-center px-3 py-1 flex-shrink-0"
        style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-1)' }}
      >
        <span className="text-xs font-medium" style={{ color: 'var(--text-3)' }}>Terminal</span>
        <span className="text-xs ml-2 truncate" style={{ color: 'var(--text-3)' }}>
          {projectPath || '~'}
        </span>
        <div className="flex-1" />
        <button
          onClick={() => setOutput([])}
          className="text-xs px-1.5 transition"
          style={{ color: 'var(--text-3)' }}
          onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text-1)')}
          onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-3)')}
        >
          Clear
        </button>
      </div>

      {/* Output */}
      <div
        ref={outputRef}
        className="flex-1 overflow-y-auto px-3 py-2 font-mono text-xs message-content"
        style={{ lineHeight: 1.6 }}
      >
        {output.length === 0 && (
          <div style={{ color: 'var(--text-3)' }}>
            Type a command and press Enter.
          </div>
        )}
        {output.map((line, i) => (
          <div key={i} style={{
            color: line.type === 'input' ? 'var(--accent)'
              : line.type === 'stderr' ? '#ef4444'
              : line.type === 'exit' ? 'var(--text-3)'
              : 'var(--text-2)',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
          }}>
            {line.text}
          </div>
        ))}
        {running && (
          <div style={{ color: 'var(--text-3)' }}>Running...</div>
        )}
      </div>

      {/* Input */}
      <div
        className="flex items-center gap-2 px-3 py-1.5 flex-shrink-0"
        style={{ borderTop: '1px solid var(--border)', background: 'var(--bg-1)' }}
      >
        <span className="text-xs font-mono" style={{ color: 'var(--accent)' }}>$</span>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={running ? 'Running...' : 'command'}
          disabled={running}
          className="flex-1 text-xs font-mono bg-transparent border-none outline-none"
          style={{ color: 'var(--text-1)' }}
          autoFocus
        />
      </div>
    </div>
  );
}
