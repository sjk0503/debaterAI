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
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const renderItem = (item: FileTreeItem, depth = 0) => {
    const isDir = item.type === 'directory';
    const isExpanded = expanded.has(item.path);
    const isSelected = item.path === selectedFile;
    const indent = depth * 16;

    return (
      <div key={item.path}>
        <div
          className={`flex items-center gap-1 px-2 py-0.5 cursor-pointer text-xs hover:bg-[#2a2a2a] ${
            isSelected ? 'bg-[#37373d] text-white' : 'text-gray-400'
          }`}
          style={{ paddingLeft: indent + 8 }}
          onClick={() => {
            if (isDir) toggleDir(item.path);
            else onFileSelect(item.path);
          }}
        >
          <span className="flex-shrink-0">
            {isDir ? (isExpanded ? '📂' : '📁') : getFileIcon(item.name)}
          </span>
          <span className="truncate">{item.name}</span>
        </div>
        {isDir && isExpanded && item.children?.map((child) => renderItem(child, depth + 1))}
      </div>
    );
  };

  if (!projectPath) {
    return (
      <div className="p-4 text-xs text-gray-600 text-center">
        프로젝트 경로를 입력하세요
      </div>
    );
  }

  return (
    <div className="overflow-y-auto h-full no-drag">
      {files.map((f) => renderItem(f))}
    </div>
  );
}

function getFileIcon(name: string): string {
  if (name.endsWith('.ts') || name.endsWith('.tsx')) return '🔷';
  if (name.endsWith('.js') || name.endsWith('.jsx')) return '🟡';
  if (name.endsWith('.css') || name.endsWith('.scss')) return '🎨';
  if (name.endsWith('.json')) return '📋';
  if (name.endsWith('.md')) return '📝';
  if (name.endsWith('.py')) return '🐍';
  if (name.endsWith('.html')) return '🌐';
  return '📄';
}
