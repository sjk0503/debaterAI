import React from 'react';

interface Props {
  filePath: string;
  content: string;
  onClose: () => void;
}

export function CodeView({ filePath, content, onClose }: Props) {
  const fileName = filePath.split('/').pop() || '';
  const language = getLanguage(fileName);

  return (
    <div className="flex flex-col h-full no-drag">
      {/* Header */}
      <div className="h-10 flex items-center justify-between px-3 border-b border-[#383838] bg-[#1e1e1e]">
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">{fileName}</span>
          <span className="text-[10px] text-gray-600">{language}</span>
        </div>
        <button
          onClick={onClose}
          className="text-gray-500 hover:text-white text-sm px-1"
        >
          ✕
        </button>
      </div>

      {/* Code Content - TODO: Replace with Monaco Editor */}
      <div className="flex-1 overflow-auto bg-[#1e1e1e] p-4">
        <pre className="text-xs text-gray-300 font-mono whitespace-pre-wrap">
          {content}
        </pre>
      </div>
    </div>
  );
}

function getLanguage(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase();
  const map: Record<string, string> = {
    ts: 'TypeScript',
    tsx: 'TypeScript React',
    js: 'JavaScript',
    jsx: 'JavaScript React',
    py: 'Python',
    css: 'CSS',
    html: 'HTML',
    json: 'JSON',
    md: 'Markdown',
  };
  return map[ext || ''] || 'Plain Text';
}
