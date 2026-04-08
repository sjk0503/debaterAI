import React from 'react';

interface Props {
  diff: string;
  onClose: () => void;
}

export function DiffView({ diff, onClose }: Props) {
  const lines = parseDiff(diff);

  return (
    <div className="flex flex-col h-full no-drag">
      <div className="h-10 flex items-center justify-between px-3 border-b border-[#383838] bg-[#1e1e1e]">
        <span className="text-xs text-gray-400 font-mono">📊 Diff View</span>
        <button onClick={onClose} className="text-gray-500 hover:text-white text-sm px-1">✕</button>
      </div>

      <div className="flex-1 overflow-auto bg-[#0d0d0d] p-0 font-mono text-xs selectable-text">
        {lines.length === 0 && (
          <div className="p-4 text-gray-600 text-center">변경 사항이 없습니다.</div>
        )}
        {lines.map((line, i) => (
          <div
            key={i}
            className={`px-3 py-0.5 whitespace-pre ${
              line.type === 'add'
                ? 'bg-green-900/30 text-green-300'
                : line.type === 'remove'
                  ? 'bg-red-900/30 text-red-300'
                  : line.type === 'header'
                    ? 'bg-blue-900/20 text-blue-300 font-bold'
                    : line.type === 'info'
                      ? 'text-cyan-400'
                      : 'text-gray-500'
            }`}
          >
            <span className="inline-block w-8 text-right mr-3 text-gray-600 select-none">
              {line.lineNum || ''}
            </span>
            {line.content}
          </div>
        ))}
      </div>
    </div>
  );
}

interface DiffLine {
  type: 'add' | 'remove' | 'context' | 'header' | 'info';
  content: string;
  lineNum?: number;
}

function parseDiff(diff: string): DiffLine[] {
  const lines: DiffLine[] = [];
  let lineNum = 0;

  for (const line of diff.split('\n')) {
    if (line.startsWith('diff --git')) {
      lines.push({ type: 'header', content: line });
    } else if (line.startsWith('@@')) {
      const match = line.match(/@@ -\d+,?\d* \+(\d+)/);
      if (match) lineNum = parseInt(match[1]) - 1;
      lines.push({ type: 'info', content: line });
    } else if (line.startsWith('+') && !line.startsWith('+++')) {
      lineNum++;
      lines.push({ type: 'add', content: line, lineNum });
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      lines.push({ type: 'remove', content: line });
    } else if (line.startsWith('---') || line.startsWith('+++')) {
      lines.push({ type: 'info', content: line });
    } else {
      lineNum++;
      lines.push({ type: 'context', content: line, lineNum });
    }
  }

  return lines;
}
