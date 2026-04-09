import { useState, useCallback, useRef } from 'react';
import { SLASH_COMMANDS, filterCommands, SlashCommand } from '../../shared/slash-commands';
import { DebateMode } from '../../shared/types';

// ──────────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────────

export interface SlashCommandOptions {
  projectPath: string;
  selectedMode: string;
  currentSessionId: string | null;
  onModeChange: (mode: DebateMode) => void;
  onClearMessages: () => void;
  onShowDiff: () => void;
  onApplyCode: () => void;
  onAddSystemMessage: (content: string) => void;
}

export interface UseSlashCommandsReturn {
  showPalette: boolean;
  filteredCommands: SlashCommand[];
  selectedIndex: number;
  /**
   * Call on every textarea value change.
   * Manages palette visibility and filtering based on slash-command detection.
   */
  handleInputChange: (value: string, cursorPos: number) => void;
  /**
   * Call on textarea keydown BEFORE default handling.
   * Returns true if the event was consumed and the caller should stop propagation.
   * When Enter/Tab is pressed with a palette selection, this also executes the
   * command (if no-arg) or returns the partial command text via `getPendingInput`.
   */
  handleKeyDown: (e: React.KeyboardEvent, currentInput: string) => boolean;
  /**
   * Returns any pending input that should replace the textarea value after
   * a keyboard-selection. Resets to null after being read.
   */
  getPendingInput: () => string | null;
  /** User clicked a command row in the palette. Returns the new input value. */
  handleSelect: (cmd: SlashCommand) => string;
  closePalette: () => void;
  /**
   * Attempt to execute a slash command from the full input string.
   * Returns true if the input was a recognised slash command (caller should clear input).
   * Returns false if the input should be forwarded as a debate prompt.
   */
  tryExecuteSlashCommand: (input: string) => boolean;
}

// ──────────────────────────────────────────────────────────────────────────────
// Hook
// ──────────────────────────────────────────────────────────────────────────────

