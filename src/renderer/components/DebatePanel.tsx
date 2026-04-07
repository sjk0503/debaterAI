import React, { useState, useRef, useEffect } from 'react';
import { DebateMessage } from '../../shared/types';

interface Props {
  messages: DebateMessage[];
  status: string;
  projectPath: string;
  onProjectPathChange: (path: string) => void;
}

export function DebatePanel({ messages, status, projectPath, onProjectPathChange }: Props) {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = async () => {
    if (!input.trim() || !projectPath.trim()) return;
    if (status !== 'idle' && status !== 'done' && status !== 'error') return;

    await window.api.startDebate(input.trim(), projectPath.trim());
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const roleConfig = {
    user: { label: '👤 You', color: 'border-blue-500', bg: 'bg-blue-500/10' },
    claude: { label: '🟣 Claude', color: 'border-purple-500', bg: 'bg-purple-500/10' },
    codex: { label: '🟢 Codex', color: 'border-green-500', bg: 'bg-green-500/10' },
    system: { label: '⚙️ System', color: 'border-gray-500', bg: 'bg-gray-500/10' },
  };

  return (
    <div className="flex flex-col h-full no-drag">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-gray-500">
            <div className="text-6xl mb-4">🤖⚔️🤖</div>
            <h2 className="text-xl font-bold mb-2">debaterAI</h2>
            <p className="text-sm text-center max-w-md">
              Claude와 Codex가 토론하며 최적의 코드를 만듭니다.
              <br />
              프로젝트 경로를 설정하고 명령을 입력하세요.
            </p>
          </div>
        )}

        {messages.map((msg) => {
          const cfg = roleConfig[msg.role] || roleConfig.system;
          return (
            <div
              key={msg.id}
              className={`rounded-lg border-l-4 ${cfg.color} ${cfg.bg} p-3`}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-bold text-gray-300">{cfg.label}</span>
                {msg.round && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-700 text-gray-400">
                    Round {msg.round}
                  </span>
                )}
                {msg.agreement && (
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded ${
                      msg.agreement === 'agree'
                        ? 'bg-green-900 text-green-300'
                        : msg.agreement === 'partial'
                          ? 'bg-yellow-900 text-yellow-300'
                          : 'bg-red-900 text-red-300'
                    }`}
                  >
                    {msg.agreement === 'agree' ? '✅ 합의' : msg.agreement === 'partial' ? '⚡ 부분합의' : '❌ 반대'}
                  </span>
                )}
              </div>
              <div className="debate-message text-sm text-gray-200 whitespace-pre-wrap break-words">
                {msg.content}
                {(status === 'debating' || status === 'coding') &&
                  msg === messages[messages.length - 1] &&
                  msg.role !== 'system' && (
                    <span className="typing-cursor" />
                  )}
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="border-t border-[#383838] p-4 bg-[#242424]">
        {/* Project Path */}
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xs text-gray-500">📁</span>
          <input
            type="text"
            value={projectPath}
            onChange={(e) => onProjectPathChange(e.target.value)}
            placeholder="프로젝트 경로 (예: /Users/you/my-project)"
            className="flex-1 bg-[#1a1a1a] border border-[#383838] rounded px-3 py-1.5 text-xs text-gray-300 focus:outline-none focus:border-purple-500"
          />
        </div>

        {/* Message Input */}
        <div className="flex gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="명령을 입력하세요... (예: 로그인 기능 만들어줘)"
            rows={2}
            className="flex-1 bg-[#1a1a1a] border border-[#383838] rounded-lg px-4 py-3 text-sm text-white resize-none focus:outline-none focus:border-purple-500 placeholder-gray-600"
          />
          <button
            onClick={handleSubmit}
            disabled={!input.trim() || !projectPath.trim() || (status !== 'idle' && status !== 'done' && status !== 'error')}
            className="px-6 bg-gradient-to-r from-purple-600 to-green-600 rounded-lg font-bold text-sm hover:from-purple-500 hover:to-green-500 disabled:opacity-30 disabled:cursor-not-allowed transition self-end h-10"
          >
            ⚔️ 토론 시작
          </button>
        </div>
      </div>
    </div>
  );
}
