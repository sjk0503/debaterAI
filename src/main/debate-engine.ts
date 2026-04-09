import { v4 as uuidv4 } from 'uuid';
import { AIService } from './ai-service';
import { GitService } from './git-service';
import { SessionStore } from './session-store';
import { CheckpointService } from './checkpoint-service';
import { buildSystemPrompt } from './system-prompt-builder';
import { TransportMessage } from './transport-adapter';
import { AgentRuntime } from './agent-runtime';
import { AgentEvent } from '../shared/agent-events';
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

export class DebateEngine {
  private sessions: Map<string, DebateSession> = new Map();
  private messageCallback?: (msg: DebateMessage) => void;
  private statusCallback?: (status: { debateId: string; status: DebateStatus; [key: string]: any }) => void;
  private sessionStore: SessionStore;
  private checkpointService: CheckpointService;
  private agentRuntime?: AgentRuntime;
  private agentEventCallback?: (event: AgentEvent) => void;
  private gitService?: GitService;

  constructor(private ai: AIService, sessionStore?: SessionStore, agentRuntime?: AgentRuntime, gitService?: GitService) {
    this.sessionStore = sessionStore || new SessionStore();
    this.checkpointService = new CheckpointService();
    this.agentRuntime = agentRuntime;
    this.gitService = gitService;
  }

  onMessage(cb: (msg: DebateMessage) => void) {
    this.messageCallback = cb;
  }

  onStatusChange(cb: (status: { debateId: string; status: DebateStatus; [key: string]: any }) => void) {
    this.statusCallback = cb;
  }

  onAgentEvent(cb: (event: AgentEvent) => void) {
    this.agentEventCallback = cb;
  }

  private emit(msg: DebateMessage, sessionId: string) {
    this.messageCallback?.(msg);
    // Persist to session store
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
    // Agent streaming messages (claude/codex) are emitted frequently during streaming;
    // we persist the final version only (not every chunk)
  }

  private setStatus(debateId: string, status: DebateStatus, extra?: Record<string, any>) {
    const session = this.sessions.get(debateId);
    if (session) session.status = status;
    this.statusCallback?.({ debateId, status, ...extra });
    this.sessionStore.append(debateId, {
      type: 'status_change',
      timestamp: Date.now(),
      data: { kind: 'status_change', status },
    });
  }

  /** Persist a completed agent message (called once after streaming finishes) */
  private persistAgentMessage(sessionId: string, msg: DebateMessage) {
    this.sessionStore.append(sessionId, {
      type: 'debate_message' as any,
      timestamp: msg.timestamp,
      data: {
        kind: 'debate_message',
        role: msg.role as 'claude' | 'codex',
        content: msg.content,
        round: msg.round,
        agreement: msg.agreement,
      } as any,
    });
  }

