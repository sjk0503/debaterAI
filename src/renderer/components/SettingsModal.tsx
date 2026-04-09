import React, { useState, useEffect } from 'react';
import { AISettings, ClaudeSettings, OpenAISettings, ClaudeEffort, ReasoningEffort } from '../../shared/types';
import { CLAUDE_MODELS, OPENAI_MODELS, ModelInfo } from '../../shared/models';

interface Props {
  onClose: () => void;
}

type Tab = 'claude' | 'codex' | 'debate' | 'git';

export function SettingsModal({ onClose }: Props) {
  const [settings, setSettings] = useState<AISettings | null>(null);
  const [tab, setTab] = useState<Tab>('claude');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    window.api.getSettings().then(setSettings);
  }, []);

  const handleSave = async () => {
    if (!settings) return;
    setSaving(true);
    await window.api.saveSettings(settings);
    setSaving(false);
    onClose();
  };

  if (!settings) return null;

  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: 'claude', label: 'Claude', icon: '' },
    { id: 'codex', label: 'Codex', icon: '' },
    { id: 'debate', label: '토론 설정', icon: '' },
    { id: 'git', label: 'Git', icon: '' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 no-drag" onClick={onClose}>
      <div
        className="bg-[#242424] rounded-xl border border-[#383838] w-[680px] max-h-[85vh] shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#383838]">
          <h2 className="text-lg font-bold">설정</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white">✕</button>
        </div>

        <div className="flex flex-1 min-h-0">
          {/* Tab Navigation */}
          <div className="w-40 border-r border-[#383838] py-2">
            {tabs.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`w-full text-left px-4 py-2 text-xs flex items-center gap-2 transition ${
                  tab === t.id ? 'bg-[#383838] text-white' : 'text-gray-500 hover:text-gray-300 hover:bg-[#2a2a2a]'
                }`}
              >
                <span>{t.icon}</span> {t.label}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          <div className="flex-1 p-6 overflow-y-auto">
            {tab === 'claude' && (
              <ClaudeProviderSettings
                settings={settings.claude}
                onChange={(claude) => setSettings({ ...settings, claude })}
              />
            )}

            {tab === 'codex' && (
              <CodexProviderSettings
                settings={settings.codex}
                onChange={(codex) => setSettings({ ...settings, codex })}
              />
            )}

            {tab === 'debate' && (
              <div className="space-y-4">
                <h3 className="text-sm font-bold text-gray-300">토론 설정</h3>

                <Field label="기본 모드">
                  <select
                    value={settings.debate.preferredMode}
                    onChange={(e) => setSettings({ ...settings, debate: { ...settings.debate, preferredMode: e.target.value as any } })}
                    className="input-field"
                  >
                    <option value="debate">토론 — Claude vs Codex가 토론 후 코드 생성</option>
                    <option value="claude-only">Claude 단독 — Claude가 바로 코드 생성</option>
                    <option value="codex-only">Codex 단독 — GPT가 바로 코드 생성</option>
                  </select>
                  <p className="text-[10px] text-gray-600 mt-1">메인 화면에서도 변경 가능합니다</p>
                </Field>

                <Field label="최대 라운드">
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min={1}
                      max={10}
                      value={settings.debate.maxRounds}
                      onChange={(e) => setSettings({ ...settings, debate: { ...settings.debate, maxRounds: parseInt(e.target.value) } })}
                      className="flex-1"
                    />
                    <span className="text-sm text-gray-300 w-6 text-center">{settings.debate.maxRounds}</span>
                  </div>
                  <p className="text-[10px] text-gray-600 mt-1">합의 안 되면 이 횟수 후 Claude 의견 우선 적용</p>
                </Field>

                <Field label="자동 적용">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.debate.autoApply}
                      onChange={(e) => setSettings({ ...settings, debate: { ...settings.debate, autoApply: e.target.checked } })}
                      className="rounded"
                    />
                    <span className="text-xs text-gray-400">합의 후 자동으로 코드 적용</span>
                  </label>
                </Field>

                <Field label="워크트리 격리">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.debate.alwaysUseWorktree ?? false}
                      onChange={(e) => setSettings({ ...settings, debate: { ...settings.debate, alwaysUseWorktree: e.target.checked } })}
                      className="rounded"
                    />
                    <span className="text-xs text-gray-400">매 토론마다 워크트리 생성</span>
                  </label>
                  <p className="text-[10px] text-gray-600 mt-1">토론 후 코드 실행 시 자동으로 격리된 워크트리에서 작업합니다</p>
                </Field>
              </div>
            )}

            {tab === 'git' && (
              <div className="space-y-4">
                <h3 className="text-sm font-bold text-gray-300">Git 설정</h3>

                <Field label="자동 커밋">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.git.autoCommit}
                      onChange={(e) => setSettings({ ...settings, git: { ...settings.git, autoCommit: e.target.checked } })}
                      className="rounded"
                    />
                    <span className="text-xs text-gray-400">코드 적용 시 자동 커밋</span>
                  </label>
                </Field>

                <Field label="커밋 접두사">
                  <input
                    type="text"
                    value={settings.git.commitPrefix}
                    onChange={(e) => setSettings({ ...settings, git: { ...settings.git, commitPrefix: e.target.value } })}
                    placeholder="debaterai:"
                    className="input-field"
                  />
                  <p className="text-[10px] text-gray-600 mt-1">커밋 메시지 접두사 (예: debaterai: implement feature)</p>
                </Field>
              </div>
            )}

          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-[#383838]">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-400 hover:text-white rounded hover:bg-[#383838] transition">
            취소
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-2 text-sm bg-gradient-to-r from-purple-600 to-green-600 rounded font-medium hover:from-purple-500 hover:to-green-500 disabled:opacity-50 transition"
          >
            {saving ? '저장 중...' : '저장'}
          </button>
        </div>
      </div>

      <style>{`
        .input-field {
          width: 100%;
          background: #1a1a1a;
          border: 1px solid #383838;
          border-radius: 6px;
          padding: 8px 12px;
          font-size: 12px;
          color: #ddd;
          outline: none;
        }
        .input-field:focus {
          border-color: #8b5cf6;
        }
      `}</style>
    </div>
  );
}

