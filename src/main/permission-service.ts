import Store from 'electron-store';

/**
 * 권한 시스템 — Claude Code 스타일
 * 파일 접근, 명령 실행 등에 대한 승인/거부/항상허용
 */

export type PermissionAction =
  | 'file:read'
  | 'file:write'
  | 'file:delete'
  | 'file:create'
  | 'terminal:exec'
  | 'git:commit'
  | 'git:push'
  | 'git:merge'
  | 'network:fetch';

export type PermissionDecision = 'allow' | 'deny' | 'always-allow' | 'ask';

export interface PermissionRequest {
  action: PermissionAction;
  detail: string; // e.g. file path, command string
  reason?: string; // AI가 왜 이 작업이 필요한지 설명
}

export interface PermissionRule {
  action: PermissionAction;
  pattern: string; // glob pattern (e.g. "src/**", "npm *")
  decision: PermissionDecision;
  createdAt: number;
}

interface PermissionStore {
  rules: PermissionRule[];
  sessionAllowed: string[]; // 이번 세션에서 허용된 항목 (재시작 시 초기화)
}

const store = new Store<{ permissions: PermissionStore }>({
  defaults: {
    permissions: {
      rules: [
        // 기본 규칙: 읽기는 항상 허용
        { action: 'file:read', pattern: '**/*', decision: 'always-allow', createdAt: Date.now() },
        // src/ 내 파일 쓰기는 허용
        { action: 'file:write', pattern: 'src/**', decision: 'always-allow', createdAt: Date.now() },
        // 안전한 명령어는 허용
        { action: 'terminal:exec', pattern: 'npm run *', decision: 'always-allow', createdAt: Date.now() },
        { action: 'terminal:exec', pattern: 'npx tsc *', decision: 'always-allow', createdAt: Date.now() },
        { action: 'terminal:exec', pattern: 'git status*', decision: 'always-allow', createdAt: Date.now() },
        { action: 'terminal:exec', pattern: 'git diff*', decision: 'always-allow', createdAt: Date.now() },
        { action: 'terminal:exec', pattern: 'git log*', decision: 'always-allow', createdAt: Date.now() },
        // 위험한 명령어는 물어보기
        { action: 'terminal:exec', pattern: 'rm *', decision: 'ask', createdAt: Date.now() },
        { action: 'terminal:exec', pattern: 'sudo *', decision: 'deny', createdAt: Date.now() },
        { action: 'file:delete', pattern: '**/*', decision: 'ask', createdAt: Date.now() },
        { action: 'git:push', pattern: '*', decision: 'ask', createdAt: Date.now() },
      ],
      sessionAllowed: [],
    },
  },
});

export class PermissionService {
  private sessionAllowed: Set<string> = new Set();
  private pendingCallback?: (request: PermissionRequest) => Promise<PermissionDecision>;

  /**
   * 사용자에게 물어보는 콜백 등록
   */
  onPermissionRequest(cb: (request: PermissionRequest) => Promise<PermissionDecision>) {
    this.pendingCallback = cb;
  }

  /**
   * 권한 확인
   */
  async check(request: PermissionRequest): Promise<boolean> {
    const { action, detail } = request;

    // 1. 규칙에서 매칭 확인
    const rules = store.get('permissions').rules;
    const matchedRule = rules.find((r) => r.action === action && this.matchPattern(detail, r.pattern));

    if (matchedRule) {
      if (matchedRule.decision === 'always-allow') return true;
      if (matchedRule.decision === 'deny') return false;
    }

    // 2. 세션 허용 목록 확인
    const key = `${action}:${detail}`;
    if (this.sessionAllowed.has(key)) return true;

    // 3. 사용자에게 물어보기
    if (this.pendingCallback) {
      const decision = await this.pendingCallback(request);

      switch (decision) {
        case 'allow':
          this.sessionAllowed.add(key);
          return true;
        case 'always-allow':
          this.addRule({ action, pattern: detail, decision: 'always-allow', createdAt: Date.now() });
          return true;
        case 'deny':
          return false;
        default:
          return false;
      }
    }

    // 콜백 없으면 기본 거부
    return false;
  }

  /**
   * 규칙 추가
   */
  addRule(rule: PermissionRule) {
    const perms = store.get('permissions');
    perms.rules.push(rule);
    store.set('permissions', perms);
  }

  /**
   * 규칙 삭제
   */
  removeRule(index: number) {
    const perms = store.get('permissions');
    perms.rules.splice(index, 1);
    store.set('permissions', perms);
  }

  /**
   * 모든 규칙 가져오기
   */
  getRules(): PermissionRule[] {
    return store.get('permissions').rules;
  }

  /**
   * 세션 허용 목록 초기화
   */
  resetSession() {
    this.sessionAllowed.clear();
  }

  /**
   * 간단한 glob 매칭
   */
  private matchPattern(value: string, pattern: string): boolean {
    if (pattern === '**/*' || pattern === '*') return true;

    // ** → 모든 경로, * → 단일 세그먼트
    const regex = pattern
      .replace(/\*\*/g, '⬛')
      .replace(/\*/g, '[^/]*')
      .replace(/⬛/g, '.*');

    return new RegExp(`^${regex}$`).test(value);
  }
}
