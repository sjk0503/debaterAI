export interface SlashCommand {
  name: string;
  description: string;
  icon: string;
  category: 'mode' | 'action' | 'info' | 'git';
  argHint?: string;
  handler: string;
}

export const SLASH_COMMANDS: SlashCommand[] = [
  // Mode
  { name: 'debate', description: 'Switch to debate mode', icon: '⚔️', category: 'mode', handler: 'debate' },
  { name: 'solo', description: 'Switch to solo mode', icon: '🎯', category: 'mode', argHint: '<claude|codex>', handler: 'solo' },
  // Action
  { name: 'clear', description: 'Clear conversation', icon: '🗑️', category: 'action', handler: 'clear' },
  { name: 'apply', description: 'Apply last generated code', icon: '✅', category: 'action', handler: 'apply' },
  { name: 'rounds', description: 'Set max debate rounds', icon: '🔄', category: 'action', argHint: '<number>', handler: 'rounds' },
  { name: 'model', description: 'Quick model switch', icon: '🤖', category: 'action', argHint: '<provider> <model>', handler: 'model' },
  // Info
  { name: 'context', description: 'Show project context summary', icon: '📋', category: 'info', handler: 'context' },
  { name: 'diff', description: 'Show current git diff', icon: '📊', category: 'info', handler: 'diff' },
  { name: 'status', description: 'Show provider readiness', icon: '📡', category: 'info', handler: 'status' },
  { name: 'files', description: 'Show project file tree', icon: '📁', category: 'info', handler: 'files' },
  { name: 'help', description: 'Show all available commands', icon: '❓', category: 'info', handler: 'help' },
  { name: 'history', description: 'Show debate history summary', icon: '📜', category: 'info', handler: 'history' },
  // Git
  { name: 'checkpoint', description: 'Create git checkpoint', icon: '💾', category: 'git', handler: 'checkpoint' },
  { name: 'rollback', description: 'Rollback to last checkpoint', icon: '⏪', category: 'git', handler: 'rollback' },
];

export function filterCommands(query: string): SlashCommand[] {
  if (!query) return SLASH_COMMANDS;
  const lower = query.toLowerCase();
  return SLASH_COMMANDS.filter(cmd => cmd.name.startsWith(lower));
}
