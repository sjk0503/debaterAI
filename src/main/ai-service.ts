import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ElectronStore = require('electron-store');
const Store = ElectronStore.default || ElectronStore;
import { AISettings } from '../shared/types';
import { DEFAULT_CLAUDE_MODEL, DEFAULT_OPENAI_MODEL } from '../shared/models';

const store = new Store({
  defaults: {
    settings: {
      claude: {
        authType: 'apiKey',
        model: DEFAULT_CLAUDE_MODEL,
        temperature: 0.3,
        maxTokens: 8192,
      },
      codex: {
        authType: 'apiKey',
        model: DEFAULT_OPENAI_MODEL,
        temperature: 0.3,
        maxTokens: 8192,
      },
      debate: {
        mode: 'debate',
        maxRounds: 3,
        autoApply: false,
        soloMode: 'debate',
      },
      git: {
        useWorktree: true,
        autoCommit: false,
        commitPrefix: 'debaterai:',
      },
      general: {
        theme: 'dark',
        language: 'ko',
        fontSize: 13,
      },
    },
  },
});

export class AIService {
  private claude: Anthropic | null = null;
  private openai: OpenAI | null = null;

  constructor() {
    this.initClients();
  }

  private initClients() {
    const settings = this.getSettings();

    if (settings.claude.apiKey || settings.claude.oauthToken) {
      this.claude = new Anthropic({
        apiKey: settings.claude.apiKey || settings.claude.oauthToken,
      });
    }

    if (settings.codex.apiKey || settings.codex.oauthToken) {
      this.openai = new OpenAI({
        apiKey: settings.codex.apiKey || settings.codex.oauthToken,
      });
    }
  }

  getSettings(): AISettings {
    return store.get('settings');
  }

  saveSettings(settings: AISettings) {
    store.set('settings', settings);
    this.initClients();
    return { success: true };
  }

  /**
   * Claude에게 메시지 보내기
   */
  async askClaude(
    systemPrompt: string,
    messages: { role: 'user' | 'assistant'; content: string }[],
    onStream?: (chunk: string) => void,
  ): Promise<string> {
    if (!this.claude) throw new Error('Claude not configured. Add API key in settings.');

    const settings = this.getSettings();

    if (onStream) {
      // 스트리밍
      const stream = this.claude.messages.stream({
        model: settings.claude.model,
        max_tokens: settings.claude.maxTokens || 8192,
        temperature: settings.claude.temperature ?? 0.3,
        system: systemPrompt,
        messages,
      });

      let fullText = '';
      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          fullText += event.delta.text;
          onStream(event.delta.text);
        }
      }
      return fullText;
    } else {
      const response = await this.claude.messages.create({
        model: settings.claude.model,
        max_tokens: settings.claude.maxTokens || 8192,
        temperature: settings.claude.temperature ?? 0.3,
        system: systemPrompt,
        messages,
      });

      return response.content
        .filter((block): block is Anthropic.TextBlock => block.type === 'text')
        .map((block) => block.text)
        .join('');
    }
  }

  /**
   * Codex(GPT)에게 메시지 보내기
   */
  async askCodex(
    systemPrompt: string,
    messages: { role: 'user' | 'assistant'; content: string }[],
    onStream?: (chunk: string) => void,
  ): Promise<string> {
    if (!this.openai) throw new Error('OpenAI not configured. Add API key in settings.');

    const settings = this.getSettings();
    const openaiMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      ...messages.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
    ];

    if (onStream) {
      const stream = await this.openai.chat.completions.create({
        model: settings.codex.model,
        messages: openaiMessages,
        stream: true,
        max_tokens: settings.codex.maxTokens || 8192,
        temperature: settings.codex.temperature ?? 0.3,
      });

      let fullText = '';
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content || '';
        fullText += delta;
        onStream(delta);
      }
      return fullText;
    } else {
      const response = await this.openai.chat.completions.create({
        model: settings.codex.model,
        messages: openaiMessages,
        max_tokens: settings.codex.maxTokens || 8192,
        temperature: settings.codex.temperature ?? 0.3,
      });

      return response.choices[0]?.message?.content || '';
    }
  }

  isClaudeReady(): boolean {
    return this.claude !== null;
  }

  isCodexReady(): boolean {
    return this.openai !== null;
  }
}
