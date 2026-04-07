import React, { useState, useEffect } from 'react';
import { AISettings } from '../../shared/types';

interface Props {
  onClose: () => void;
}

export function SettingsModal({ onClose }: Props) {
  const [settings, setSettings] = useState<AISettings | null>(null);
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 no-drag" onClick={onClose}>
      <div
        className="bg-[#242424] rounded-xl border border-[#383838] w-[560px] max-h-[80vh] overflow-y-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#383838]">
          <h2 className="text-lg font-bold">⚙️ Settings</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white">✕</button>
        </div>

        <div className="p-6 space-y-6">
          {/* Claude Settings */}
          <section>
            <h3 className="text-sm font-bold text-purple-400 mb-3">🟣 Claude</h3>
            <div className="space-y-2">
              <label className="block text-xs text-gray-400">API Key</label>
              <input
                type="password"
                value={settings.claude.apiKey || ''}
                onChange={(e) =>
                  setSettings({ ...settings, claude: { ...settings.claude, apiKey: e.target.value } })
                }
                placeholder="sk-ant-..."
                className="w-full bg-[#1a1a1a] border border-[#383838] rounded px-3 py-2 text-sm focus:outline-none focus:border-purple-500"
              />
              <label className="block text-xs text-gray-400 mt-2">Model</label>
              <select
                value={settings.claude.model}
                onChange={(e) =>
                  setSettings({ ...settings, claude: { ...settings.claude, model: e.target.value } })
                }
                className="w-full bg-[#1a1a1a] border border-[#383838] rounded px-3 py-2 text-sm focus:outline-none"
              >
                <option value="claude-sonnet-4-20250514">Claude Sonnet 4</option>
                <option value="claude-opus-4-20250514">Claude Opus 4</option>
                <option value="claude-haiku-3-5">Claude Haiku 3.5</option>
              </select>
            </div>
          </section>

          {/* Codex Settings */}
          <section>
            <h3 className="text-sm font-bold text-green-400 mb-3">🟢 Codex (OpenAI)</h3>
            <div className="space-y-2">
              <label className="block text-xs text-gray-400">API Key</label>
              <input
                type="password"
                value={settings.codex.apiKey || ''}
                onChange={(e) =>
                  setSettings({ ...settings, codex: { ...settings.codex, apiKey: e.target.value } })
                }
                placeholder="sk-proj-..."
                className="w-full bg-[#1a1a1a] border border-[#383838] rounded px-3 py-2 text-sm focus:outline-none focus:border-green-500"
              />
              <label className="block text-xs text-gray-400 mt-2">Model</label>
              <select
                value={settings.codex.model}
                onChange={(e) =>
                  setSettings({ ...settings, codex: { ...settings.codex, model: e.target.value } })
                }
                className="w-full bg-[#1a1a1a] border border-[#383838] rounded px-3 py-2 text-sm focus:outline-none"
              >
                <option value="gpt-4o">GPT-4o</option>
                <option value="gpt-4o-mini">GPT-4o Mini</option>
                <option value="o3-mini">o3-mini</option>
              </select>
            </div>
          </section>

          {/* Debate Settings */}
          <section>
            <h3 className="text-sm font-bold text-gray-300 mb-3">⚔️ Debate</h3>
            <div className="space-y-2">
              <label className="block text-xs text-gray-400">Mode</label>
              <select
                value={settings.debate.mode}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    debate: { ...settings.debate, mode: e.target.value as any },
                  })
                }
                className="w-full bg-[#1a1a1a] border border-[#383838] rounded px-3 py-2 text-sm focus:outline-none"
              >
                <option value="auto">Auto — AI끼리 자동 토론</option>
                <option value="guided">Guided — 매 라운드 사용자 결정</option>
                <option value="watch">Watch — 관전 후 최종 승인</option>
              </select>

              <label className="block text-xs text-gray-400 mt-2">Max Rounds</label>
              <input
                type="number"
                min={1}
                max={10}
                value={settings.debate.maxRounds}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    debate: { ...settings.debate, maxRounds: parseInt(e.target.value) || 3 },
                  })
                }
                className="w-20 bg-[#1a1a1a] border border-[#383838] rounded px-3 py-2 text-sm focus:outline-none"
              />
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-[#383838]">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-400 hover:text-white rounded hover:bg-[#383838] transition"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 text-sm bg-purple-600 rounded font-medium hover:bg-purple-500 disabled:opacity-50 transition"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
