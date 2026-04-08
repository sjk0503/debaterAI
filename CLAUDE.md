# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

debaterAI is a macOS Electron desktop app where Claude and Codex (GPT) AI agents debate in real-time to write code. Users submit a coding prompt, two AIs debate approaches, reach consensus, then generate code — all within a 3-panel desktop interface.

**Stack**: Electron 34 + React 19 + TypeScript 5.7 + Vite 6 + Tailwind CSS 3.4

## Commands

```bash
# Development (starts Electron main + Vite renderer in parallel)
npm run dev
# Under the hood: concurrently "tsx watch src/main/index.ts" "vite"

# Build (Vite compiles main + preload + renderer to dist/)
npm run build

# Run built app without packaging
npm run start

# Package macOS DMG (universal binary)
npm run package          # build + electron-builder --mac --universal
npm run package:arm64    # arm64 only
npm run package:x64      # x64 only
```

There is no test suite or linter configured yet.

## Architecture

### Electron Process Model

The app follows standard Electron context isolation:

- **Main process** (`src/main/`): Node.js — runs AI calls, git, terminal, file I/O
- **Renderer process** (`src/renderer/`): Browser — React UI, Monaco editor
- **Preload bridge** (`src/main/preload.ts`): Exposes `window.api` via `contextBridge` with 70+ methods
- **Shared types** (`src/shared/`): TypeScript interfaces, AI model registry, and event definitions used by both processes

All main↔renderer communication is IPC-based: `ipcRenderer.invoke()` for request-response, `ipcRenderer.on()` for streaming events.

### Main Process Services

Each service in `src/main/` owns a domain and registers its own IPC handlers in `index.ts`:

| Service | Responsibility |
|---------|---------------|
| `debate-engine.ts` | Core orchestration — manages debate sessions, rounds, consensus detection |
| `ai-service.ts` | Claude + OpenAI API clients, settings storage via electron-store |
| `transport-adapter.ts` | Abstracts API vs CLI execution per provider (4 adapters) |
| `agent-runtime.ts` | Spawns CLI agents as subprocesses, captures structured events |
| `orchestrator.ts` | Parallel debate — spawns both agents in separate worktrees, orchestrates merge |
| `session-store.ts` | JSONL-based append-only session persistence |
| `task-manager.ts` | Tracks individual agent tasks within parallel sessions |
| `checkpoint-service.ts` | Git tag-based snapshots before agent runs, supports rollback |
| `git-service.ts` | Git worktree per debate, branch/commit/diff/merge operations |
| `terminal-service.ts` | Shell command execution with streaming output |
| `search-service.ts` | Grep, file search, project stats |
| `permission-service.ts` | Claude Code-style permission rules with glob patterns |
| `claude-code-service.ts` | Claude Code CLI subprocess integration |
| `codex-cli-service.ts` | Codex CLI integration |
| `stream-parsers/` | Parse Claude stream-json and Codex JSONL into unified `AgentEvent` format |

### Debate Engine Flow

**Sequential mode (V1):**
1. User submits prompt → `debate:start` IPC
2. Engine collects project context (package.json, tsconfig, file tree, top source files)
3. Claude proposes (role: "PRIMARY CODER") → Codex reviews (role: "REVIEWER & ARCHITECT")
4. Each response includes `[AGREEMENT: agree/partial/disagree]` marker (parsed via regex)
5. Both agree → consensus reached → code generation
6. Disagree after `maxRounds` (default: 3) → Claude wins as primary coder
7. Messages stream to UI in real-time via `debate:message` events

**Parallel mode (V2 via Orchestrator):**
1. Creates separate git worktrees for Claude + Codex
2. Spawns both agents simultaneously via `AgentRuntime`
3. Captures all agent events (file reads/writes, bash, thinking)
4. Diffs results between worktrees; user chooses which to keep or merge

Modes: `debate` (Claude vs Codex), `claude-only`, `codex-only`

Status lifecycle: `idle` → `thinking` → `debating` → `consensus` → `coding` → `done` | `error`

