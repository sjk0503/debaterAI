import React from 'react';

interface Props {
  action: string;
  detail: string;
  reason?: string;
  onDecision: (decision: 'allow' | 'deny' | 'always-allow') => void;
}

const ACTION_LABELS: Record<string, { icon: string; label: string; danger: boolean }> = {
  'file:read': { icon: '📖', label: '파일 읽기', danger: false },
  'file:write': { icon: '✏️', label: '파일 쓰기', danger: false },
  'file:create': { icon: '📝', label: '파일 생성', danger: false },
  'file:delete': { icon: '🗑️', label: '파일 삭제', danger: true },
  'terminal:exec': { icon: '💻', label: '명령 실행', danger: true },
  'git:commit': { icon: '📦', label: 'Git 커밋', danger: false },
  'git:push': { icon: '🚀', label: 'Git 푸시', danger: true },
  'git:merge': { icon: '🔀', label: 'Git 머지', danger: true },
  'network:fetch': { icon: '🌐', label: '네트워크 요청', danger: false },
};

export function PermissionModal({ action, detail, reason, onDecision }: Props) {
  const cfg = ACTION_LABELS[action] || { icon: '❓', label: action, danger: true };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 no-drag">
      <div className="bg-[#242424] rounded-xl border border-[#383838] w-[480px] shadow-2xl overflow-hidden">
        {/* Header */}
        <div className={`px-6 py-4 ${cfg.danger ? 'bg-red-900/20' : 'bg-yellow-900/20'} border-b border-[#383838]`}>
          <div className="flex items-center gap-3">
            <span className="text-2xl">{cfg.icon}</span>
            <div>
              <h3 className="text-sm font-bold text-white">권한 요청: {cfg.label}</h3>
              <p className="text-xs text-gray-400 mt-0.5">AI가 다음 작업을 수행하려 합니다</p>
            </div>
          </div>
        </div>

        {/* Detail */}
        <div className="px-6 py-4">
          <div className="bg-[#1a1a1a] rounded-lg p-3 border border-[#333]">
            <code className="text-xs text-yellow-300 font-mono break-all">{detail}</code>
          </div>

          {reason && (
            <div className="mt-3 text-xs text-gray-400">
              <span className="text-gray-500">이유:</span> {reason}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-2 px-6 py-4 border-t border-[#383838] bg-[#1e1e1e]">
          <button
            onClick={() => onDecision('deny')}
            className="flex-1 px-3 py-2 text-xs bg-red-600/20 text-red-400 border border-red-600/30 rounded-lg hover:bg-red-600/30 transition font-medium"
          >
            ❌ 거부
          </button>
          <button
            onClick={() => onDecision('allow')}
            className="flex-1 px-3 py-2 text-xs bg-yellow-600/20 text-yellow-400 border border-yellow-600/30 rounded-lg hover:bg-yellow-600/30 transition font-medium"
          >
            ✅ 이번만 허용
          </button>
          <button
            onClick={() => onDecision('always-allow')}
            className="flex-1 px-3 py-2 text-xs bg-green-600/20 text-green-400 border border-green-600/30 rounded-lg hover:bg-green-600/30 transition font-medium"
          >
            🔓 항상 허용
          </button>
        </div>
      </div>
    </div>
  );
}
