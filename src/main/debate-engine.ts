import { v4 as uuidv4 } from 'uuid';
import { AIService } from './ai-service';
import { SessionStore } from './session-store';
import {
  DebateSession,
  DebateMessage,
  DebateRound,
  Agreement,
  DebateStatus,
  ConsensusResult,
  AppReadiness,
  ModeStatus,
} from '../shared/types';

const CLAUDE_SYSTEM = `You are Claude, a senior software engineer participating in a code debate.
Your role: PRIMARY CODER — you write the actual implementation.

Rules:
- Propose concrete implementation plans with code
- When you disagree with Codex, explain WHY with technical reasoning
- When you agree, say so clearly and refine the approach
- Always include code blocks when proposing solutions
- Be concise but thorough

At the end of your response, add a line:
[AGREEMENT: agree/partial/disagree]`;

const CODEX_SYSTEM = `You are Codex, a senior software architect participating in a code debate.
Your role: REVIEWER & ARCHITECT — you review plans and suggest improvements.

Rules:
- Review Claude's proposals critically but constructively
- Suggest alternative approaches when you see better options
- Focus on architecture, edge cases, performance, and maintainability
- When you agree, add your improvements on top
- When you disagree, propose a specific counter-approach with code
- Be concise but thorough

At the end of your response, add a line:
[AGREEMENT: agree/partial/disagree]`;

const CODEX_SOLO_SYSTEM = `You are Codex, a senior software engineer writing code directly.
Your role: PRIMARY CODER — you implement the requested feature.

Rules:
- Propose concrete implementation plans with code
- Include complete, production-ready code blocks
- Consider edge cases, performance, and maintainability
- Be concise but thorough`;

export class DebateEngine {
  private sessions: Map<string, DebateSession> = new Map();
  private messageCallback?: (msg: DebateMessage) => void;
  private statusCallback?: (status: { debateId: string; status: DebateStatus }) => void;
  private sessionStore: SessionStore;

  constructor(private ai: AIService, sessionStore?: SessionStore) {
    this.sessionStore = sessionStore || new SessionStore();
  }

  onMessage(cb: (msg: DebateMessage) => void) {
    this.messageCallback = cb;
  }

  onStatusChange(cb: (status: { debateId: string; status: DebateStatus }) => void) {
    this.statusCallback = cb;
  }

  private emit(msg: DebateMessage, sessionId?: string) {
    this.messageCallback?.(msg);
    // Persist to session store
    if (sessionId) {
      if (msg.role === 'system') {
        this.sessionStore.append(sessionId, {
          type: 'system_message',
          timestamp: msg.timestamp,
          data: { kind: 'system_message', content: msg.content },
        });
      } else if (msg.role === 'user') {
        this.sessionStore.append(sessionId, {
          type: 'user_message',
          timestamp: msg.timestamp,
          data: { kind: 'user_message', content: msg.content },
        });
      }
      // Agent messages are persisted via agent events in the runtime layer
    }
  }

  private setStatus(debateId: string, status: DebateStatus) {
    const session = this.sessions.get(debateId);
    if (session) session.status = status;
    this.statusCallback?.({ debateId, status });
    // Persist status change
    this.sessionStore.append(debateId, {
      type: 'status_change',
      timestamp: Date.now(),
      data: { kind: 'status_change', status },
    });
  }

  /** Get the session store for IPC access */
  getSessionStore(): SessionStore {
    return this.sessionStore;
  }

  /**
   * Validate that a debate can start — checks provider readiness for the given mode
   */
  validateStart(mode: string): { valid: boolean; error?: string } {
    if (mode === 'debate') {
      if (!this.ai.isClaudeReady() || !this.ai.isCodexReady()) {
        return { valid: false, error: 'Debate mode requires both Claude and Codex to be configured.' };
      }
    } else if (mode === 'claude-only') {
      if (!this.ai.isClaudeReady()) {
        return { valid: false, error: 'Claude-only mode requires Claude to be configured.' };
      }
    } else if (mode === 'codex-only') {
      if (!this.ai.isCodexReady()) {
        return { valid: false, error: 'Codex-only mode requires Codex (OpenAI) to be configured.' };
      }
    }
    return { valid: true };
  }

