import React, { useState, useEffect, useCallback } from 'react';
import Editor from '@monaco-editor/react';

interface OpenFile {
  path: string;
  name: string;
  content: string;
  originalContent: string;
  dirty: boolean;
  language: string;
}

interface Props {
  onClose: () => void;
  initialFile?: { path: string; content: string };
}

export function EditorTabs({ onClose, initialFile }: Props) {
  const [files, setFiles] = useState<OpenFile[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);

  // Open initial file or activate existing tab
  useEffect(() => {
    if (!initialFile) return;
    const existingIdx = files.findIndex((f) => f.path === initialFile.path);
    if (existingIdx >= 0) {
      // File already open — just activate the tab
      setActiveIdx(existingIdx);
    } else {
      // New file — add tab
      const name = initialFile.path.split('/').pop() || initialFile.path;
      setFiles((prev) => [...prev, {
        path: initialFile.path,
        name,
        content: initialFile.content,
        originalContent: initialFile.content,
        dirty: false,
        language: getLanguage(name),
      }]);
      setActiveIdx(files.length);
    }
  }, [initialFile?.path]);

  const activeFile = files[activeIdx];

  const handleChange = useCallback((value: string | undefined) => {
    if (value === undefined) return;
    setFiles((prev) => prev.map((f, i) =>
      i === activeIdx ? { ...f, content: value, dirty: value !== f.originalContent } : f
    ));
  }, [activeIdx]);

  const handleSave = useCallback(async () => {
    if (!activeFile || !activeFile.dirty) return;
    try {
      await window.api.writeFile(activeFile.path, activeFile.content);
      setFiles((prev) => prev.map((f, i) =>
        i === activeIdx ? { ...f, dirty: false, originalContent: f.content } : f
      ));
    } catch (err: any) {
      console.error('Save failed:', err);
    }
  }, [activeFile, activeIdx]);

  // Cmd+S handler
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleSave]);

  const closeTab = (idx: number) => {
    const file = files[idx];
    if (file?.dirty) {
      const confirmed = window.confirm(`"${file.name}" has unsaved changes. Close without saving?`);
      if (!confirmed) return;
    }
    const newFiles = files.filter((_, i) => i !== idx);
    setFiles(newFiles);
    if (newFiles.length === 0) {
      onClose();
    } else if (activeIdx >= newFiles.length) {
      setActiveIdx(newFiles.length - 1);
    } else if (idx < activeIdx) {
      setActiveIdx(activeIdx - 1);
    }
  };

  if (files.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-xs" style={{ color: 'var(--text-3)' }}>
        No files open
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Tab Bar */}
      <div
        className="flex items-center overflow-x-auto flex-shrink-0"
        style={{ background: 'var(--bg-1)', borderBottom: '1px solid var(--border)' }}
      >
        {files.map((file, idx) => (
          <div
            key={file.path}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs cursor-pointer border-r transition group"
            style={{
              background: idx === activeIdx ? 'var(--bg-2)' : 'transparent',
              borderColor: 'var(--border)',
              color: idx === activeIdx ? 'var(--text-1)' : 'var(--text-3)',
              borderBottom: idx === activeIdx ? '2px solid var(--accent)' : '2px solid transparent',
            }}
            onClick={() => setActiveIdx(idx)}
          >
            {file.dirty && (
              <span className="w-1.5 h-1.5 rounded-full bg-yellow-500 flex-shrink-0" />
            )}
            <span className="truncate max-w-[120px]">{file.name}</span>
            <button
              onClick={(e) => { e.stopPropagation(); closeTab(idx); }}
              className="opacity-0 group-hover:opacity-100 hover:text-red-400 transition"
            >
              ×
            </button>
          </div>
        ))}
        <div className="flex-1" />
        <button
          onClick={onClose}
          className="px-2 py-1 text-xs transition"
          style={{ color: 'var(--text-3)' }}
          onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text-1)')}
          onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-3)')}
        >
          ✕
        </button>
      </div>

      {/* Editor */}
      {activeFile && (
        <div className="flex-1 min-h-0">
          <Editor
            path={activeFile.path}
            language={activeFile.language}
            value={activeFile.content}
            onChange={handleChange}
            theme="vs-dark"
            options={{
              fontSize: 12,
              minimap: { enabled: false },
              lineNumbers: 'on',
              scrollBeyondLastLine: false,
              wordWrap: 'on',
              tabSize: 2,
              renderWhitespace: 'selection',
              bracketPairColorization: { enabled: true },
              padding: { top: 8 },
            }}
          />
        </div>
      )}

      {/* Status bar */}
      {activeFile && (
        <div
          className="flex items-center justify-between px-3 py-1 text-xs flex-shrink-0"
          style={{ background: 'var(--bg-1)', borderTop: '1px solid var(--border)', color: 'var(--text-3)' }}
        >
          <span className="truncate">{activeFile.path}</span>
          <div className="flex items-center gap-3">
            <span>{activeFile.language}</span>
            {activeFile.dirty && (
              <button
                onClick={handleSave}
                className="px-2 py-0.5 rounded text-xs transition"
                style={{ background: 'var(--accent)', color: 'white' }}
              >
                Save
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Open file from outside ──────────────────────────────────────────

export function useEditorTabs() {
  const [openFile, setOpenFile] = useState<{ path: string; content: string } | null>(null);

  const openInEditor = async (filePath: string) => {
    try {
      const content = await window.api.readFile(filePath);
      setOpenFile({ path: filePath, content });
    } catch {
      setOpenFile({ path: filePath, content: '// Failed to read file' });
    }
  };

  return { openFile, openInEditor, clearFile: () => setOpenFile(null) };
}

// ── Helpers ──────────────────────────────────────────────────────────

function getLanguage(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  const map: Record<string, string> = {
    ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
    json: 'json', md: 'markdown', css: 'css', html: 'html', yml: 'yaml',
    yaml: 'yaml', py: 'python', rs: 'rust', go: 'go', sh: 'shell',
    bash: 'shell', sql: 'sql', vue: 'vue', svelte: 'svelte',
  };
  return map[ext] || 'plaintext';
}