// ============================================================================
// Sub-components
// ============================================================================

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs text-gray-400 mb-1.5">{label}</label>
      {children}
    </div>
  );
}

function ClaudeProviderSettings({
  settings,
  onChange,
}: {
  settings: ClaudeSettings;
  onChange: (s: ClaudeSettings) => void;
}) {
  const [cliStatus, setCliStatus] = useState<{ available: boolean; auth: string } | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (settings.selectedTransport === 'cli') {
      setChecking(true);
      Promise.all([
        window.api.claudeCodeAvailable?.(),
        window.api.claudeCodeAuthStatus?.().catch(() => null),
      ]).then(([available, auth]) => {
        setCliStatus({ available: !!available, auth: auth ? (auth.email || 'logged in') : '' });
        setChecking(false);
      }).catch(() => {
        setCliStatus({ available: false, auth: '' });
        setChecking(false);
      });
    }
  }, [settings.selectedTransport]);

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-bold text-purple-400">Claude (Anthropic)</h3>

      <Field label="연결 방식">
        <select
          value={settings.selectedTransport}
          onChange={(e) => onChange({ ...settings, selectedTransport: e.target.value as any })}
          className="input-field"
        >
          <option value="api">API Key (직접 입력)</option>
          <option value="cli">Claude CLI (구독 계정)</option>
        </select>
        {settings.selectedTransport === 'cli' && (
          <div className="mt-2 px-3 py-2 rounded text-xs" style={{ background: '#1a1a1a', border: '1px solid #333' }}>
            {checking ? (
              <span className="text-gray-500">CLI 상태 확인 중...</span>
            ) : cliStatus ? (
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className={`w-1.5 h-1.5 rounded-full ${cliStatus.available ? 'bg-green-500' : 'bg-red-500'}`} />
                  <span className={cliStatus.available ? 'text-green-400' : 'text-red-400'}>
                    {cliStatus.available ? 'CLI 설치됨' : 'CLI 미설치'}
                  </span>
                </div>
                {cliStatus.available && (
                  <div className="flex items-center gap-2">
                    <span className={`w-1.5 h-1.5 rounded-full ${cliStatus.auth ? 'bg-green-500' : 'bg-yellow-500'}`} />
                    <span className={cliStatus.auth ? 'text-green-400' : 'text-yellow-400'}>
                      {cliStatus.auth ? `로그인: ${cliStatus.auth}` : '터미널에서 "claude" 실행하여 로그인 필요'}
                    </span>
                  </div>
                )}
                {!cliStatus.available && (
                  <p className="text-gray-500 mt-1">설치: npm install -g @anthropic-ai/claude-code</p>
                )}
              </div>
            ) : null}
          </div>
        )}
      </Field>

      {settings.selectedTransport === 'api' && (
        <Field label="API Key">
          <input
            type="password"
            value={settings.apiKey || ''}
            onChange={(e) => onChange({ ...settings, apiKey: e.target.value })}
            placeholder="sk-ant-..."
            className="input-field"
          />
        </Field>
      )}

      <Field label="Model">
        <select
          value={settings.model}
          onChange={(e) => onChange({ ...settings, model: e.target.value })}
          className="input-field"
        >
          {CLAUDE_MODELS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.tier === 'flagship' ? '👑' : m.tier === 'balanced' ? '⚡' : '🚀'} {m.name} — {m.description}
            </option>
          ))}
        </select>
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Temperature">
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={0}
              max={100}
              value={settings.temperature * 100}
              onChange={(e) => onChange({ ...settings, temperature: parseInt(e.target.value) / 100 })}
              className="flex-1"
            />
            <span className="text-xs text-gray-400 w-8">{settings.temperature}</span>
          </div>
          <p className="text-[10px] text-gray-600 mt-1">낮을수록 일관된 응답, 높을수록 창의적</p>
        </Field>

        <Field label="Max Tokens">
          <select
            value={settings.maxTokens}
            onChange={(e) => onChange({ ...settings, maxTokens: parseInt(e.target.value) })}
            className="input-field"
          >
            <option value={4096}>4,096</option>
            <option value={8192}>8,192</option>
            <option value={16384}>16,384</option>
            <option value={32000}>32,000</option>
            <option value={64000}>64,000</option>
            <option value={128000}>128,000</option>
          </select>
          <p className="text-[10px] text-gray-600 mt-1">응답 최대 길이</p>
        </Field>
      </div>

      {settings.selectedTransport === 'cli' && (
        <Field label="Effort">
          <select
            value={settings.effort || 'medium'}
            onChange={(e) => onChange({ ...settings, effort: e.target.value as ClaudeEffort })}
            className="input-field"
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="max">Max (Opus 전용)</option>
          </select>
          <p className="text-[10px] text-gray-600 mt-1">높을수록 깊이 사고하지만 느려짐. 기본값: medium</p>
        </Field>
      )}

      <Field label="System Prompt">
        <textarea
          value={settings.systemPrompt || ''}
          onChange={(e) => onChange({ ...settings, systemPrompt: e.target.value })}
          placeholder="AI의 역할을 커스텀. 비워두면 기본 토론 프롬프트 사용."
          rows={3}
          className="input-field resize-none"
        />
        <p className="text-[10px] text-gray-600 mt-1">기본 토론 역할을 덮어씁니다. 보통은 비워둡니다.</p>
      </Field>
    </div>
  );
}