  /** Get the session store for IPC access */
  getSessionStore(): SessionStore {
    return this.sessionStore;
  }

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
  async startDebate(prompt: string, projectPath: string, projectContext?: string, mode?: string, existingSessionId?: string): Promise<string> {
    const resolvedMode = (mode as any) || this.ai.getSettings().debate.preferredMode;
    const settings = this.ai.getSettings();

    // Use existing session ID if provided (continuation), otherwise create a new one
    const debateId = (existingSessionId && existingSessionId.length > 0)
      ? existingSessionId
      : this.sessionStore.create({ prompt, projectPath, mode: resolvedMode });

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
      // Generate fresh debate-mode Claude session UUID (new conversation per debate)
      // Codex session UUID is captured later from session_meta event on first exec
      claudeDebateSessionId: uuidv4(),
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
    this.emit(userMsg, debateId);

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
      }, debateId);
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
      if (this.agentRuntime) {
        await this.runAgentSoloLoop(debateId, 'claude');
      } else {
        await this.runSoloLoop(debateId, 'claude');
      }
      return;
    }

    if (session.mode === 'codex-only') {
      if (this.agentRuntime) {
        await this.runAgentSoloLoop(debateId, 'codex');
      } else {
        await this.runSoloLoop(debateId, 'codex');
      }
      return;
    }

    // 기본 debate 모드
    for (let round = 1; round <= session.maxRounds; round++) {
      session.currentRound = round;
      this.setStatus(debateId, 'debating');

      // Fix 15: Check for pending user guidance at the start of each round
      let userGuidance: string | undefined;
      if (session.pendingUserInput) {
        userGuidance = session.pendingUserInput;
        session.pendingUserInput = undefined;
      }

      // Fix 16: Get previous round's agreement for prompt differentiation
      const prevRound = session.rounds.length > 0
        ? session.rounds[session.rounds.length - 1]
        : undefined;
      const previousAgreement = prevRound?.agreement as 'agree' | 'partial' | 'disagree' | undefined;

      // === Claude 차례 ===
      this.emit({
        id: uuidv4(),
        role: 'system',
        content: `🔄 Round ${round}/${session.maxRounds}`,
        timestamp: Date.now(),
        round,
      }, debateId);

      const claudePrompt = this.buildClaudePrompt(session, round);

      const claudeMsg: DebateMessage = {
        id: uuidv4(),
        role: 'claude',
        content: '',
        timestamp: Date.now(),
        round,
      };
      this.emit(claudeMsg, debateId);

      const claudeSystemPrompt = buildSystemPrompt({
        agent: 'claude',
        mode: session.mode,
        round,
        maxRounds: session.maxRounds,
        projectPath: session.projectPath,
        projectContext: session.projectContext,
        previousRounds: session.rounds.map((r) => ({
          claudeResponse: r.claudeResponse,
          codexResponse: r.codexResponse,
          agreement: r.agreement,
        })),
        language: this.ai.getSettings().general?.language || 'ko',
        previousAgreement,
        userGuidance,
      });

      let claudeResponse: string;
      const isFirstClaudeRound = round === 1;
      try {
        claudeResponse = await this.ai.askClaudeDebate(
          session.claudeDebateSessionId!,
          !isFirstClaudeRound, // first round creates session, subsequent rounds resume
          claudeSystemPrompt,
          [{ role: 'user', content: claudePrompt }],
          (chunk) => {
            claudeMsg.content += chunk;
            this.emit({ ...claudeMsg, content: claudeMsg.content }, debateId);
          },
        );
      } catch (err: any) {
        this.emit({ id: uuidv4(), role: 'system', content: `⚠️ Claude 응답 실패 (${err.message}). 재시도 중...`, timestamp: Date.now() }, debateId);

        const retryResult = await this.retryWithBackoff('claude', claudeSystemPrompt, [{ role: 'user', content: claudePrompt }], (chunk) => {
          claudeMsg.content += chunk;
          this.emit({ ...claudeMsg, content: claudeMsg.content }, debateId);
        });
        if (retryResult) {
          claudeResponse = retryResult;
        } else {
          this.emit({ id: uuidv4(), role: 'system', content: '❌ Claude 응답 실패. Codex 단독으로 진행합니다.', timestamp: Date.now() }, debateId);
          claudeResponse = '(Claude 응답 실패)\n[AGREEMENT: partial]';
        }
      }

      // Validate substantiveness — retry once if insufficient
      if (!this.isSubstantiveResponse(claudeResponse)) {
        this.emit({ id: uuidv4(), role: 'system', content: `🟣 Claude 응답이 불충분하여 재요청합니다.`, timestamp: Date.now() }, debateId);
        claudeResponse = await this.retryForSubstantiveResponse('claude', claudeSystemPrompt, [{ role: 'user', content: claudePrompt }], claudeResponse, claudeMsg, debateId);
      }

      // Post-retry validation — ensure response is actually substantive
      if (!this.isSubstantiveResponse(claudeResponse)) {
        claudeResponse = '(응답 생성 실패 — 부분 동의로 처리)\n[AGREEMENT: partial]';
      }

      claudeMsg.content = this.stripAgreementMarker(claudeResponse);
      this.emit({ ...claudeMsg }, debateId);
      session.messages.push(claudeMsg);
      this.persistAgentMessage(debateId, claudeMsg);

      // === Codex 차례 ===
      const codexPrompt = this.buildCodexPrompt(session, claudeResponse, round);

      const codexMsg: DebateMessage = {
        id: uuidv4(),
        role: 'codex',
        content: '',
        timestamp: Date.now(),
        round,
      };
      this.emit(codexMsg, debateId);

      const codexSystemPrompt = buildSystemPrompt({
        agent: 'codex',
        mode: session.mode,
        round,
        maxRounds: session.maxRounds,
        projectPath: session.projectPath,
        projectContext: session.projectContext,
        previousRounds: session.rounds.map((r) => ({
          claudeResponse: r.claudeResponse,
          codexResponse: r.codexResponse,
          agreement: r.agreement,
        })),
        language: this.ai.getSettings().general?.language || 'ko',
        previousAgreement,
        userGuidance,
      });

      let codexResponse: string = '';
      const isFirstCodexTurn = !session.codexDebateSessionId;
      const codexStreamHandler = (chunk: string) => {
        codexMsg.content += chunk;
        this.emit({ ...codexMsg, content: codexMsg.content }, debateId);
      };
      const codexSessionCapture = (uuid: string) => {
        // rollout file was detected — store as resumable session id
        session.codexDebateSessionId = uuid;
      };

      let codexError: any = null;
      try {
        codexResponse = await this.ai.askCodexDebate(
          session.codexDebateSessionId,
          !isFirstCodexTurn,
          codexSystemPrompt,
          [{ role: 'user', content: codexPrompt }],
          codexStreamHandler,
          codexSessionCapture,
        );
      } catch (err: any) {
        codexError = err;
      }

      // Handle resume failure: reset session and retry as fresh exec
      if (codexError) {
        const errMsg = String(codexError?.message || codexError);
        const isResumeFailure = !isFirstCodexTurn && /no rollout found|not found|cannot find/i.test(errMsg);

        if (isResumeFailure) {
          this.emit({ id: uuidv4(), role: 'system', content: `⚠️ Codex 세션 resume 실패. 새 세션으로 재시작합니다.`, timestamp: Date.now() }, debateId);
          session.codexDebateSessionId = undefined;
          codexMsg.content = '';
          this.emit({ ...codexMsg }, debateId);
          try {
            codexResponse = await this.ai.askCodexDebate(
              undefined,
              false,
              codexSystemPrompt,
              [{ role: 'user', content: codexPrompt }],
              codexStreamHandler,
              codexSessionCapture,
            );
            codexError = null;
          } catch (fallbackErr: any) {
            codexError = fallbackErr;
          }
        }
      }

      // Handle remaining errors via backoff retry
      if (codexError) {
        const err: any = codexError;
        this.emit({ id: uuidv4(), role: 'system', content: `⚠️ Codex 응답 실패 (${err.message}). 재시도 중...`, timestamp: Date.now() }, debateId);

        const retryResult = await this.retryWithBackoff('codex', codexSystemPrompt, [{ role: 'user', content: codexPrompt }], (chunk) => {
          codexMsg.content += chunk;
          this.emit({ ...codexMsg, content: codexMsg.content }, debateId);
        });
        if (retryResult) {
          codexResponse = retryResult;
        } else {
          this.emit({ id: uuidv4(), role: 'system', content: '❌ Codex 응답 실패. Claude 단독으로 진행합니다.', timestamp: Date.now() }, debateId);
          codexResponse = '(Codex 응답 실패)\n[AGREEMENT: agree]';
        }
      }

      // Validate substantiveness — retry once if insufficient
      if (!this.isSubstantiveResponse(codexResponse)) {
        this.emit({ id: uuidv4(), role: 'system', content: `🟢 Codex 응답이 불충분하여 재요청합니다.`, timestamp: Date.now() }, debateId);
        codexResponse = await this.retryForSubstantiveResponse('codex', codexSystemPrompt, [{ role: 'user', content: codexPrompt }], codexResponse, codexMsg, debateId);
      }

      // Post-retry validation — ensure response is actually substantive
      if (!this.isSubstantiveResponse(codexResponse)) {
        codexResponse = '(응답 생성 실패 — 부분 동의로 처리)\n[AGREEMENT: partial]';
      }

      codexMsg.content = this.stripAgreementMarker(codexResponse);
      this.emit({ ...codexMsg }, debateId);
      session.messages.push(codexMsg);
      this.persistAgentMessage(debateId, codexMsg);

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
        claudeResponse: this.stripAgreementMarker(claudeResponse),
        codexResponse: this.stripAgreementMarker(codexResponse),
        agreement: roundAgreement,
      };
      session.rounds.push(debateRound);

      // 합의 도달
      if (roundAgreement === 'agree') {
        this.setStatus(debateId, 'consensus');
        this.emit({
          id: uuidv4(),
          role: 'system',
          content: `✅ 합의 도달! (Round ${round}) — Claude: ${claudeAgreement} · Codex: ${codexAgreement}`,
          timestamp: Date.now(),
          agreement: 'agree',
        }, debateId);

        // Extract plan summary from the last Claude message
        const plan = this.extractConsensusPlan(session);
        session.consensusPlan = plan;

        const consensusSettings = this.ai.getSettings();
        if (consensusSettings.debate.autoApply) {
          // autoApply ON — skip confirmation, proceed immediately
          session.status = 'awaiting_confirmation';
          this.confirmConsensus(debateId, !!consensusSettings.debate.alwaysUseWorktree);
        } else {
          // autoApply OFF — pause and wait for user confirmation
          session.status = 'awaiting_confirmation';
          this.setStatus(debateId, 'awaiting_confirmation', { plan });
        }
        return;
      }

      // 부분 합의 — 계속 토론
      if (roundAgreement === 'partial') {
        this.emit({
          id: uuidv4(),
          role: 'system',
          content: `⚡ 부분 합의 (Round ${round}) — Claude: ${claudeAgreement} · Codex: ${codexAgreement} — 토론을 계속합니다.`,
          timestamp: Date.now(),
          agreement: 'partial',
        }, debateId);
      }

      // 반대 — 계속 토론 (disagree 표시)
      if (roundAgreement === 'disagree') {
        this.emit({
          id: uuidv4(),
          role: 'system',
          content: `⚠️ 반대 의견 (Round ${round}) — Claude: ${claudeAgreement} · Codex: ${codexAgreement} — 토론을 계속합니다.`,
          timestamp: Date.now(),
          agreement: 'disagree',
        }, debateId);
      }
    }

    // 최대 라운드 도달 — tiebreak 또는 Claude 우선
    const maxRoundSettings = this.ai.getSettings();

    if (maxRoundSettings.debate.autoApply) {
      // autoApply ON — backward compat: Claude wins
      this.setStatus(debateId, 'consensus');
      this.emit({
        id: uuidv4(),
        role: 'system',
        content: `⏰ 최대 라운드 도달 — Claude의 최종 제안으로 진행합니다.`,
        timestamp: Date.now(),
      }, debateId);

      const plan = this.extractConsensusPlan(session);
      session.consensusPlan = plan;
      session.status = 'awaiting_confirmation';
      this.confirmConsensus(debateId, !!maxRoundSettings.debate.alwaysUseWorktree);
    } else {
      // autoApply OFF — let user pick the winner
      const lastClaude = [...session.messages].reverse().find(m => m.role === 'claude');
      const lastCodex = [...session.messages].reverse().find(m => m.role === 'codex');

      this.emit({
        id: uuidv4(),
        role: 'system',
        content: `⏰ 최대 라운드 도달 — 합의에 실패했습니다. 어느 쪽 의견을 채택할지 선택해주세요.`,
        timestamp: Date.now(),
      }, debateId);

      this.setStatus(debateId, 'awaiting_tiebreak', {
        debateId,
        claudeProposal: lastClaude?.content?.slice(0, 2000) || '',
        codexProposal: lastCodex?.content?.slice(0, 2000) || '',
      });
      return; // Wait for user decision
    }
  }

  /**
   * 솔로 모드 — 단일 AI만 사용하여 바로 코드 생성 (fallback: no agentRuntime)
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
    }, debateId);

    const ctx = session.projectContext || '';
    const soloPrompt = `User request: "${session.prompt}"

Project path: ${session.projectPath}

${ctx ? `## Project Context\n${ctx}\n\n` : ''}Please implement this directly. Provide the complete implementation with code. For each file, use this format:
--- FILE: path/to/file.ts ---
\`\`\`typescript
// code here
\`\`\``;

    const role = agent === 'claude' ? 'claude' as const : 'codex' as const;
    const systemPrompt = buildSystemPrompt({
      agent,
      mode: session.mode,
      round: 1,
      maxRounds: 1,
      projectPath: session.projectPath,
      projectContext: session.projectContext,
      previousRounds: [],
      language: this.ai.getSettings().general?.language || 'ko',
    });

    const msg: DebateMessage = {
      id: uuidv4(),
      role,
      content: '',
      timestamp: Date.now(),
      round: 1,
    };
    this.emit(msg, debateId);

    let response = '';
    if (agent === 'claude') {
      response = await this.ai.askClaude(
        systemPrompt,
        [{ role: 'user', content: soloPrompt }],
        (chunk) => {
          msg.content += chunk;
          this.emit({ ...msg, content: msg.content }, debateId);
        },
      );
    } else {
      response = await this.ai.askCodex(
        systemPrompt,
        [{ role: 'user', content: soloPrompt }],
        (chunk) => {
          msg.content += chunk;
          this.emit({ ...msg, content: msg.content }, debateId);
        },
      );
    }

    msg.content = response;
    session.messages.push(msg);
    session.artifactMessageId = msg.id;
    this.persistAgentMessage(debateId, msg);

    this.setStatus(debateId, 'done');
    this.emit({
      id: uuidv4(),
      role: 'system',
      content: `🎉 ${agentLabel} 코드 생성 완료! 리뷰 후 적용하세요.`,
      timestamp: Date.now(),
    }, debateId);
  }

  /**
   * Agent solo mode — uses AgentRuntime CLI for real file edits
   */
  private async runAgentSoloLoop(debateId: string, agent: 'claude' | 'codex') {
    const session = this.sessions.get(debateId);
    if (!session || !this.agentRuntime) return;

    session.currentRound = 1;
    this.setStatus(debateId, 'debating');

    const agentLabel = agent === 'claude' ? '🟣 Claude' : '🟢 Codex';
    this.emit({
      id: uuidv4(),
      role: 'system',
      content: `${agentLabel} Agent 모드로 실행합니다.`,
      timestamp: Date.now(),
    }, debateId);

    const settings = this.ai.getSettings();
    const model = agent === 'claude' ? settings.claude.model : settings.codex.model;
    const effort = agent === 'claude' ? settings.claude.effort : undefined;

    const systemPrompt = buildSystemPrompt({
      agent,
      mode: session.mode,
      round: 1,
      maxRounds: 1,
      projectPath: session.projectPath,
      projectContext: session.projectContext,
      previousRounds: [],
      agentMode: true,
      language: settings.general?.language || 'ko',
    });

    const msg: DebateMessage = {
      id: uuidv4(),
      role: agent === 'claude' ? 'claude' as const : 'codex' as const,
      content: '',
      timestamp: Date.now(),
      round: 1,
      agentEvents: [],
      filesChanged: [],
      toolsUsed: [],
    };
    this.emit(msg, debateId);

    try {
      const { agentId, done } = this.agentRuntime.spawn({
        prompt: session.prompt,
        cwd: session.projectPath,
        model,
        provider: agent,
        systemPrompt,
        effort,
        onEvent: (event: any) => {
          if (event.data?.kind === 'text_delta') {
            msg.content += event.data.text || '';
          } else if (event.data?.kind === 'text_done') {
            msg.content = event.data.fullText || msg.content;
          }
          msg.agentEvents!.push(event);
          this.emit({ ...msg }, debateId);
          this.agentEventCallback?.(event);
        },
      });

      const result = await done;

      if (result.status === 'cancelled') {
        this.setStatus(debateId, 'idle');
        this.emit({
          id: uuidv4(),
          role: 'system',
          content: '토론이 중단되었습니다.',
          timestamp: Date.now(),
        }, debateId);
        return;
      }

      if (result.status === 'error') {
        this.setStatus(debateId, 'error');
        this.emit({
          id: uuidv4(),
          role: 'system',
          content: `Agent error (exit code ${result.exitCode})`,
          timestamp: Date.now(),
        }, debateId);
        return;
      }

      msg.filesChanged = result.filesChanged;
      msg.toolsUsed = result.toolsUsed;
      msg.content = result.fullText || msg.content;
      session.messages.push(msg);
      session.artifactMessageId = msg.id;

      // Persist agent events to session
      for (const event of msg.agentEvents!) {
        this.sessionStore.append(debateId, {
          type: 'agent_event',
          timestamp: event.timestamp || Date.now(),
          data: { kind: 'agent_event', event } as any,
        });
      }

      this.setStatus(debateId, 'done');
      const fileCount = result.filesChanged?.length || 0;
      this.emit({
        id: uuidv4(),
        role: 'system',
        content: `🎉 ${agentLabel} 작업 완료! ${fileCount > 0 ? `${fileCount}개 파일 수정됨.` : ''}`,
        timestamp: Date.now(),
      }, debateId);

      const commitSettings = this.ai.getSettings();
      if (commitSettings.git?.autoCommit && fileCount > 0 && this.gitService) {
        try {
          const gitSt = await this.gitService.status(session.projectPath);
          if (gitSt.trim()) {
            await this.gitService.commit(session.projectPath, this.buildCommitMessage(session));
            this.emit({ id: uuidv4(), role: 'system', content: '자동 커밋 완료', timestamp: Date.now() }, debateId);
          }
        } catch {}
      }
    } catch (err: any) {
      this.setStatus(debateId, 'error');
      this.emit({
        id: uuidv4(),
        role: 'system',
        content: `Error: ${err.message}`,
        timestamp: Date.now(),
      }, debateId);
    }
  }

  /**
   * executeConsensus — uses AgentRuntime when available, falls back to generateCode
   */
  private async executeConsensus(debateId: string) {
    const session = this.sessions.get(debateId);
    if (!session) return;

    if (!this.agentRuntime) {
      return this.generateCode(debateId);  // fallback to text mode
    }

    this.setStatus(debateId, 'coding', session.worktreeBranch
      ? { branch: session.worktreeBranch, worktreePath: session.worktreePath }
      : undefined);

    const lastClaudeMsg = [...session.messages].reverse().find(m => m.role === 'claude');
    const lastCodexMsg = [...session.messages].reverse().find(m => m.role === 'codex');

    const consensusPrompt = `Implement the following based on the debate consensus.

User request: "${session.prompt}"

Agreed approach (Claude's final proposal):
${(lastClaudeMsg?.content || '').slice(0, 4000)}

Reviewer feedback (Codex):
${(lastCodexMsg?.content || '').slice(0, 3000)}

Implement this directly in the project. Read relevant files, make the changes, and verify your work.`;

    const settings = this.ai.getSettings();

    const msg: DebateMessage = {
      id: uuidv4(),
      role: 'claude',
      content: '',
      timestamp: Date.now(),
      agentEvents: [],
      filesChanged: [],
      toolsUsed: [],
    };
    this.emit(msg, debateId);

    try {
      const { agentId: consensusAgentId, done } = this.agentRuntime.spawn({
        prompt: consensusPrompt,
        cwd: session.executionCwd || session.projectPath,
        model: settings.claude.model,
        provider: 'claude',
        effort: settings.claude.effort,
        onEvent: (event: any) => {
          if (event.data?.kind === 'text_delta') {
            msg.content += event.data.text || '';
          } else if (event.data?.kind === 'text_done') {
            msg.content = event.data.fullText || msg.content;
          }
          msg.agentEvents!.push(event);
          this.emit({ ...msg }, debateId);
          this.agentEventCallback?.(event);
        },
      });

      const result = await done;

      if (result.status === 'cancelled') {
        this.setStatus(debateId, 'idle');
        this.emit({
          id: uuidv4(),
          role: 'system',
          content: '토론이 중단되었습니다.',
          timestamp: Date.now(),
        }, debateId);
        return;
      }

      if (result.status === 'error') {
        this.setStatus(debateId, 'error');
        this.emit({
          id: uuidv4(),
          role: 'system',
          content: `Agent error (exit code ${result.exitCode})`,
          timestamp: Date.now(),
        }, debateId);
        return;
      }

      msg.filesChanged = result.filesChanged;
      msg.toolsUsed = result.toolsUsed;
      msg.content = result.fullText || msg.content;
      session.messages.push(msg);
      session.artifactMessageId = msg.id;

      for (const event of msg.agentEvents!) {
        this.sessionStore.append(debateId, {
          type: 'agent_event',
          timestamp: event.timestamp || Date.now(),
          data: { kind: 'agent_event', event } as any,
        });
      }

      const fileCount = result.filesChanged?.length || 0;

      // If a worktree was used, transition to worktree_review instead of done
      if (session.worktreePath && session.worktreeBranch && this.gitService) {
        try {
          // Commit any uncommitted changes in the worktree
          const wtStatus = await this.gitService.status(session.worktreePath);
          if (wtStatus.trim()) {
            await this.gitService.commit(session.worktreePath, this.buildCommitMessage(session));
          }
          const mainBranch = await this.gitService.currentBranch(session.projectPath);
          const diff = await this.gitService.diffBranches(session.projectPath, mainBranch, session.worktreeBranch);
          this.setStatus(debateId, 'worktree_review', {
            worktreePath: session.worktreePath,
            branch: session.worktreeBranch,
            diff,
          });
          this.emit({
            id: uuidv4(),
            role: 'system',
            content: `🎉 코드 구현 완료! ${fileCount > 0 ? `${fileCount}개 파일 수정됨.` : ''} 워크트리에서 변경사항을 확인하세요.`,
            timestamp: Date.now(),
          }, debateId);
        } catch (err: any) {
          // Diff failed — fall through to done
          this.setStatus(debateId, 'done');
          this.emit({
            id: uuidv4(),
            role: 'system',
            content: `🎉 코드 구현 완료! ${fileCount > 0 ? `${fileCount}개 파일 수정됨.` : ''}`,
            timestamp: Date.now(),
          }, debateId);
        }
      } else {
        this.setStatus(debateId, 'done');
        this.emit({
          id: uuidv4(),
          role: 'system',
          content: `🎉 코드 구현 완료! ${fileCount > 0 ? `${fileCount}개 파일 수정됨.` : ''}`,
          timestamp: Date.now(),
        }, debateId);

        const commitSettings = this.ai.getSettings();
        if (commitSettings.git?.autoCommit && fileCount > 0 && this.gitService) {
          try {
            const gitSt = await this.gitService.status(session.projectPath);
            if (gitSt.trim()) {
              await this.gitService.commit(session.projectPath, this.buildCommitMessage(session));
              this.emit({ id: uuidv4(), role: 'system', content: '자동 커밋 완료', timestamp: Date.now() }, debateId);
            }
          } catch {}
        }
      }
    } catch (err: any) {
      this.setStatus(debateId, 'error');
      this.emit({
        id: uuidv4(),
        role: 'system',
        content: `Error: ${err.message}`,
        timestamp: Date.now(),
      }, debateId);
    }
  }

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

  private buildCodexPrompt(session: DebateSession, claudeResponse: string, round: number): string {
    const maxRespLen = 3000;
    const truncate = (s: string) =>
      s.length > maxRespLen ? s.slice(0, maxRespLen) + '\n... (truncated)' : s;

    let historySection = '';
    if (session.rounds.length > 0) {
      const historyParts = session.rounds.map((r) => {
        return `### Round ${r.round} (${r.agreement})
**Claude's proposal:**
${truncate(r.claudeResponse)}

**Your previous review:**
${truncate(r.codexResponse)}`;
      });
      historySection = `\n## Previous Rounds\n${historyParts.join('\n\n')}\n`;
    }

    return `User request: "${session.prompt}"
${historySection}
## Claude's Latest Proposal (Round ${round}):
${truncate(claudeResponse)}

Please review this proposal. Consider:
1. Architecture decisions
2. Edge cases
3. Performance implications
4. Code quality and maintainability

Provide your feedback. Agree if the approach is solid, or suggest specific improvements.`;
  }

  private stripAgreementMarker(text: string): string {
    return text.replace(/\[AGREEMENT:\s*(agree|partial|disagree)\]/gi, '').trim();
  }

  private parseAgreement(response: string): Agreement {
    const match = response.match(/\[AGREEMENT:\s*(agree|partial|disagree)\]/i);
    if (match) {
      return match[1].toLowerCase() as Agreement;
    }
    // No marker found — treat as unknown/partial (don't guess from keywords)
    return 'partial';
  }

  private isSubstantiveResponse(response: string): boolean {
    const hasMarker = /\[AGREEMENT:\s*(agree|partial|disagree)\]/i.test(response);
    const strippedLength = response.replace(/\s+/g, ' ').trim().length;

    // Short response without marker is not substantive
    if (!hasMarker && strippedLength < 200) return false;

    // Planning-only patterns (Korean + English)
    const planningPatterns = [
      /확인하겠습니다/,
      /검증하겠습니다/,
      /보겠습니다$/m,
      /살펴보겠습니다/,
      /I('ll| will) (check|investigate|look into|review|examine|verify)/i,
      /Let me (check|investigate|look into|review|examine)/i,
    ];
    const planningCount = planningPatterns.filter(p => p.test(response)).length;
    // If multiple planning phrases and no marker and short, it's just a plan
    if (!hasMarker && planningCount >= 2 && strippedLength < 500) return false;

    return true;
  }

  private async retryWithBackoff(
    agent: 'claude' | 'codex',
    systemPrompt: string,
    messages: TransportMessage[],
    onStream: (chunk: string) => void,
    maxRetries = 3,
  ): Promise<string | null> {
    const delays = [2000, 5000, 10000];
    // Retries use the base askClaude/askCodex (stateless). Debate session will
    // still have the original failed turn context; this is a safety fallback only.
    const askFn = agent === 'claude'
      ? this.ai.askClaude.bind(this.ai)
      : this.ai.askCodex.bind(this.ai);

    for (let i = 0; i < maxRetries; i++) {
      await new Promise(r => setTimeout(r, delays[i] || 10000));
      try {
        return await askFn(systemPrompt, messages, onStream);
      } catch {}
    }
    return null;
  }

  private async retryForSubstantiveResponse(
    agent: 'claude' | 'codex',
    systemPrompt: string,
    messages: TransportMessage[],
    originalResponse: string,
    msg: DebateMessage,
    debateId: string,
  ): Promise<string> {
    const retryMessage = `Your previous response did not include a clear analysis with conclusions. Please provide your actual analysis and end with exactly one of:
[AGREEMENT: agree] — fully agree
[AGREEMENT: partial] — partially agree with suggestions
[AGREEMENT: disagree] — fundamentally disagree

Give your conclusions NOW, not a plan to investigate later.`;

    msg.content = '';
    this.emit({ ...msg }, debateId);

    // Retry uses the base stateless call to avoid polluting the debate session
    // with retry prompts. The session still remembers the original turn.
    const askFn = agent === 'claude'
      ? this.ai.askClaude.bind(this.ai)
      : this.ai.askCodex.bind(this.ai);

    try {
      const retryResponse = await askFn(
        systemPrompt,
        [...messages, { role: 'assistant' as const, content: originalResponse }, { role: 'user' as const, content: retryMessage }],
        (chunk: string) => {
          msg.content += chunk;
          this.emit({ ...msg }, debateId);
        },
      );

      return retryResponse;
    } catch {
      // Retry failed — return original response rather than crashing
      return originalResponse;
    }
  }

  /**
   * generateCode — text-only fallback used when agentRuntime is not available
   */
  private async generateCode(debateId: string) {
    const session = this.sessions.get(debateId);
    if (!session) return;

    this.setStatus(debateId, 'coding');

    const lastClaudeMsg = [...session.messages].reverse().find((m) => m.role === 'claude');
    const lastCodexMsg = [...session.messages].reverse().find((m) => m.role === 'codex');

    const codeGenPrompt = `Based on the debate consensus, generate the final implementation code.

User request: "${session.prompt}"
Project path: ${session.projectPath}

Final agreed approach (Claude):
${lastClaudeMsg?.content || ''}

Reviewer feedback (Codex):
${lastCodexMsg?.content || ''}

You MUST output the complete implementation code directly in your response.
Do NOT say "let me write" or "I will create" — just output the actual code.
Do NOT use tools or try to write files — output everything as text in your response.

For each file, use EXACTLY this format:

--- FILE: path/to/file.ts ---
\`\`\`typescript
// complete file content here
\`\`\`

Output ALL files needed for the implementation. No explanations, just code files.`;

    const codeMsg: DebateMessage = {
      id: uuidv4(),
      role: 'claude',
      content: '',
      timestamp: Date.now(),
    };
    this.emit(codeMsg, debateId);

    const codeResponse = await this.ai.askClaude(
      `You are a code generator inside debaterAI. You MUST output complete, production-ready code files directly in your response using the --- FILE: path --- format. Do NOT attempt to use tools, write files, or execute commands. Do NOT say "let me write" — just output the code. Every file must be complete and ready to save.`,
      [{ role: 'user', content: codeGenPrompt }],
      (chunk) => {
        codeMsg.content += chunk;
        this.emit({ ...codeMsg, content: codeMsg.content }, debateId);
      },
    );

    codeMsg.content = codeResponse;
    session.messages.push(codeMsg);
    session.artifactMessageId = codeMsg.id;
    this.persistAgentMessage(debateId, codeMsg);

    this.setStatus(debateId, 'done');
    this.emit({
      id: uuidv4(),
      role: 'system',
      content: '🎉 코드 생성 완료! 리뷰 후 적용하세요.',
      timestamp: Date.now(),
    }, debateId);
  }

  /**
   * Extract a consensus plan summary from the last Claude message in the session
   */
  private extractConsensusPlan(session: DebateSession): string {
    const lastClaudeMsg = [...session.messages].reverse().find(m => m.role === 'claude');
    if (lastClaudeMsg) {
      return lastClaudeMsg.content;
    }
    return session.prompt;
  }

  private buildCommitMessage(session: DebateSession): string {
    const settings = this.ai.getSettings();
    const prefix = settings.git?.commitPrefix || 'debaterai:';
    return `${prefix} ${session.prompt.slice(0, 50)}`;
  }

  /**
   * Confirm consensus — user decides whether to use a worktree or run directly
   */
  async confirmConsensus(debateId: string, useWorktree: boolean): Promise<{ success: boolean; error?: string }> {
    const session = this.sessions.get(debateId);
    if (!session) return { success: false, error: 'Session not found' };
    if (session.status !== 'awaiting_confirmation') {
      return { success: false, error: `Invalid status: ${session.status}. Expected awaiting_confirmation.` };
    }

    if (useWorktree) {
      if (!this.gitService) {
        return { success: false, error: 'GitService not available' };
      }
      try {
        const { worktreePath, branchName, baseBranch } = await this.gitService.createWorktree(session.projectPath, session.id);
        session.worktreePath = worktreePath;
        session.worktreeBranch = branchName;
        session.worktreeBaseBranch = baseBranch;
        session.executionCwd = worktreePath;
        this.sessionStore.append(debateId, {
          type: 'worktree_created',
          timestamp: Date.now(),
          data: {
            kind: 'worktree_created',
            worktreePath: session.worktreePath,
            branchName: session.worktreeBranch,
            baseBranch: session.worktreeBaseBranch,
          } as any,
        });
        this.emit({
          id: uuidv4(),
          role: 'system',
          content: `새 워크트리(${branchName})에서 작업을 시작합니다.`,
          timestamp: Date.now(),
        }, debateId);
      } catch (err: any) {
        return { success: false, error: `Failed to create worktree: ${err.message}` };
      }
    } else {
      session.executionCwd = session.projectPath;
      this.emit({
        id: uuidv4(),
        role: 'system',
        content: '작업을 시작합니다.',
        timestamp: Date.now(),
      }, debateId);
    }

    // Resume execution
    this.executeConsensus(debateId).catch((err) => {
      console.error('Consensus execution error:', err);
      this.setStatus(debateId, 'error');
      this.emit({
        id: uuidv4(),
        role: 'system',
        content: `Error: ${err.message}`,
        timestamp: Date.now(),
      }, debateId);
    });

    return { success: true };
  }

  /**
   * Merge worktree changes back into the main branch
   */
  async mergeWorktree(debateId: string): Promise<{ success: boolean; error?: string }> {
    const session = this.sessions.get(debateId);
    if (!session) return { success: false, error: 'Session not found' };
    if (!session.worktreePath || !session.worktreeBranch) {
      return { success: false, error: 'No worktree associated with this session' };
    }
    if (!this.gitService) {
      return { success: false, error: 'GitService not available' };
    }

    try {
      const commitMsg = this.buildCommitMessage(session);
      const result = await this.gitService.completeDebate(
        session.projectPath,
        session.worktreePath,
        session.worktreeBranch,
        commitMsg,
        session.worktreeBaseBranch,
      );

      if (!result.merged) {
        return { success: false, error: result.error || 'Merge failed' };
      }

      this.setStatus(debateId, 'done');
      this.emit({
        id: uuidv4(),
        role: 'system',
        content: `워크트리 병합 완료! (${session.worktreeBranch} → main)`,
        timestamp: Date.now(),
      }, debateId);

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Discard worktree changes — remove the worktree and delete the branch
   */
  async discardWorktree(debateId: string): Promise<{ success: boolean; error?: string }> {
    const session = this.sessions.get(debateId);
    if (!session) return { success: false, error: 'Session not found' };
    if (!session.worktreePath || !session.worktreeBranch) {
      return { success: false, error: 'No worktree associated with this session' };
    }
    if (!this.gitService) {
      return { success: false, error: 'GitService not available' };
    }

    try {
      await this.gitService.removeWorktree(session.projectPath, session.worktreePath);
      await this.gitService.deleteBranch(session.projectPath, session.worktreeBranch);

      this.setStatus(debateId, 'done');
      this.emit({
        id: uuidv4(),
        role: 'system',
        content: `워크트리 변경사항이 폐기되었습니다. (${session.worktreeBranch})`,
        timestamp: Date.now(),
      }, debateId);

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Restore a minimal DebateSession from persisted worktree metadata.
   * Used after app restart so that mergeWorktree / discardWorktree can find the session.
   */
  restoreWorktreeSession(
    debateId: string,
    projectPath: string,
    worktreePath: string,
    worktreeBranch: string,
    baseBranch: string,
  ) {
    if (this.sessions.has(debateId)) return; // already in memory
    const session: DebateSession = {
      id: debateId,
      prompt: '',
      projectPath,
      projectContext: '',
      mode: 'debate',
      status: 'worktree_review',
      messages: [],
      rounds: [],
      currentRound: 0,
      maxRounds: 0,
      worktreePath,
      worktreeBranch,
      worktreeBaseBranch: baseBranch,
      executionCwd: worktreePath,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    this.sessions.set(debateId, session);
  }

  /**
   * User intervention — inject guidance into the next debate round
   */
  async userIntervene(debateId: string, message: string) {
    const session = this.sessions.get(debateId);
    if (!session) return { success: false, error: 'Session not found' };
    if (session.status !== 'debating') return { success: false, error: 'Not in debate' };

    session.pendingUserInput = message;
    this.emit({
      id: uuidv4(),
      role: 'user',
      content: `[방향 지시] ${message}`,
      timestamp: Date.now(),
    }, debateId);
    return { success: true };
  }

  /**
   * Resolve tiebreak — user picks a winner after maxRounds reached
   */
  async resolveTiebreak(debateId: string, winner: 'claude' | 'codex'): Promise<{ success: boolean; error?: string }> {
    const session = this.sessions.get(debateId);
    if (!session) return { success: false, error: 'Session not found' };
    if (session.status !== 'awaiting_tiebreak') {
      return { success: false, error: `Invalid status: ${session.status}. Expected awaiting_tiebreak.` };
    }

    const winnerLabel = winner === 'claude' ? 'Claude' : 'Codex';
    this.emit({
      id: uuidv4(),
      role: 'system',
      content: `사용자가 ${winnerLabel}의 의견을 채택했습니다.`,
      timestamp: Date.now(),
    }, debateId);

    // Extract the winning agent's last proposal as consensus plan
    const winnerMsg = [...session.messages].reverse().find(m => m.role === winner);
    session.consensusPlan = winnerMsg?.content || session.prompt;

    this.setStatus(debateId, 'consensus');

    const settings = this.ai.getSettings();
    session.status = 'awaiting_confirmation';
    this.setStatus(debateId, 'awaiting_confirmation', {
      debateId,
      plan: session.consensusPlan,
    });

    return { success: true };
  }

  async applyConsensus(debateId: string): Promise<{ success: boolean; files: string[]; errors: string[] }> {
    const session = this.sessions.get(debateId);
    if (!session) return { success: false, files: [], errors: ['Session not found'] };

    // If agent mode was used, files are already applied
    const artifactCheck = session.artifactMessageId
      ? session.messages.find(m => m.id === session.artifactMessageId)
      : undefined;
    if (artifactCheck?.agentEvents?.length) {
      return { success: true, files: artifactCheck.filesChanged || [], errors: [] };
    }

    let artifactMsg: DebateMessage | undefined;
    if (session.artifactMessageId) {
      artifactMsg = session.messages.find((m) => m.id === session.artifactMessageId);
    }
    if (!artifactMsg) {
      artifactMsg = [...session.messages]
        .reverse()
        .find((m) => (m.role === 'claude' || m.role === 'codex') && m.content.includes('```'));
    }

    if (!artifactMsg) {
      return { success: false, files: [], errors: ['No code found in debate'] };
    }

    const codeFiles = this.parseCodeFiles(artifactMsg.content, session.projectPath);

    // Auto-checkpoint before applying — enables rollback via /rollback
    try {
      const targetPaths = codeFiles.map(f => f.path);
      await this.checkpointService.create(
        session.projectPath,
        this.buildCommitMessage(session),
        targetPaths,
      );
    } catch {
      // Checkpoint failed — continue without it
    }

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
      }, debateId);
    }

    return { success: errors.length === 0, files: appliedFiles, errors };
  }

  private parseCodeFiles(content: string, projectPath: string): { path: string; content: string }[] {
    const files: { path: string; content: string }[] = [];

    const filePattern = /---\s*FILE:\s*(.+?)\s*---\s*\n```\w*\n([\s\S]*?)```/g;
    let match;
    while ((match = filePattern.exec(content)) !== null) {
      files.push({ path: match[1].trim(), content: match[2].trim() });
    }

    if (files.length === 0) {
      const altPattern = /`([\w/.-]+\.[\w]+)`[:\s]*\n```\w*\n([\s\S]*?)```/g;
      while ((match = altPattern.exec(content)) !== null) {
        files.push({ path: match[1].trim(), content: match[2].trim() });
      }
    }

    return files;
  }
}
