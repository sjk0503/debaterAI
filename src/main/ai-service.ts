import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import Store from 'electron-store';
import { AISettings } from '../shared/types';

const store = new Store<{ settings: AISettings }>({
  defaults: {
    settings: {
      claude: {
        authType: 'apiKey',
        model: 'claude-sonnet-4-20250514',
      },
      codex: {
        authType: 'apiKey',
        model: 'gpt-4o',
      },
      debate: {
        mode: 'auto',
        maxRounds: 3,
        autoApply: false,
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
        max_tokens: 4096,
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
        max_tokens: 4096,
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
        max_tokens: 4096,
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
        max_tokens: 4096,
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
