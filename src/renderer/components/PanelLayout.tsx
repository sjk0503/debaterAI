import React, { useState, useCallback, useRef } from 'react';

interface Props {
  sidebar: React.ReactNode;
  main: React.ReactNode;
  bottom?: React.ReactNode;
  right?: React.ReactNode;
  showSidebar: boolean;
  showBottom: boolean;
  showRight: boolean;
}

/**
 * Resizable 3-panel layout:
 *   [Sidebar | Main Area      | Right Panel ]
 *            [Debate/Agent    |             ]
 *            [────────────────|             ]
 *            [Terminal        |             ]
 */
export function PanelLayout({
  sidebar, main, bottom, right,
  showSidebar, showBottom, showRight,
}: Props) {
  const [sidebarWidth, setSidebarWidth] = useState(220);
  const [rightWidth, setRightWidth] = useState(480);
  const [bottomHeight, setBottomHeight] = useState(200);

  return (
    <div className="flex flex-1 min-h-0">
      {/* Sidebar */}
      {showSidebar && (
        <>
          <div
            className="flex-shrink-0 flex flex-col overflow-hidden"
            style={{ width: sidebarWidth, borderRight: '1px solid var(--border)', background: 'var(--bg-1)' }}
          >
            {sidebar}
          </div>
          <DragHandle
            direction="horizontal"
            onDrag={(delta) => setSidebarWidth((w) => Math.max(150, Math.min(400, w + delta)))}
          />
        </>
      )}

      {/* Center: Main + Bottom */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Main area */}
        <div className="flex-1 min-h-0 overflow-hidden">
          {main}
        </div>

        {/* Bottom panel (Terminal) */}
        {showBottom && bottom && (
          <>
            <DragHandle
              direction="vertical"
              onDrag={(delta) => setBottomHeight((h) => Math.max(100, Math.min(500, h - delta)))}
            />
            <div
              className="flex-shrink-0 overflow-hidden"
              style={{ height: bottomHeight, borderTop: '1px solid var(--border)' }}
            >
              {bottom}
            </div>
          </>
        )}
      </div>

      {/* Right panel (Editor/Diff) */}
      {showRight && right && (
        <>
          <DragHandle
            direction="horizontal"
            onDrag={(delta) => setRightWidth((w) => Math.max(300, Math.min(900, w - delta)))}
          />
          <div
            className="flex-shrink-0 flex flex-col overflow-hidden"
            style={{ width: rightWidth, borderLeft: '1px solid var(--border)' }}
          >
            {right}
          </div>
        </>
      )}
    </div>
  );
}

// ── Drag Handle ─────────────────────────────────────────────────────

function DragHandle({ direction, onDrag }: {
  direction: 'horizontal' | 'vertical';
  onDrag: (delta: number) => void;
}) {
  const dragging = useRef(false);
  const lastPos = useRef(0);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    lastPos.current = direction === 'horizontal' ? e.clientX : e.clientY;

    const handleMouseMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      const pos = direction === 'horizontal' ? e.clientX : e.clientY;
      const delta = pos - lastPos.current;
      lastPos.current = pos;
      onDrag(delta);
    };

    const handleMouseUp = () => {
      dragging.current = false;
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = direction === 'horizontal' ? 'col-resize' : 'row-resize';
    document.body.style.userSelect = 'none';
  }, [direction, onDrag]);

  const isH = direction === 'horizontal';
  return (
    <div
      onMouseDown={handleMouseDown}
      className="flex-shrink-0 group"
      style={{
        width: isH ? 4 : '100%',
        height: isH ? '100%' : 4,
        cursor: isH ? 'col-resize' : 'row-resize',
        background: 'transparent',
      }}
    >
      <div
        className="transition-colors group-hover:bg-[var(--accent)]"
        style={{
          width: isH ? 1 : '100%',
          height: isH ? '100%' : 1,
          margin: isH ? '0 auto' : 'auto 0',
          background: 'var(--border)',
        }}
      />
    </div>
  );
}
