import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ElectronStore = require('electron-store');
const Store = ElectronStore.default || ElectronStore;
import { AISettings, ProviderStatus, CliStatus } from '../shared/types';
import {
  DEFAULT_CLAUDE_MODEL,
  DEFAULT_OPENAI_MODEL,
  LEGACY_MODEL_MAP,
  ALL_MODELS,
  getModel,
} from '../shared/models';
import { ClaudeCodeService } from './claude-code-service';

const store = new Store({
  defaults: {
    settings: {
      claude: {
        selectedTransport: 'api',
        model: DEFAULT_CLAUDE_MODEL,
        temperature: 0.3,
        maxTokens: 8192,
      },
      codex: {
        selectedTransport: 'api',
        model: DEFAULT_OPENAI_MODEL,
        temperature: 0.3,
        maxTokens: 8192,
        reasoningEffort: 'none',
      },
      debate: {
        preferredMode: 'debate',
        maxRounds: 3,
        autoApply: false,
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
  private claudeCode: ClaudeCodeService;

  constructor(claudeCode?: ClaudeCodeService) {
    this.claudeCode = claudeCode || new ClaudeCodeService();
    this.initClients();
  }

  private initClients() {
    // Reset stale clients
    this.claude = null;
    this.openai = null;

    const settings = this.getSettings();

    if (settings.claude.apiKey) {
      this.claude = new Anthropic({
        apiKey: settings.claude.apiKey,
      });
    }

    if (settings.codex.apiKey) {
      this.openai = new OpenAI({
        apiKey: settings.codex.apiKey,
      });
    }
  }

  getSettings(): AISettings {
    const raw = store.get('settings');
    return normalizeSettings(raw);
  }

  saveSettings(settings: AISettings) {
    const normalized = normalizeSettings(settings);
    store.set('settings', normalized);
    this.initClients();
    return { success: true };
  }

  /**
   * Provider readiness status
   */
  async getProviderStatus(): Promise<{ claude: ProviderStatus; codex: ProviderStatus }> {
    const settings = this.getSettings();

    // Claude status
    let claudeStatus: ProviderStatus;
    if (settings.claude.selectedTransport === 'cli') {
      const cliStatus = await this.getClaudeCliStatus();
      claudeStatus = {
        provider: 'claude',
        selectedTransport: 'cli',
        supportedTransports: ['api', 'cli'],
        ready: cliStatus === 'configured',
        status: cliStatus === 'configured' ? 'configured'
          : cliStatus === 'notInstalled' ? 'needsCliInstall'
          : cliStatus === 'notLoggedIn' ? 'needsCliLogin'
          : 'error',
        detail: cliStatus === 'configured' ? 'Claude CLI ready'
          : cliStatus === 'notInstalled' ? 'Claude CLI not installed'
          : cliStatus === 'notLoggedIn' ? 'Run "claude" in terminal to log in'
          : 'CLI error',
        modelLabel: getModel(settings.claude.model)?.name,
      };
    } else {
      claudeStatus = {
        provider: 'claude',
        selectedTransport: 'api',
        supportedTransports: ['api', 'cli'],
        ready: !!settings.claude.apiKey,
        status: settings.claude.apiKey ? 'configured' : 'needsKey',
        detail: settings.claude.apiKey ? 'API key configured' : 'API key required',
        modelLabel: getModel(settings.claude.model)?.name,
      };
    }

    // Codex status — API only for now
    const codexStatus: ProviderStatus = {
      provider: 'codex',
      selectedTransport: 'api',
      supportedTransports: ['api'],
      ready: !!settings.codex.apiKey,
      status: settings.codex.apiKey ? 'configured' : 'needsKey',
      detail: settings.codex.apiKey ? 'API key configured' : 'API key required',
      modelLabel: getModel(settings.codex.model)?.name,
    };

    return { claude: claudeStatus, codex: codexStatus };
  }

  private async getClaudeCliStatus(): Promise<CliStatus> {
    try {
      const available = await this.claudeCode.isAvailable();
      if (!available) return 'notInstalled';
      const auth = await this.claudeCode.getAuthStatus();
      return auth ? 'configured' : 'notLoggedIn';
    } catch {
      return 'error';
    }
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

    const requestParams: any = {
      model: settings.codex.model,
      messages: openaiMessages,
      max_completion_tokens: settings.codex.maxTokens || 8192,
      temperature: settings.codex.temperature ?? 0.3,
    };

    // Add reasoning_effort if configured
    if (settings.codex.reasoningEffort && settings.codex.reasoningEffort !== 'none') {
      requestParams.reasoning_effort = settings.codex.reasoningEffort;
    }

    if (onStream) {
      requestParams.stream = true;
      const stream = await this.openai.chat.completions.create(requestParams);

      let fullText = '';
      for await (const chunk of stream as any) {
        const delta = chunk.choices[0]?.delta?.content || '';
        fullText += delta;
        onStream(delta);
      }
      return fullText;
    } else {
      const response = await this.openai.chat.completions.create(requestParams);
      return (response as any).choices[0]?.message?.content || '';
    }
  }

  isClaudeReady(): boolean {
    return this.claude !== null;
  }

  isCodexReady(): boolean {
    return this.openai !== null;
  }
}

// ============================================================================
// Settings normalization — model migration + legacy cleanup
// ============================================================================

function normalizeSettings(raw: any): AISettings {
  const settings = { ...raw } as AISettings;

  // --- Claude ---
  if (!settings.claude) settings.claude = {} as any;
  // Migrate legacy authType/oauthToken
  const rawClaude = raw?.claude || {};
  if (rawClaude.oauthToken && !rawClaude.apiKey) {
    settings.claude.apiKey = rawClaude.oauthToken;
  }
  delete (settings.claude as any).authType;
  delete (settings.claude as any).oauthToken;
  if (!settings.claude.selectedTransport) settings.claude.selectedTransport = 'api';
  // Migrate legacy model
  settings.claude.model = migrateModel(settings.claude.model, DEFAULT_CLAUDE_MODEL, 'anthropic');

  // --- Codex ---
  if (!settings.codex) settings.codex = {} as any;
  const rawCodex = raw?.codex || {};
  if (rawCodex.oauthToken && !rawCodex.apiKey) {
    settings.codex.apiKey = rawCodex.oauthToken;
  }
  delete (settings.codex as any).authType;
  delete (settings.codex as any).oauthToken;
  if (!settings.codex.selectedTransport) settings.codex.selectedTransport = 'api';
  settings.codex.model = migrateModel(settings.codex.model, DEFAULT_OPENAI_MODEL, 'openai');
  if (!settings.codex.reasoningEffort) settings.codex.reasoningEffort = 'none';

  // --- Debate ---
  if (!settings.debate) settings.debate = {} as any;
  // Migrate mode → preferredMode
  if ((settings.debate as any).mode && !settings.debate.preferredMode) {
    settings.debate.preferredMode = (settings.debate as any).mode;
  }
  delete (settings.debate as any).mode;
  delete (settings.debate as any).soloMode;
  if (!settings.debate.preferredMode) settings.debate.preferredMode = 'debate';

  return settings;
}

function migrateModel(current: string, defaultModel: string, provider: 'anthropic' | 'openai'): string {
  if (!current) return defaultModel;
  // Check if it's a known legacy model
  if (LEGACY_MODEL_MAP[current]) return LEGACY_MODEL_MAP[current];
  // Check if it's a valid current model
  const known = ALL_MODELS.find((m) => m.id === current && m.provider === provider);
  if (known) return current;
  // Unknown model — fallback to default
  return defaultModel;
}
