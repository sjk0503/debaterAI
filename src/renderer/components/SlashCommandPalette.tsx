import React, { useEffect, useRef } from 'react';
import { SlashCommand } from '../../shared/slash-commands';

interface Props {
  commands: SlashCommand[];
  selectedIndex: number;
  visible: boolean;
  onSelect: (cmd: SlashCommand) => void;
  onClose: () => void;
}

const CATEGORY_LABELS: Record<string, string> = {
  mode: 'Mode',
  action: 'Action',
  info: 'Info',
  git: 'Git',
};

export function SlashCommandPalette({ commands, selectedIndex, visible, onSelect, onClose }: Props) {
  const selectedRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  if (!visible || commands.length === 0) return null;

  // Group commands by category, preserving order of first appearance
  const categoryOrder: string[] = [];
  const grouped: Record<string, SlashCommand[]> = {};
  for (const cmd of commands) {
    if (!grouped[cmd.category]) {
      grouped[cmd.category] = [];
      categoryOrder.push(cmd.category);
    }
    grouped[cmd.category].push(cmd);
  }

  // Build a flat index map to track selectedIndex across groups
  let flatIndex = 0;

  return (
    <div
      style={{
        position: 'absolute',
        bottom: '100%',
        left: 0,
        right: 0,
        marginBottom: 4,
        background: 'var(--bg-2)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
        maxHeight: 280,
        overflowY: 'auto',
        zIndex: 50,
      }}
    >
      {categoryOrder.map((category) => {
        const cmds = grouped[category];
        return (
          <div key={category}>
            {/* Category header */}
            <div
              style={{
                padding: '4px 10px 2px',
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'var(--text-3)',
                userSelect: 'none',
              }}
            >
              {CATEGORY_LABELS[category] ?? category}
            </div>

            {/* Commands in this category */}
            {cmds.map((cmd) => {
              const currentIndex = flatIndex++;
              const isSelected = currentIndex === selectedIndex;
              return (
                <button
                  key={cmd.name}
                  ref={isSelected ? selectedRef : undefined}
                  onClick={() => onSelect(cmd)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    width: '100%',
                    padding: '5px 10px',
                    textAlign: 'left',
                    background: isSelected ? 'var(--bg-4)' : 'transparent',
                    borderLeft: isSelected ? '2px solid var(--accent)' : '2px solid transparent',
                    border: 'none',
                    outline: 'none',
                    cursor: 'pointer',
                    transition: 'background 0.1s',
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected) {
                      e.currentTarget.style.background = 'var(--bg-3)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) {
                      e.currentTarget.style.background = 'transparent';
                    }
                  }}
                >
                  {/* Icon */}
                  <span style={{ fontSize: 13, flexShrink: 0, width: 18, textAlign: 'center' }}>
                    {cmd.icon}
                  </span>

                  {/* Name */}
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: 'var(--text-1)',
                      fontFamily: 'monospace',
                      flexShrink: 0,
                    }}
                  >
                    /{cmd.name}
                  </span>

                  {/* Arg hint */}
                  {cmd.argHint && (
                    <span
                      style={{
                        fontSize: 11,
                        color: 'var(--text-3)',
                        fontFamily: 'monospace',
                        flexShrink: 0,
                      }}
                    >
                      {cmd.argHint}
                    </span>
                  )}

                  {/* Description */}
                  <span
                    style={{
                      fontSize: 11,
                      color: 'var(--text-2)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {cmd.description}
                  </span>
                </button>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
