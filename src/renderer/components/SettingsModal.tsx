import React, { useState, useEffect } from 'react';
import { AISettings } from '../../shared/types';
import { CLAUDE_MODELS, OPENAI_MODELS, ModelInfo } from '../../shared/models';

interface Props {
  onClose: () => void;
}

type Tab = 'claude' | 'codex' | 'debate' | 'git' | 'permissions' | 'general';

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
    { id: 'debate', label: 'Debate', icon: '' },
    { id: 'git', label: 'Git', icon: '' },
    { id: 'permissions', label: 'Permissions', icon: '' },
    { id: 'general', label: 'General', icon: '' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 no-drag" onClick={onClose}>
      <div
        className="bg-[#242424] rounded-xl border border-[#383838] w-[680px] max-h-[85vh] shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#383838]">
          <h2 className="text-lg font-bold">⚙️ Settings</h2>
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
              <ProviderSettings
                title="Claude (Anthropic)"
                color="purple"
                models={CLAUDE_MODELS}
                settings={settings.claude}
                onChange={(claude) => setSettings({ ...settings, claude })}
              />
            )}

            {tab === 'codex' && (
              <ProviderSettings
                title="Codex / GPT (OpenAI)"
                color="green"
                models={OPENAI_MODELS}
                settings={settings.codex}
                onChange={(codex) => setSettings({ ...settings, codex })}
              />
            )}

            {tab === 'debate' && (
              <div className="space-y-4">
                <h3 className="text-sm font-bold text-gray-300">⚔️ Debate Settings</h3>

                <Field label="Mode">
                  <select
                    value={settings.debate.mode}
                    onChange={(e) => setSettings({ ...settings, debate: { ...settings.debate, mode: e.target.value as any } })}
                    className="input-field"
                  >
                    <option value="debate">🤖⚔️🤖 Debate — Claude vs Codex 토론</option>
                    <option value="claude-only">🟣 Claude Only — Claude 단독</option>
                    <option value="codex-only">🟢 Codex Only — GPT 단독</option>
                  </select>
                </Field>

                <Field label="Max Rounds">
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

                <Field label="Auto Apply">
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
              </div>
            )}

            {tab === 'git' && (
              <div className="space-y-4">
                <h3 className="text-sm font-bold text-gray-300">📦 Git Settings</h3>

                <Field label="Worktree Isolation">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.git.useWorktree}
                      onChange={(e) => setSettings({ ...settings, git: { ...settings.git, useWorktree: e.target.checked } })}
                      className="rounded"
                    />
                    <span className="text-xs text-gray-400">토론마다 별도 Git 워크트리에서 작업</span>
                  </label>
                </Field>

                <Field label="Auto Commit">
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

                <Field label="Commit Prefix">
                  <input
                    type="text"
                    value={settings.git.commitPrefix}
                    onChange={(e) => setSettings({ ...settings, git: { ...settings.git, commitPrefix: e.target.value } })}
                    placeholder="debaterai:"
                    className="input-field"
                  />
                </Field>
              </div>
            )}

            {tab === 'permissions' && (
              <div className="space-y-4">
                <h3 className="text-sm font-bold text-gray-300">🔒 Permission Rules</h3>
                <p className="text-xs text-gray-500">AI가 수행할 수 있는 작업을 제어합니다. Claude Code 스타일.</p>
                <div className="space-y-2">
                  {['파일 읽기: 항상 허용', 'src/ 파일 쓰기: 항상 허용', 'npm run *: 항상 허용', 'rm *: 매번 확인', 'sudo *: 항상 차단', 'git push: 매번 확인'].map((rule, i) => (
                    <div key={i} className="flex items-center justify-between bg-[#1a1a1a] rounded px-3 py-2 border border-[#333]">
                      <span className="text-xs text-gray-400">{rule}</span>
                    </div>
                  ))}
                </div>
                <p className="text-[10px] text-gray-600">* 상세 규칙 편집은 추후 업데이트 예정</p>
              </div>
            )}

            {tab === 'general' && (
              <div className="space-y-4">
                <h3 className="text-sm font-bold text-gray-300">⚙️ General</h3>

                <Field label="Language">
                  <select
                    value={settings.general.language}
                    onChange={(e) => setSettings({ ...settings, general: { ...settings.general, language: e.target.value as any } })}
                    className="input-field"
                  >
                    <option value="ko">한국어</option>
                    <option value="en">English</option>
                  </select>
                </Field>

                <Field label="Font Size">
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min={10}
                      max={18}
                      value={settings.general.fontSize}
                      onChange={(e) => setSettings({ ...settings, general: { ...settings.general, fontSize: parseInt(e.target.value) } })}
                      className="flex-1"
                    />
                    <span className="text-sm text-gray-300 w-8 text-center">{settings.general.fontSize}px</span>
                  </div>
                </Field>

                <Field label="Theme">
                  <select
                    value={settings.general.theme}
                    onChange={(e) => setSettings({ ...settings, general: { ...settings.general, theme: e.target.value as any } })}
                    className="input-field"
                  >
                    <option value="dark">🌙 Dark</option>
                    <option value="light">☀️ Light (Coming Soon)</option>
                  </select>
                </Field>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-[#383838]">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-400 hover:text-white rounded hover:bg-[#383838] transition">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-2 text-sm bg-gradient-to-r from-purple-600 to-green-600 rounded font-medium hover:from-purple-500 hover:to-green-500 disabled:opacity-50 transition"
          >
            {saving ? 'Saving...' : '💾 Save'}
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

function ProviderSettings({
  title,
  color,
  models,
  settings,
  onChange,
}: {
  title: string;
  color: string;
  models: ModelInfo[];
  settings: AISettings['claude'];
  onChange: (s: AISettings['claude']) => void;
}) {
  return (
    <div className="space-y-4">
      <h3 className={`text-sm font-bold text-${color}-400`}>{title}</h3>

      <Field label="Authentication">
        <select
          value={settings.authType}
          onChange={(e) => onChange({ ...settings, authType: e.target.value as any })}
          className="input-field"
        >
          <option value="oauth">🔐 OAuth (구독 계정 연결)</option>
          <option value="apiKey">🔑 API Key (직접 입력)</option>
        </select>
      </Field>

      {settings.authType === 'apiKey' && (
        <Field label="API Key">
          <input
            type="password"
            value={settings.apiKey || ''}
            onChange={(e) => onChange({ ...settings, apiKey: e.target.value })}
            placeholder={color === 'purple' ? 'sk-ant-...' : 'sk-proj-...'}
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
          {models.map((m) => (
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
        </Field>

        <Field label="Max Tokens">
          <select
            value={settings.maxTokens}
            onChange={(e) => onChange({ ...settings, maxTokens: parseInt(e.target.value) })}
            className="input-field"
          >
            <option value={4096}>4,096</option>
            <option value={8192}>8,192 (기본)</option>
            <option value={16384}>16,384</option>
            <option value={32000}>32,000</option>
          </select>
        </Field>
      </div>

      <Field label="System Prompt (Optional)">
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
