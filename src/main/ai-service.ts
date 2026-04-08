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
import {
  TransportAdapter,
  TransportMessage,
  ClaudeApiAdapter,
  ClaudeCliAdapter,
  OpenAIApiAdapter,
  CodexCliAdapter,
} from './transport-adapter';
import { CodexCliService } from './codex-cli-service';

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
  private codexCli: CodexCliService;
  private projectPath: string = '';
  private cachedClaudeCliStatus: CliStatus = 'error';
  private cachedCodexCliStatus: CliStatus = 'error';

  constructor(claudeCode?: ClaudeCodeService, codexCli?: CodexCliService) {
    this.claudeCode = claudeCode || new ClaudeCodeService();
    this.codexCli = codexCli || new CodexCliService();
    this.initClients();
    this.refreshCliStatuses();
  }

  private async refreshCliStatuses() {
    this.cachedClaudeCliStatus = await this.getClaudeCliStatus();
    this.cachedCodexCliStatus = await this.getCodexCliStatus();
  }

  setProjectPath(path: string) {
    this.projectPath = path;
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

  // ============================================================================
  // Transport Adapter resolution
  // ============================================================================

  private getClaudeAdapter(): TransportAdapter {
    const settings = this.getSettings();

    if (settings.claude.selectedTransport === 'cli') {
      return new ClaudeCliAdapter(
        this.claudeCode,
        settings.claude.model,
        this.projectPath || process.cwd(),
        settings.claude.effort,
      );
    }

    if (!this.claude) {
      throw new Error('Claude not configured. Add API key in settings.');
    }

    return new ClaudeApiAdapter(
      this.claude,
      settings.claude.model,
      settings.claude.maxTokens || 8192,
      settings.claude.temperature ?? 0.3,
    );
  }

  private getCodexAdapter(): TransportAdapter {
    const settings = this.getSettings();

    if (settings.codex.selectedTransport === 'cli') {
      return new CodexCliAdapter(
        this.codexCli,
        settings.codex.model,
        this.projectPath || process.cwd(),
      );
    }

    if (!this.openai) {
      throw new Error('OpenAI not configured. Add API key in settings.');
    }

    return new OpenAIApiAdapter(
      this.openai,
      settings.codex.model,
      settings.codex.maxTokens || 8192,
      settings.codex.temperature ?? 0.3,
      settings.codex.reasoningEffort,
    );
  }

  // ============================================================================
  // Public API — delegates to transport adapters
  // ============================================================================

  async askClaude(
    systemPrompt: string,
    messages: TransportMessage[],
    onStream?: (chunk: string) => void,
  ): Promise<string> {
    const adapter = this.getClaudeAdapter();
    return adapter.ask(systemPrompt, messages, onStream);
  }

  async askCodex(
    systemPrompt: string,
    messages: TransportMessage[],
    onStream?: (chunk: string) => void,
  ): Promise<string> {
    const adapter = this.getCodexAdapter();
    return adapter.ask(systemPrompt, messages, onStream);
  }

  // ============================================================================
  // Provider readiness
  // ============================================================================

  async getProviderStatus(): Promise<{ claude: ProviderStatus; codex: ProviderStatus }> {
    const settings = this.getSettings();

    let claudeStatus: ProviderStatus;
    if (settings.claude.selectedTransport === 'cli') {
      const cliStatus = await this.getClaudeCliStatus();
      this.cachedCliStatus = cliStatus;
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

    let codexStatus: ProviderStatus;
    if (settings.codex.selectedTransport === 'cli') {
      const cliStatus = await this.getCodexCliStatus();
      this.cachedCodexCliStatus = cliStatus;
      codexStatus = {
        provider: 'codex',
        selectedTransport: 'cli',
        supportedTransports: ['api', 'cli'],
        ready: cliStatus === 'configured',
        status: cliStatus === 'configured' ? 'configured'
          : cliStatus === 'notInstalled' ? 'needsCliInstall'
          : cliStatus === 'notLoggedIn' ? 'needsCliLogin'
          : 'error',
        detail: cliStatus === 'configured' ? 'Codex CLI ready'
          : cliStatus === 'notInstalled' ? 'Codex CLI not installed'
          : cliStatus === 'notLoggedIn' ? 'Run "codex" in terminal to log in'
          : 'CLI error',
        modelLabel: getModel(settings.codex.model)?.name,
      };
    } else {
      codexStatus = {
        provider: 'codex',
        selectedTransport: 'api',
        supportedTransports: ['api', 'cli'],
        ready: !!settings.codex.apiKey,
        status: settings.codex.apiKey ? 'configured' : 'needsKey',
        detail: settings.codex.apiKey ? 'API key configured' : 'API key required',
        modelLabel: getModel(settings.codex.model)?.name,
      };
    }

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

  private async getCodexCliStatus(): Promise<CliStatus> {
    try {
      const available = await this.codexCli.isAvailable();
      if (!available) return 'notInstalled';
      // Codex CLI auth is checked via a test exec — skip heavy check,
      // assume configured if binary exists (real errors surface at exec time)
      return 'configured';
    } catch {
      return 'error';
    }
  }

  isClaudeReady(): boolean {
    const settings = this.getSettings();
    if (settings.claude.selectedTransport === 'cli') {
      return this.cachedClaudeCliStatus === 'configured';
    }
    return this.claude !== null;
  }

  isCodexReady(): boolean {
    const settings = this.getSettings();
    if (settings.codex.selectedTransport === 'cli') {
      return this.cachedCodexCliStatus === 'configured';
    }
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
  const rawClaude = raw?.claude || {};
  if (rawClaude.oauthToken && !rawClaude.apiKey) {
    settings.claude.apiKey = rawClaude.oauthToken;
  }
  delete (settings.claude as any).authType;
  delete (settings.claude as any).oauthToken;
  if (!settings.claude.selectedTransport) settings.claude.selectedTransport = 'api';
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
  if (LEGACY_MODEL_MAP[current]) return LEGACY_MODEL_MAP[current];
  const known = ALL_MODELS.find((m) => m.id === current && m.provider === provider);
  if (known) return current;
  return defaultModel;
}
