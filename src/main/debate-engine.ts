import { v4 as uuidv4 } from 'uuid';
import { AIService } from './ai-service';
import {
  DebateSession,
  DebateMessage,
  DebateRound,
  Agreement,
  DebateStatus,
  ConsensusResult,
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

export class DebateEngine {
  private sessions: Map<string, DebateSession> = new Map();
  private messageCallback?: (msg: DebateMessage) => void;
  private statusCallback?: (status: { debateId: string; status: DebateStatus }) => void;

  constructor(private ai: AIService) {}

  onMessage(cb: (msg: DebateMessage) => void) {
    this.messageCallback = cb;
  }

  onStatusChange(cb: (status: { debateId: string; status: DebateStatus }) => void) {
    this.statusCallback = cb;
  }

  private emit(msg: DebateMessage) {
    this.messageCallback?.(msg);
  }

  private setStatus(debateId: string, status: DebateStatus) {
    const session = this.sessions.get(debateId);
    if (session) session.status = status;
    this.statusCallback?.({ debateId, status });
  }

  /**
   * 토론 시작
   */
  async startDebate(prompt: string, projectPath: string, projectContext?: string): Promise<string> {
    const debateId = uuidv4();
    const settings = this.ai.getSettings();

    const session: DebateSession = {
      id: debateId,
      prompt,
      projectPath,
      mode: settings.debate.mode,
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

    // 프로젝트 컨텍스트 저장
    (session as any).projectContext = projectContext || '';

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
   * 토론 루프
   */
  private async runDebateLoop(debateId: string) {
    const session = this.sessions.get(debateId);
    if (!session) return;

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
   * Claude 프롬프트 생성
   */
  private buildClaudePrompt(session: DebateSession, round: number): string {
    const ctx = (session as any).projectContext || '';
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
   * 합의된 코드 파일에 적용
   */
  applyConsensus(debateId: string) {
    // TODO: 코드 파싱 후 실제 파일에 쓰기
    return { success: true };
  }
}