  /**
   * Compute which modes are enabled given current provider state
   */
  getEnabledModes(): ModeStatus[] {
    const claudeReady = this.ai.isClaudeReady();
    const codexReady = this.ai.isCodexReady();

    return [
      {
        mode: 'debate',
        enabled: claudeReady && codexReady,
        blockers: [
          ...(!claudeReady ? ['Claude not configured'] : []),
          ...(!codexReady ? ['Codex not configured'] : []),
        ],
      },
      {
        mode: 'claude-only',
        enabled: claudeReady,
        blockers: !claudeReady ? ['Claude not configured'] : [],
      },
      {
        mode: 'codex-only',
        enabled: codexReady,
        blockers: !codexReady ? ['Codex not configured'] : [],
      },
    ];
  }

  /**
   * 토론 시작
   */
  async startDebate(prompt: string, projectPath: string, projectContext?: string, mode?: string): Promise<string> {
    const resolvedMode = (mode as any) || this.ai.getSettings().debate.preferredMode;
    const settings = this.ai.getSettings();

    // Create persistent session
    const debateId = this.sessionStore.create({
      prompt,
      projectPath,
      mode: resolvedMode,
    });

    const session: DebateSession = {
      id: debateId,
      prompt,
      projectPath,
      projectContext: projectContext || '',
      mode: resolvedMode,
      status: 'thinking',
      messages: [],
      rounds: [],
      currentRound: 0,
      maxRounds: settings.debate.maxRounds,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.sessions.set(debateId, session);

    // 유저 메시지 기록
    const userMsg: DebateMessage = {
      id: uuidv4(),
      role: 'user',
      content: prompt,
      timestamp: Date.now(),
    };
    session.messages.push(userMsg);
    this.emit(userMsg);

    session.projectContext = projectContext || '';

    // 토론 루프 시작
    this.runDebateLoop(debateId).catch((err) => {
      console.error('Debate error:', err);
      this.setStatus(debateId, 'error');
      this.emit({
        id: uuidv4(),
        role: 'system',
        content: `Error: ${err.message}`,
        timestamp: Date.now(),
      });
    });

    return debateId;
  }

  /**
   * 토론 루프 — 모드에 따라 분기
   */
  private async runDebateLoop(debateId: string) {
    const session = this.sessions.get(debateId);
    if (!session) return;

    if (session.mode === 'claude-only') {
      await this.runSoloLoop(debateId, 'claude');
      return;
    }

    if (session.mode === 'codex-only') {
      await this.runSoloLoop(debateId, 'codex');
      return;
    }

    // 기본 debate 모드
    for (let round = 1; round <= session.maxRounds; round++) {
      session.currentRound = round;
      this.setStatus(debateId, 'debating');

      // === Claude 차례 ===
      this.emit({
        id: uuidv4(),
        role: 'system',
        content: `🔄 Round ${round}/${session.maxRounds}`,
        timestamp: Date.now(),
        round,
      });

      const claudePrompt = this.buildClaudePrompt(session, round);
      let claudeResponse = '';

      const claudeMsg: DebateMessage = {
        id: uuidv4(),
        role: 'claude',
        content: '',
        timestamp: Date.now(),
        round,
      };
      this.emit(claudeMsg);

      claudeResponse = await this.ai.askClaude(
        CLAUDE_SYSTEM,
        [{ role: 'user', content: claudePrompt }],
        (chunk) => {
          claudeMsg.content += chunk;
          this.emit({ ...claudeMsg, content: claudeMsg.content });
        },
      );

      claudeMsg.content = claudeResponse;
      session.messages.push(claudeMsg);

      // === Codex 차례 ===
      const codexPrompt = this.buildCodexPrompt(session, claudeResponse, round);
      let codexResponse = '';

      const codexMsg: DebateMessage = {
        id: uuidv4(),
        role: 'codex',
        content: '',
        timestamp: Date.now(),
        round,
      };
      this.emit(codexMsg);

      codexResponse = await this.ai.askCodex(
        CODEX_SYSTEM,
        [{ role: 'user', content: codexPrompt }],
        (chunk) => {
          codexMsg.content += chunk;
          this.emit({ ...codexMsg, content: codexMsg.content });
        },
      );

      codexMsg.content = codexResponse;
      session.messages.push(codexMsg);

      // === 합의 판단 ===
      const claudeAgreement = this.parseAgreement(claudeResponse);
      const codexAgreement = this.parseAgreement(codexResponse);

      const roundAgreement: Agreement =
        claudeAgreement === 'agree' && codexAgreement === 'agree'
          ? 'agree'
          : claudeAgreement === 'disagree' || codexAgreement === 'disagree'
            ? 'disagree'
            : 'partial';

      const debateRound: DebateRound = {
        round,
        claudeResponse,
        codexResponse,
        agreement: roundAgreement,
      };
      session.rounds.push(debateRound);

      // 합의 도달
      if (roundAgreement === 'agree') {
        this.setStatus(debateId, 'consensus');
        this.emit({
          id: uuidv4(),
          role: 'system',
          content: `✅ 합의 도달! (Round ${round}) — 코드 생성을 시작합니다.`,
          timestamp: Date.now(),
          agreement: 'agree',
        });
        await this.generateCode(debateId);
        return;
      }

      // 부분 합의 — 계속 토론
      if (roundAgreement === 'partial') {
        this.emit({
          id: uuidv4(),
          role: 'system',
          content: `⚡ 부분 합의 (Round ${round}) — 토론을 계속합니다.`,
          timestamp: Date.now(),
          agreement: 'partial',
        });
      }
    }

    // 최대 라운드 도달 — Claude 우선
    this.setStatus(debateId, 'consensus');
    this.emit({
      id: uuidv4(),
      role: 'system',
      content: `⏰ 최대 라운드 도달 — Claude의 최종 제안으로 진행합니다.`,
      timestamp: Date.now(),
    });
    await this.generateCode(debateId);
  }

  /**
   * 솔로 모드 — 단일 AI만 사용하여 바로 코드 생성
   */
  private async runSoloLoop(debateId: string, agent: 'claude' | 'codex') {
    const session = this.sessions.get(debateId);
    if (!session) return;

    session.currentRound = 1;
    this.setStatus(debateId, 'debating');

    const agentLabel = agent === 'claude' ? '🟣 Claude' : '🟢 Codex';
    this.emit({
      id: uuidv4(),
      role: 'system',
      content: `${agentLabel} 단독 모드로 진행합니다.`,
      timestamp: Date.now(),
    });

    const ctx = session.projectContext || '';
    const soloPrompt = `User request: "${session.prompt}"

Project path: ${session.projectPath}

${ctx ? `## Project Context\n${ctx}\n\n` : ''}Please implement this directly. Provide the complete implementation with code. For each file, use this format:
--- FILE: path/to/file.ts ---
\`\`\`typescript
// code here
\`\`\``;

    const role = agent === 'claude' ? 'claude' as const : 'codex' as const;
    const systemPrompt = agent === 'claude' ? CLAUDE_SYSTEM : CODEX_SOLO_SYSTEM;

    const msg: DebateMessage = {
      id: uuidv4(),
      role,
      content: '',
      timestamp: Date.now(),
      round: 1,
    };
    this.emit(msg);

    let response = '';
    if (agent === 'claude') {
      response = await this.ai.askClaude(
        systemPrompt,
        [{ role: 'user', content: soloPrompt }],
        (chunk) => {
          msg.content += chunk;
          this.emit({ ...msg, content: msg.content });
        },
      );
    } else {
      response = await this.ai.askCodex(
        systemPrompt,
        [{ role: 'user', content: soloPrompt }],
        (chunk) => {
          msg.content += chunk;
          this.emit({ ...msg, content: msg.content });
        },
      );
    }

    msg.content = response;
    session.messages.push(msg);
    session.artifactMessageId = msg.id;

    // 솔로 모드에서는 바로 코드 생성 완료
    this.setStatus(debateId, 'done');
    this.emit({
      id: uuidv4(),
      role: 'system',
      content: `🎉 ${agentLabel} 코드 생성 완료! 리뷰 후 적용하세요.`,
      timestamp: Date.now(),
    });
  }

  /**
   * Claude 프롬프트 생성
   */
  private buildClaudePrompt(session: DebateSession, round: number): string {
    const ctx = session.projectContext || '';
    if (round === 1) {
      return `User request: "${session.prompt}"

Project path: ${session.projectPath}

${ctx ? `## Project Context\n${ctx}\n\n` : ''}Please propose an implementation plan with code. This will be reviewed by another AI (Codex) for feedback. Consider the existing project structure and code style.`;
    }

    const lastRound = session.rounds[session.rounds.length - 1];
    return `User request: "${session.prompt}"

Previous round - Codex's feedback:
${lastRound.codexResponse}

Please address Codex's feedback and refine your implementation. If you agree with the suggestions, incorporate them. If you disagree, explain why.`;
  }

  /**
   * Codex 프롬프트 생성
   */
  private buildCodexPrompt(session: DebateSession, claudeResponse: string, round: number): string {
    return `User request: "${session.prompt}"

Claude's proposal (Round ${round}):
${claudeResponse}

Please review this proposal. Consider:
1. Architecture decisions
2. Edge cases
3. Performance implications
4. Code quality and maintainability

Provide your feedback. Agree if the approach is solid, or suggest specific improvements.`;
  }

  /**
   * [AGREEMENT: xxx] 파싱
   */
  private parseAgreement(response: string): Agreement {
    const match = response.match(/\[AGREEMENT:\s*(agree|partial|disagree)\]/i);
    if (match) {
      return match[1].toLowerCase() as Agreement;
    }
    // 키워드 기반 fallback
    const lower = response.toLowerCase();
    if (lower.includes('i agree') || lower.includes('looks good') || lower.includes('solid approach')) {
      return 'agree';
    }
    if (lower.includes('disagree') || lower.includes('instead') || lower.includes('better approach')) {
      return 'disagree';
    }
    return 'partial';
  }

  /**
   * 합의된 코드 생성
   */
  private async generateCode(debateId: string) {
    const session = this.sessions.get(debateId);
    if (!session) return;

    this.setStatus(debateId, 'coding');

    const lastClaudeMsg = [...session.messages].reverse().find((m) => m.role === 'claude');
    const lastCodexMsg = [...session.messages].reverse().find((m) => m.role === 'codex');

    const codeGenPrompt = `Based on the debate consensus, generate the final implementation code.

User request: "${session.prompt}"

Final agreed approach (Claude):
${lastClaudeMsg?.content || ''}

Reviewer feedback (Codex):
${lastCodexMsg?.content || ''}

Generate the complete implementation. For each file, use this format:
--- FILE: path/to/file.ts ---
\`\`\`typescript
// code here
\`\`\`

Only output the final code files, no explanations needed.`;

    let codeResponse = '';
    const codeMsg: DebateMessage = {
      id: uuidv4(),
      role: 'claude',
      content: '',
      timestamp: Date.now(),
    };
    this.emit(codeMsg);

    codeResponse = await this.ai.askClaude(
      'You are a code generator. Output only clean, production-ready code files.',
      [{ role: 'user', content: codeGenPrompt }],
      (chunk) => {
        codeMsg.content += chunk;
        this.emit({ ...codeMsg, content: codeMsg.content });
      },
    );

    codeMsg.content = codeResponse;
    session.messages.push(codeMsg);
    session.artifactMessageId = codeMsg.id;

    this.setStatus(debateId, 'done');
    this.emit({
      id: uuidv4(),
      role: 'system',
      content: '🎉 코드 생성 완료! 리뷰 후 적용하세요.',
      timestamp: Date.now(),
    });
  }

  /**
   * 사용자 개입
   */
  userIntervene(decision: 'accept-claude' | 'accept-codex' | 'continue' | 'custom') {
    // TODO: Guided 모드에서 사용자가 방향 결정
    return { success: true };
  }

  /**
   * 합의된 코드를 파싱해서 파일에 적용
   */
  async applyConsensus(debateId: string): Promise<{ success: boolean; files: string[]; errors: string[] }> {
    const session = this.sessions.get(debateId);
    if (!session) return { success: false, files: [], errors: ['Session not found'] };

    // Find the artifact message — either tracked by ID or fallback to last code-bearing message
    let artifactMsg: DebateMessage | undefined;
    if (session.artifactMessageId) {
      artifactMsg = session.messages.find((m) => m.id === session.artifactMessageId);
    }
    if (!artifactMsg) {
      // Fallback: find the last message (any role) with code blocks
      artifactMsg = [...session.messages]
        .reverse()
        .find((m) => (m.role === 'claude' || m.role === 'codex') && m.content.includes('```'));
    }

    if (!artifactMsg) {
      return { success: false, files: [], errors: ['No code found in debate'] };
    }

    const codeFiles = this.parseCodeFiles(artifactMsg.content, session.projectPath);
    const fs = await import('fs/promises');
    const path = await import('path');
    const appliedFiles: string[] = [];
    const errors: string[] = [];

    for (const file of codeFiles) {
      try {
        const fullPath = path.default.isAbsolute(file.path)
          ? file.path
          : path.default.join(session.projectPath, file.path);
        const dir = path.default.dirname(fullPath);
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(fullPath, file.content, 'utf-8');
        appliedFiles.push(file.path);
      } catch (err: any) {
        errors.push(`${file.path}: ${err.message}`);
      }
    }

    if (appliedFiles.length > 0) {
      this.emit({
        id: uuidv4(),
        role: 'system',
        content: `💾 파일 적용 완료:\n${appliedFiles.map(f => `  ✓ ${f}`).join('\n')}${errors.length > 0 ? `\n\n⚠️ 오류:\n${errors.join('\n')}` : ''}`,
        timestamp: Date.now(),
      });
    }

    return { success: errors.length === 0, files: appliedFiles, errors };
  }

  /**
   * AI 응답에서 파일별 코드 추출
   * 지원 포맷:
   *   --- FILE: path/to/file.ts ---
   *   ```typescript
   *   // code
   *   ```
   */
  private parseCodeFiles(content: string, projectPath: string): { path: string; content: string }[] {
    const files: { path: string; content: string }[] = [];

    // 패턴 1: --- FILE: path --- + 코드 블록
    const filePattern = /---\s*FILE:\s*(.+?)\s*---\s*\n```\w*\n([\s\S]*?)```/g;
    let match;
    while ((match = filePattern.exec(content)) !== null) {
      files.push({ path: match[1].trim(), content: match[2].trim() });
    }

    // 패턴 2: `path/to/file.ts` 헤더 + 코드 블록 (fallback)
    if (files.length === 0) {
      const altPattern = /`([\w/.-]+\.[\w]+)`[:\s]*\n```\w*\n([\s\S]*?)```/g;
      while ((match = altPattern.exec(content)) !== null) {
        files.push({ path: match[1].trim(), content: match[2].trim() });
      }
    }

    return files;
  }
}
