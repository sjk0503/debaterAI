import React, { useState, useEffect } from 'react';

interface CliCheck {
  name: string;
  available: boolean;
  email?: string;
  checking: boolean;
}

interface Props {
  onComplete: (projectPath: string) => void;
  onSkip: () => void;
}

/**
 * First-launch wizard: detect CLIs, guide auth, select project.
 */
export function OnboardingWizard({ onComplete, onSkip }: Props) {
  const [step, setStep] = useState(0);
  const [claude, setClaude] = useState<CliCheck>({ name: 'Claude', available: false, checking: true });
  const [codex, setCodex] = useState<CliCheck>({ name: 'Codex', available: false, checking: true });
  const [projectPath, setProjectPath] = useState('');

  // Step 0: Check CLI availability
  useEffect(() => {
    Promise.all([
      (window.api as any).claudeCodeAvailable?.().catch(() => false),
      (window.api as any).claudeCodeAuthStatus?.().catch(() => null),
      (window.api as any).codexCliAvailable?.().catch(() => false),
      (window.api as any).codexCliAuthInfo?.().catch(() => null),
    ]).then(([claudeAvail, claudeAuth, codexAvail, codexAuth]) => {
      setClaude({
        name: 'Claude',
        available: !!claudeAvail,
        email: claudeAuth?.email || '',
        checking: false,
      });
      setCodex({
        name: 'Codex',
        available: !!codexAvail,
        email: codexAuth?.email || '',
        checking: false,
      });
    });
  }, []);

  const handleSelectProject = async () => {
    const dir = await window.api.openDirectory();
    if (dir) {
      setProjectPath(dir);
      onComplete(dir);
    }
  };

  const allChecked = !claude.checking && !codex.checking;
  const anyAvailable = claude.available || codex.available;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'var(--bg-0)' }}>
      <div className="w-[520px] space-y-8 text-center">
        {/* Logo */}
        <div>
          <h1 className="text-4xl font-bold tracking-tight" style={{ color: 'var(--text-1)' }}>
            debaterAI
          </h1>
          <p className="text-sm mt-2" style={{ color: 'var(--text-3)' }}>
            AI 에이전트들이 토론하고 코드를 작성합니다
          </p>
        </div>

        {/* CLI Status */}
        <div className="space-y-3 text-left max-w-sm mx-auto">
          <CliStatusRow cli={claude} installCmd="npm install -g @anthropic-ai/claude-code" />
          <CliStatusRow cli={codex} installCmd="npm install -g @openai/codex" />
        </div>

        {/* Status message */}
        <div className="text-xs" style={{ color: 'var(--text-3)' }}>
          {!allChecked && 'CLI 확인 중...'}
          {allChecked && anyAvailable && '최소 하나의 CLI가 준비되었습니다.'}
          {allChecked && !anyAvailable && 'CLI를 설치하거나 Settings에서 API Key를 입력하세요.'}
        </div>

        {/* Actions */}
        <div className="flex flex-col items-center gap-3">
          {anyAvailable && (
            <button
              onClick={handleSelectProject}
              className="px-8 py-3 rounded-lg text-sm font-medium transition"
              style={{ background: 'var(--accent)', color: 'white' }}
            >
              프로젝트 폴더 선택
            </button>
          )}
          <button
            onClick={onSkip}
            className="text-xs px-4 py-2 rounded transition"
            style={{ color: 'var(--text-3)' }}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text-1)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-3)')}
          >
            {anyAvailable ? '나중에 설정' : 'Settings에서 API Key로 시작'}
          </button>
        </div>
      </div>
    </div>
  );
}

function CliStatusRow({ cli, installCmd }: { cli: CliCheck; installCmd: string }) {
  const color = cli.name === 'Claude' ? 'var(--claude)' : 'var(--codex)';

  return (
    <div
      className="flex items-center justify-between px-4 py-3 rounded-lg"
      style={{ background: 'var(--bg-1)', border: '1px solid var(--border)' }}
    >
      <div className="flex items-center gap-3">
        <span
          className="w-2 h-2 rounded-full flex-shrink-0"
          style={{ background: cli.checking ? 'var(--text-3)' : cli.available ? '#10b981' : '#ef4444' }}
        />
        <div>
          <span className="text-sm font-medium" style={{ color }}>{cli.name} CLI</span>
          {cli.checking && (
            <span className="text-xs ml-2" style={{ color: 'var(--text-3)' }}>확인 중...</span>
          )}
          {!cli.checking && cli.available && cli.email && (
            <div className="text-xs" style={{ color: 'var(--text-3)' }}>{cli.email}</div>
          )}
          {!cli.checking && !cli.available && (
            <div className="text-xs font-mono mt-0.5" style={{ color: 'var(--text-3)' }}>{installCmd}</div>
          )}
        </div>
      </div>
      {!cli.checking && (
        <span className="text-xs" style={{ color: cli.available ? '#10b981' : '#ef4444' }}>
          {cli.available ? '준비됨' : '미설치'}
        </span>
      )}
    </div>
  );
}