export function useSlashCommands(options: SlashCommandOptions): UseSlashCommandsReturn {
  const [showPalette, setShowPalette] = useState(false);
  const [filteredCommands, setFilteredCommands] = useState<SlashCommand[]>(SLASH_COMMANDS);
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Keep options in a ref so executeCommand closure stays fresh without deps
  const optionsRef = useRef(options);
  optionsRef.current = options;

  // Pending input to write into the textarea after a keyboard-driven selection
  const pendingInputRef = useRef<string | null>(null);

  // ── Command Execution ──────────────────────────────────────────────────────

  const executeCommand = useCallback(async (name: string, args: string[]) => {
    const opts = optionsRef.current;

    switch (name) {
      case 'help': {
        const lines = ['Available slash commands:', ''];
        const categories: Array<'mode' | 'action' | 'info' | 'git'> = ['mode', 'action', 'info', 'git'];
        for (const cat of categories) {
          const cmds = SLASH_COMMANDS.filter(c => c.category === cat);
          if (cmds.length === 0) continue;
          lines.push(`**${cat.toUpperCase()}**`);
          for (const c of cmds) {
            const hint = c.argHint ? ` ${c.argHint}` : '';
            lines.push(`  \`/${c.name}${hint}\` — ${c.description}`);
          }
          lines.push('');
        }
        opts.onAddSystemMessage(lines.join('\n'));
        break;
      }

      case 'clear': {
        opts.onClearMessages();
        break;
      }

      case 'debate': {
        opts.onModeChange('debate');
        opts.onAddSystemMessage('Switched to debate mode.');
        break;
      }

      case 'solo': {
        const arg = (args[0] ?? '').toLowerCase();
        if (arg === 'claude') {
          opts.onModeChange('claude-only');
          opts.onAddSystemMessage('Switched to Claude solo mode.');
        } else if (arg === 'codex') {
          opts.onModeChange('codex-only');
          opts.onAddSystemMessage('Switched to Codex solo mode.');
        } else {
          opts.onAddSystemMessage('Usage: /solo <claude|codex>');
        }
        break;
      }

      case 'diff': {
        opts.onShowDiff();
        break;
      }

      case 'apply': {
        opts.onApplyCode();
        break;
      }

      case 'status': {
        try {
          const readiness = await window.api.getReadiness(opts.projectPath);
          if (!readiness) {
            opts.onAddSystemMessage('Could not retrieve provider status.');
            break;
          }
          const { providers, modes } = readiness;
          const lines = ['**Provider Status**', ''];
          lines.push(`Claude: ${providers.claude.ready ? 'ready' : 'not ready'} — ${providers.claude.detail}`);
          if (providers.claude.modelLabel) lines.push(`  Model: ${providers.claude.modelLabel}`);
          lines.push(`Codex: ${providers.codex.ready ? 'ready' : 'not ready'} — ${providers.codex.detail}`);
          if (providers.codex.modelLabel) lines.push(`  Model: ${providers.codex.modelLabel}`);
          lines.push('');
          lines.push('**Available Modes**');
          for (const m of modes) {
            const state = m.enabled ? 'enabled' : `disabled (${m.blockers.join(', ')})`;
            lines.push(`  ${m.mode}: ${state}`);
          }
          opts.onAddSystemMessage(lines.join('\n'));
        } catch {
          opts.onAddSystemMessage('Failed to fetch provider status.');
        }
        break;
      }

      case 'context': {
        try {
          if (!opts.projectPath) { opts.onAddSystemMessage('No project path set.'); break; }
          const ctx = await window.api.getProjectContext(opts.projectPath, 20);
          opts.onAddSystemMessage(`**Project Context**\n\n${ctx}`);
        } catch {
          opts.onAddSystemMessage('Failed to load project context.');
        }
        break;
      }

      case 'files': {
        try {
          if (!opts.projectPath) { opts.onAddSystemMessage('No project path set.'); break; }
          const tree = await window.api.getFiles(opts.projectPath);
          const lines = ['**Project Files**', ''];
          const formatTree = (items: any[], depth = 0) => {
            for (const item of (items ?? [])) {
              const indent = '  '.repeat(depth);
              const icon = item.type === 'directory' ? '📁' : '📄';
              lines.push(`${indent}${icon} ${item.name}`);
              if (item.children?.length) formatTree(item.children, depth + 1);
            }
          };
          formatTree(tree);
          opts.onAddSystemMessage(lines.join('\n'));
        } catch {
          opts.onAddSystemMessage('Failed to load file tree.');
        }
        break;
      }

      case 'rounds': {
        const n = parseInt(args[0] ?? '', 10);
        if (isNaN(n) || n < 1 || n > 20) {
          opts.onAddSystemMessage('Usage: /rounds <1–20>');
          break;
        }
        try {
          const settings = await window.api.getSettings();
          settings.debate.maxRounds = n;
          await window.api.saveSettings(settings);
          opts.onAddSystemMessage(`Max debate rounds set to ${n}.`);
        } catch {
          opts.onAddSystemMessage('Failed to update settings.');
        }
        break;
      }

      case 'model': {
        const provider = (args[0] ?? '').toLowerCase();
        const model = args[1] ?? '';
        if (!provider || !model) {
          opts.onAddSystemMessage('Usage: /model <claude|codex> <model-name>');
          break;
        }
        if (provider !== 'claude' && provider !== 'codex') {
          opts.onAddSystemMessage('Provider must be "claude" or "codex".');
          break;
        }
        try {
          const settings = await window.api.getSettings();
          if (provider === 'claude') {
            settings.claude.model = model;
          } else {
            settings.codex.model = model;
          }
          await window.api.saveSettings(settings);
          opts.onAddSystemMessage(`${provider} model set to "${model}".`);
        } catch {
          opts.onAddSystemMessage('Failed to update settings.');
        }
        break;
      }

      case 'checkpoint': {
        try {
          if (!opts.projectPath) { opts.onAddSystemMessage('No project path set.'); break; }
          const label = args.join(' ') || 'manual checkpoint';
          const result = await (window.api as any).createCheckpoint(opts.projectPath, label);
          opts.onAddSystemMessage(`Checkpoint created: ${result?.id ?? 'ok'}`);
        } catch (err: any) {
          opts.onAddSystemMessage(`Failed to create checkpoint: ${err?.message ?? String(err)}`);
        }
        break;
      }

      case 'rollback': {
        try {
          if (!opts.projectPath) { opts.onAddSystemMessage('No project path set.'); break; }
          const checkpoints: any[] = await (window.api as any).listCheckpoints(opts.projectPath);
          if (!checkpoints?.length) {
            opts.onAddSystemMessage('No checkpoints found.');
            break;
          }
          const sorted = [...checkpoints].sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0));
          const latest = sorted[0];
          await (window.api as any).rollbackCheckpoint(latest.id);
          opts.onAddSystemMessage(`Rolled back to checkpoint: ${latest.id}`);
        } catch (err: any) {
          opts.onAddSystemMessage(`Failed to rollback: ${err?.message ?? String(err)}`);
        }
        break;
      }

      case 'history': {
        try {
          const sessions: any[] = await (window.api as any).sessionList();
          if (!sessions?.length) {
            opts.onAddSystemMessage('No previous sessions found.');
            break;
          }
          const lines = ['**Session History**', ''];
          for (const s of sessions.slice(0, 15)) {
            const date = s.createdAt ? new Date(s.createdAt).toLocaleString() : 'unknown';
            const prompt = (s.prompt ?? '').slice(0, 60);
            const ellipsis = (s.prompt?.length ?? 0) > 60 ? '…' : '';
            lines.push(`• [${date}] ${prompt}${ellipsis}`);
          }
          opts.onAddSystemMessage(lines.join('\n'));
        } catch {
          opts.onAddSystemMessage('Failed to load session history.');
        }
        break;
      }

      default:
        opts.onAddSystemMessage(`Unknown command: /${name}`);
    }
  }, []);

  // ── Helpers ────────────────────────────────────────────────────────────────

  const closePalette = useCallback(() => {
    setShowPalette(false);
    setSelectedIndex(0);
  }, []);

  const parseSlashInput = (value: string): { name: string; args: string[] } | null => {
    if (!value.startsWith('/')) return null;
    const parts = value.slice(1).trim().split(/\s+/);
    const name = (parts[0] ?? '').toLowerCase();
    if (!name) return null;
    return { name, args: parts.slice(1) };
  };

  // ── handleInputChange ──────────────────────────────────────────────────────

  const handleInputChange = useCallback((value: string, _cursorPos: number) => {
    if (value.startsWith('/')) {
      // Only filter by the word immediately after the slash (before any space)
      const query = value.slice(1).split(/\s/)[0];
      const filtered = filterCommands(query);
      setFilteredCommands(filtered);
      setSelectedIndex(0);
      setShowPalette(filtered.length > 0);
    } else {
      setShowPalette(false);
    }
  }, []);

  // ── handleKeyDown ──────────────────────────────────────────────────────────

  const handleKeyDown = useCallback((e: React.KeyboardEvent, _currentInput: string): boolean => {
    if (!showPalette) return false;

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(0, i - 1));
      return true;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(filteredCommands.length - 1, i + 1));
      return true;
    }

    if (e.key === 'Escape') {
      e.preventDefault();
      closePalette();
      return true;
    }

    if (e.key === 'Enter' || e.key === 'Tab') {
      const cmd = filteredCommands[selectedIndex];
      if (cmd) {
        e.preventDefault();
        closePalette();
        if (cmd.argHint) {
          // Needs arguments: write `/name ` into input and let user type
          pendingInputRef.current = `/${cmd.name} `;
        } else {
          // Execute immediately; clear input
          executeCommand(cmd.name, []);
          pendingInputRef.current = '';
        }
        return true;
      }
    }

    return false;
  }, [showPalette, filteredCommands, selectedIndex, closePalette, executeCommand]);

  // ── getPendingInput ────────────────────────────────────────────────────────

  const getPendingInput = useCallback((): string | null => {
    const val = pendingInputRef.current;
    pendingInputRef.current = null;
    return val;
  }, []);

  // ── handleSelect (click) ───────────────────────────────────────────────────

  const handleSelect = useCallback((cmd: SlashCommand): string => {
    closePalette();
    if (cmd.argHint) {
      return `/${cmd.name} `;
    }
    executeCommand(cmd.name, []);
    return '';
  }, [closePalette, executeCommand]);

  // ── tryExecuteSlashCommand ─────────────────────────────────────────────────

  const tryExecuteSlashCommand = useCallback((input: string): boolean => {
    const parsed = parseSlashInput(input.trim());
    if (!parsed) return false;
    const matched = SLASH_COMMANDS.find(c => c.name === parsed.name);
    if (!matched) return false;
    executeCommand(parsed.name, parsed.args);
    closePalette();
    return true;
  }, [executeCommand, closePalette]);

  return {
    showPalette,
    filteredCommands,
    selectedIndex,
    handleInputChange,
    handleKeyDown,
    getPendingInput,
    handleSelect,
    closePalette,
    tryExecuteSlashCommand,
  };
}
