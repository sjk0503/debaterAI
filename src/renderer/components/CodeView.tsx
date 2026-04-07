import React from 'react';
import Editor from '@monaco-editor/react';

interface Props {
  filePath: string;
  content: string;
  onClose: () => void;
}

export function CodeView({ filePath, content, onClose }: Props) {
  const fileName = filePath.split('/').pop() || '';
  const language = getMonacoLanguage(fileName);
  const displayLang = getDisplayLanguage(fileName);

  return (
    <div className="flex flex-col h-full no-drag">
      {/* Header */}
      <div className="h-10 flex items-center justify-between px-3 border-b border-[#383838] bg-[#1e1e1e]">
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">{fileName}</span>
          <span className="text-[10px] text-gray-600">{displayLang}</span>
        </div>
        <button
          onClick={onClose}
          className="text-gray-500 hover:text-white text-sm px-1"
        >
          ✕
        </button>
      </div>

      {/* Monaco Editor */}
      <div className="flex-1 overflow-hidden">
        <Editor
          height="100%"
          language={language}
          value={content}
          theme="vs-dark"
          options={{
            readOnly: true,
            minimap: { enabled: false },
            fontSize: 12,
            lineNumbers: 'on',
            scrollBeyondLastLine: false,
            wordWrap: 'on',
            automaticLayout: true,
            folding: true,
            renderLineHighlight: 'line',
            padding: { top: 8 },
          }}
        />
      </div>
    </div>
  );
}

function getMonacoLanguage(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase();
  const map: Record<string, string> = {
    ts: 'typescript',
    tsx: 'typescript',
    js: 'javascript',
    jsx: 'javascript',
    py: 'python',
    css: 'css',
    scss: 'scss',
    html: 'html',
    json: 'json',
    md: 'markdown',
    yaml: 'yaml',
    yml: 'yaml',
    xml: 'xml',
    sql: 'sql',
    sh: 'shell',
    bash: 'shell',
    rs: 'rust',
    go: 'go',
    java: 'java',
    c: 'c',
    cpp: 'cpp',
    h: 'c',
    hpp: 'cpp',
    vue: 'html',
    svelte: 'html',
  };
  return map[ext || ''] || 'plaintext';
}

function getDisplayLanguage(filename: string): string {
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
