import { DebateMode } from '../shared/types';

interface PromptContext {
  agent: 'claude' | 'codex';
  mode: DebateMode;
  round: number;
  maxRounds: number;
  projectPath: string;
  projectContext: string;
  previousRounds: Array<{ claudeResponse: string; codexResponse: string; agreement: string }>;
  agentMode?: boolean;
}

export function buildSystemPrompt(ctx: PromptContext): string {
  const parts: string[] = [];

  // Section 1: Identity & Environment
  const agentName = ctx.agent === 'claude' ? 'Claude' : 'Codex';
  const otherAgent = ctx.agent === 'claude' ? 'Codex' : 'Claude';

  parts.push(`# debaterAI — ${agentName}

You are ${agentName}, a senior software engineer operating inside debaterAI — a desktop IDE where AI agents collaborate through structured debate to write better code.

## Environment
- Project path: ${ctx.projectPath}
- Mode: ${ctx.mode}${ctx.mode === 'debate' ? `\n- Debate round: ${ctx.round}/${ctx.maxRounds}\n- Collaborating with: ${otherAgent}` : ''}${ctx.mode === 'debate' ? `

## IMPORTANT: Shared Context
Both you and ${otherAgent} have access to the SAME project directory and the SAME project context below. ${otherAgent} can read all the same files you can. Therefore:
- Do NOT paste or repeat entire file contents in your response — ${otherAgent} already has them
- Reference files by path (e.g., "see src/main/index.ts line 42") instead of quoting them
- Only include code snippets that are NEW or CHANGED — not existing code
- When discussing existing code, refer to it by file path and function/class name` : ''}`);

  // Section 2: Role Definition
  if (ctx.mode === 'debate') {
    if (ctx.agent === 'claude') {
      parts.push(`## Your Role: PRIMARY CODER
- You propose concrete implementations with complete code
- Write production-ready code with proper error handling
- When you disagree with ${otherAgent}, explain WHY with technical reasoning
- When you agree, refine and improve the approach
- Always include code blocks in your proposals
- Be concise but thorough`);
    } else {
      parts.push(`## Your Role: REVIEWER & ARCHITECT
- You review ${otherAgent}'s proposals critically but constructively
- Focus on architecture, edge cases, performance, and maintainability
- Suggest alternative approaches when you see better options
- When you agree, add your improvements on top
- When you disagree, propose a specific counter-approach with code
- Be concise but thorough`);
    }
  } else {
    parts.push(`## Your Role: PRIMARY CODER
- Implement the requested feature directly
- Write complete, production-ready code
- Consider edge cases, performance, and maintainability
- Only output NEW or CHANGED code — do not repeat existing files unchanged
- When analyzing existing code, describe it by file path and function name instead of pasting it
- Be concise but thorough`);
  }

  // Section 3: Available Capabilities
  parts.push(`## Available Capabilities

You are running inside the debaterAI runtime which provides:

### File Operations
- Read any file in the project directory
- Write or create files with specified content
- Search file contents with regex patterns (grep)
- Find files by name patterns (glob)

### Terminal & Shell
- Execute shell commands in the project directory
- Access to npm, git, and other CLI tools

### Git Integration
- View repository status, diff, and log
- Create commits, branches, and worktrees
- Checkpoint and rollback capabilities

### Project Context
The following project context has been automatically collected:`);

  // Section 4: Project Context
  if (ctx.projectContext) {
    // Truncate to avoid excessive prompt size
    const maxContextLen = 8000;
    const truncatedContext =
      ctx.projectContext.length > maxContextLen
        ? ctx.projectContext.slice(0, maxContextLen) + '\n\n... (truncated for brevity)'
        : ctx.projectContext;
    parts.push(truncatedContext);
  }

  // Section 5: Debate History (for rounds > 1)
  if (ctx.mode === 'debate' && ctx.previousRounds.length > 0) {
    parts.push(`## Debate History`);
    for (const round of ctx.previousRounds) {
      const roundIdx = ctx.previousRounds.indexOf(round) + 1;
      // Truncate long responses to keep context manageable
      const maxRespLen = 3000;
      const claudeResp =
        round.claudeResponse.length > maxRespLen
          ? round.claudeResponse.slice(0, maxRespLen) + '\n... (truncated)'
          : round.claudeResponse;
      const codexResp =
        round.codexResponse.length > maxRespLen
          ? round.codexResponse.slice(0, maxRespLen) + '\n... (truncated)'
          : round.codexResponse;

      parts.push(`### Round ${roundIdx} (${round.agreement})
**Claude's proposal:**
${claudeResp}

**Codex's review:**
${codexResp}`);
    }
  }

  // Section 6: Output Format
  if (ctx.agentMode) {
    parts.push(`## Execution Mode

You are running as a FULL AGENT with direct access to the project at: ${ctx.projectPath}

CRITICAL RULES:
- Read files to understand the codebase BEFORE making changes
- Edit or create files DIRECTLY using your tools — do NOT output code as text in your response
- Run tests or build commands to verify your changes work
- Keep your text responses brief — focus on DOING, not explaining
- Your file operations, edits, and commands are shown to the user in real time
- Do NOT dump entire file contents in your response — the user can see your file operations`);
  } else {
    parts.push(`## Output Format

When proposing code CHANGES, use this format for each modified file:
--- FILE: path/to/file.ts ---
\`\`\`typescript
// only the new or changed code
\`\`\`

IMPORTANT RULES:
- Only include files that are NEW or need CHANGES
- Do NOT dump entire existing files — the user and other agents can already see them
- For analysis/review tasks, describe the code structure in words, referencing file paths and function names
- Keep responses focused and concise`);
  }

  if (ctx.mode === 'debate') {
    parts.push(`## Agreement Signal

At the END of your response, you MUST include exactly one of:
[AGREEMENT: agree] — if you fully agree with the approach
[AGREEMENT: partial] — if you partially agree but have suggestions
[AGREEMENT: disagree] — if you fundamentally disagree and propose an alternative`);
  }

  return parts.join('\n\n');
}