function CodexProviderSettings({
  settings,
  onChange,
}: {
  settings: OpenAISettings;
  onChange: (s: OpenAISettings) => void;
}) {
  const [cliStatus, setCliStatus] = useState<{ available: boolean; email: string; plan: string } | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (settings.selectedTransport === 'cli') {
      setChecking(true);
      Promise.all([
        (window.api as any).codexCliAvailable?.(),
        (window.api as any).codexCliAuthInfo?.().catch(() => null),
      ]).then(([available, authInfo]) => {
        setCliStatus({
          available: !!available,
          email: authInfo?.email || '',
          plan: authInfo?.plan || '',
        });
        setChecking(false);
      }).catch(() => {
        setCliStatus({ available: false, email: '', plan: '' });
        setChecking(false);
      });
    }
  }, [settings.selectedTransport]);

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-bold text-green-400">Codex / GPT (OpenAI)</h3>

      <Field label="연결 방식">
        <select
          value={settings.selectedTransport}
          onChange={(e) => onChange({ ...settings, selectedTransport: e.target.value as any })}
          className="input-field"
        >
          <option value="api">API Key (직접 입력)</option>
          <option value="cli">Codex CLI (ChatGPT 구독)</option>
        </select>
        {settings.selectedTransport === 'cli' && (
          <div className="mt-2 px-3 py-2 rounded text-xs" style={{ background: '#1a1a1a', border: '1px solid #333' }}>
            {checking ? (
              <span className="text-gray-500">CLI 상태 확인 중...</span>
            ) : cliStatus ? (
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className={`w-1.5 h-1.5 rounded-full ${cliStatus.available ? 'bg-green-500' : 'bg-red-500'}`} />
                  <span className={cliStatus.available ? 'text-green-400' : 'text-red-400'}>
                    {cliStatus.available ? 'CLI 설치됨' : 'CLI 미설치'}
                  </span>
                </div>
                {cliStatus.available && cliStatus.email && (
                  <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                    <span className="text-green-400">
                      로그인: {cliStatus.email}{cliStatus.plan ? ` (${cliStatus.plan})` : ''}
                    </span>
                  </div>
                )}
                {cliStatus.available && !cliStatus.email && (
                  <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-yellow-500" />
                    <span className="text-yellow-400">터미널에서 "codex" 실행하여 로그인 필요</span>
                  </div>
                )}
                {!cliStatus.available && (
                  <p className="text-gray-500 mt-1">설치: npm install -g @openai/codex</p>
                )}
              </div>
            ) : null}
          </div>
        )}
      </Field>

      {settings.selectedTransport === 'api' && (
        <Field label="API Key">
          <input
            type="password"
            value={settings.apiKey || ''}
            onChange={(e) => onChange({ ...settings, apiKey: e.target.value })}
            placeholder="sk-proj-..."
            className="input-field"
          />
        </Field>
      )}

      <Field label="Model">
        <select
          value={settings.model}
          onChange={(e) => onChange({ ...settings, model: e.target.value })}
          className="input-field"
        >
          {OPENAI_MODELS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.tier === 'flagship' ? '👑' : m.tier === 'balanced' ? '⚡' : '🚀'} {m.name} — {m.description}
            </option>
          ))}
        </select>
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Temperature">
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={0}
              max={100}
              value={settings.temperature * 100}
              onChange={(e) => onChange({ ...settings, temperature: parseInt(e.target.value) / 100 })}
              className="flex-1"
            />
            <span className="text-xs text-gray-400 w-8">{settings.temperature}</span>
          </div>
          <p className="text-[10px] text-gray-600 mt-1">낮을수록 일관된 응답, 높을수록 창의적</p>
        </Field>

        <Field label="Max Tokens">
          <select
            value={settings.maxTokens}
            onChange={(e) => onChange({ ...settings, maxTokens: parseInt(e.target.value) })}
            className="input-field"
          >
            <option value={4096}>4,096</option>
            <option value={8192}>8,192</option>
            <option value={16384}>16,384</option>
            <option value={32000}>32,000</option>
            <option value={64000}>64,000</option>
            <option value={128000}>128,000</option>
          </select>
          <p className="text-[10px] text-gray-600 mt-1">응답 최대 길이</p>
        </Field>
      </div>

      <Field label="Reasoning Effort">
        <select
          value={settings.reasoningEffort || 'none'}
          onChange={(e) => onChange({ ...settings, reasoningEffort: e.target.value as ReasoningEffort })}
          className="input-field"
        >
          <option value="none">None</option>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </select>
        <p className="text-[10px] text-gray-600 mt-1">높을수록 논리적으로 사고하지만 느려짐. 토론에는 medium 추천.</p>
      </Field>

      <Field label="시스템 프롬프트 (선택)">
        <textarea
          value={settings.systemPrompt || ''}
          onChange={(e) => onChange({ ...settings, systemPrompt: e.target.value })}
          placeholder="AI의 기본 역할을 지정합니다. 비워두면 기본값 사용."
          rows={3}
          className="input-field resize-none"
        />
      </Field>
    </div>
  );
}