### Transport Adapter System

AI calls are abstracted through transport adapters in `transport-adapter.ts`:
- **ClaudeApiAdapter**: Direct Anthropic SDK streaming via `messages.stream()`
- **ClaudeCliAdapter**: Spawns `claude --print --bare --output-format stream-json`, pipes stdin to avoid ARG_MAX
- **OpenAIApiAdapter**: Direct OpenAI SDK calls with `reasoningEffort` support
- **CodexCliAdapter**: Spawns local codex binary, JSONL output

Default transport is API; CLI option exists for local/offline use.

### IPC Channel Namespaces

Handlers are grouped by domain prefix: `agent:*`, `orchestrator:*`, `checkpoint:*`, `session:*`, `app:*`, `debate:*`, `settings:*`, `project:*`, `dialog:*`, `git:*`, `terminal:*`, `search:*`, `permission:*`, `claudeCode:*`, `codexCli:*`

### Session Persistence

Sessions are stored in `~/.debaterai/sessions/` using two files per session:
- `{sessionId}.jsonl` — append-only event log (session_start, user_message, agent_event, status_change, consensus, etc.)
- `{sessionId}.meta.json` — metadata (id, prompt, mode, status, timestamps, agents, filesChanged)

Managed by `SessionStore` in main process, loaded/listed via `session:*` IPC handlers.

### Git Worktree Strategy

Each debate session creates an isolated git worktree at `../.debaterai-worktrees/<debateId>/` with branch `debate/<debateId>`, preventing conflicts between concurrent debates. `completeDebate()` merges the branch back to main.

### Shared Types (`src/shared/`)

- **`types.ts`**: Core domain types — `DebateMessage`, `DebateSession`, `AISettings`, `AppReadiness`, etc.
- **`models.ts`**: AI model registry with context window sizes. Claude default: `claude-sonnet-4-6`. OpenAI default: `gpt-5.4-mini`. Includes legacy migration map.
- **`agent-events.ts`**: Unified event model for both CLI parsers — event types include `text_delta`, `tool_use_start/done`, `file_read/write`, `bash_exec/result`, `thinking`, `error`.
- **`session-types.ts`**: Session persistence event schema.

### Renderer Layout

3-panel resizable layout in `App.tsx`: sidebar (FileExplorer/SessionList), center (DebatePanel), right (CodeView/DiffView with EditorTabs). State is managed with React `useState` — no external state library.

Key panels: `AgentActivityPanel` (real-time agent events), `TerminalPanel` (xterm-based), `OnboardingWizard` (first-time setup), `SettingsModal` (4 tabs: Claude/Codex/Debate/Git).

### Design System

Dark theme with CSS custom properties in `src/renderer/styles/globals.css`:
- Role colors: `--claude` (purple #8b5cf6), `--codex` (green #10b981), `--user` (blue #3b82f6)
- Accent: indigo #6366f1

### Build Configuration

`vite.config.ts` builds three targets via `vite-plugin-electron`:
1. Main process: `src/main/index.ts` → `dist/main/index.js`
2. Preload: `src/main/preload.ts` → `dist/main/preload.js`
3. Renderer: standard Vite SPA → `dist/renderer/`

Path aliases: `@/*` → `src/*`, `@shared/*` → `src/shared/*`

Main process externals include: electron, electron-store, @anthropic-ai/sdk, openai, uuid, and Node built-ins.

Electron-builder config is in `electron-builder.yml` (macOS universal DMG, hardened runtime, ASAR enabled).

### Settings Defaults

Stored via electron-store (encrypted). Key defaults:
- Claude: `claude-sonnet-4-6`, temperature 0.3, maxTokens 8192
- Codex: `gpt-5.4-mini`, temperature 0.3, maxTokens 8192, reasoningEffort 'none'
- Debate: maxRounds 3, autoApply false
- Git: useWorktree true, autoCommit false, commitPrefix 'debaterai:'
- General: theme 'dark', language 'ko', fontSize 13
