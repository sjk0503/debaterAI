import React, { useState, useEffect } from 'react';
import { FileTreeItem } from '../../shared/types';

interface Props {
  projectPath: string;
  onFileSelect: (filePath: string) => void;
  selectedFile: string | null;
}

export function FileExplorer({ projectPath, onFileSelect, selectedFile }: Props) {
  const [files, setFiles] = useState<FileTreeItem[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!projectPath) return;
    window.api.getFiles(projectPath).then(setFiles).catch(() => setFiles([]));
  }, [projectPath]);

  const toggleDir = (path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(path) ? next.delete(path) : next.add(path);
      return next;
    });
  };

  const getExt = (name: string) => name.split('.').pop()?.toLowerCase() || '';

  const extColor: Record<string, string> = {
    ts: '#3b82f6', tsx: '#3b82f6',
    js: '#f59e0b', jsx: '#f59e0b',
    css: '#ec4899', scss: '#ec4899',
    json: '#10b981', md: '#a78bfa',
    py: '#10b981', html: '#f97316',
  };

  const renderItem = (item: FileTreeItem, depth = 0) => {
    const isDir = item.type === 'directory';
    const isExpanded = expanded.has(item.path);
    const isSelected = item.path === selectedFile;
    const ext = getExt(item.name);
    const color = isDir ? 'var(--text-3)' : (extColor[ext] || 'var(--text-2)');

    return (
      <div key={item.path}>
        <div
          className="flex items-center gap-1.5 py-0.5 cursor-pointer transition text-xs"
          style={{
            paddingLeft: depth * 12 + 10,
            paddingRight: 8,
            background: isSelected ? 'var(--bg-3)' : 'transparent',
            color: isSelected ? 'var(--text-1)' : 'var(--text-2)',
          }}
          onMouseEnter={(e) => {
            if (!isSelected) e.currentTarget.style.background = 'var(--bg-2)';
          }}
          onMouseLeave={(e) => {
            if (!isSelected) e.currentTarget.style.background = 'transparent';
          }}
          onClick={() => isDir ? toggleDir(item.path) : onFileSelect(item.path)}
        >
          {/* Dir chevron */}
          {isDir && (
            <span style={{ color: 'var(--text-3)', fontSize: 9, width: 8 }}>
              {isExpanded ? '▾' : '▸'}
            </span>
          )}
          {/* File dot */}
          {!isDir && (
            <span style={{ color, fontSize: 6 }}>●</span>
          )}
          <span className="truncate selectable-text" style={{ fontFamily: 'inherit' }}>{item.name}</span>
        </div>
        {isDir && isExpanded && item.children?.map((child) => renderItem(child, depth + 1))}
      </div>
    );
  };

  if (!projectPath) {
    return (
      <div className="p-3 text-center" style={{ color: 'var(--text-3)', fontSize: 11 }}>
        No project open
      </div>
    );
  }

  return (
    <div className="overflow-y-auto h-full no-drag py-1">
      {files.map((f) => renderItem(f))}
    </div>
  );
}
