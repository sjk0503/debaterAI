# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

debaterAI is a macOS Electron desktop app where Claude and Codex (GPT) AI agents debate in real-time to write code. Users submit a coding prompt, two AIs debate approaches, reach consensus, then generate code — all within a 3-panel desktop interface.

**Stack**: Electron 34 + React 19 + TypeScript 5.7 + Vite 6 + Tailwind CSS 3.4

## Commands

```bash
# Development (starts Electron main + Vite renderer in parallel)
npm run dev

# Build (Vite compiles main + preload + renderer to dist/)
npm run build

# Package macOS DMG (universal binary)
npm run package

# Package architecture-specific
npm run package:arm64
npm run package:x64
```

There is no test suite or linter configured yet.

## Architecture

### Electron Process Model

The app follows standard Electron context isolation:

- **Main process** (`src/main/`): Node.js — runs AI calls, git, terminal, file I/O
- **Renderer process** (`src/renderer/`): Browser — React UI, Monaco editor
- **Preload bridge** (`src/main/preload.ts`): Exposes `window.api` via `contextBridge`
- **Shared types** (`src/shared/`): TypeScript interfaces and AI model registry used by both processes

All main↔renderer communication is IPC-based: `ipcRenderer.invoke()` for request-response, `ipcRenderer.on()` for streaming events.

### Main Process Services

Each service in `src/main/` owns a domain and registers its own IPC handlers in `index.ts`:

| Service | Responsibility |
|---------|---------------|
| `debate-engine.ts` | Core orchestration — manages debate sessions, rounds, consensus detection |
| `ai-service.ts` | Claude + OpenAI API clients, settings storage via electron-store |
| `git-service.ts` | Git worktree per debate, branch/commit/diff/merge operations |
| `terminal-service.ts` | Shell command execution with streaming output |
| `search-service.ts` | Grep, file search, project stats |
| `permission-service.ts` | Claude Code-style permission rules with glob patterns |
| `claude-code-service.ts` | Claude Code CLI subprocess integration |

### Debate Engine Flow

1. User submits prompt → `debate:start` IPC
2. Engine collects project context (package.json, tsconfig, file tree)
3. Claude proposes (role: "PRIMARY CODER") → Codex reviews (role: "REVIEWER & ARCHITECT")
4. Each response includes `[AGREEMENT: agree/partial/disagree]` marker
5. Both agree → consensus reached → code generation
6. Disagree after `maxRounds` → Claude wins as primary coder
7. Messages stream to UI in real-time via `debate:message` events

Modes: `debate` (Claude vs Codex), `claude-only`, `codex-only`

### IPC Channel Namespaces

Handlers are grouped by domain prefix: `debate:*`, `settings:*`, `project:*`, `git:*`, `terminal:*`, `search:*`, `permission:*`, `claudeCode:*`

### Git Worktree Strategy

Each debate session creates an isolated git worktree at `../.debaterai-worktrees/<debateId>/` with branch `debate/<debateId>`, preventing conflicts between concurrent debates.

### Renderer Layout

3-panel layout in `App.tsx`: sidebar (FileExplorer), center (DebatePanel), right (CodeView/DiffView). State is managed with React `useState` — no external state library.

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

Electron-builder config is in `electron-builder.yml` (macOS universal DMG, hardened runtime).
