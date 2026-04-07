# debaterAI - Design Document

## 개요
AI 에이전트들이 실시간으로 토론하며 코드를 작성하는 데스크톱 앱.
Claude와 Codex(GPT)가 서로 의견을 주고받으며 합의점을 찾아 개발을 진행한다.

## 핵심 컨셉
- **토론이 메인 UX**: 두 AI가 대화하는 과정을 실시간으로 볼 수 있음
- **합의 기반 개발**: 의견이 갈리면 토론 → 합의 → 코드 생성
- **코딩은 Claude 담당**: 실제 코드 작성/수정은 Claude Code가 실행
- **Codex는 리뷰어/아키텍트**: 설계 의견, 코드 리뷰, 대안 제시

## 기술 스택
- **Framework**: Electron (데스크톱 앱)
- **Frontend**: React + TypeScript + Tailwind CSS
- **Editor**: Monaco Editor (VS Code 에디터 엔진)
- **AI**: Claude API (Anthropic) + OpenAI API (Codex/GPT)
- **Auth**: OAuth (Claude 계정, OpenAI 계정)
- **Git**: git worktree (작업 격리)

## 아키텍처

```
┌─────────────────────────────────────────────────┐
│                  Electron App                    │
├──────────────┬──────────────────────────────────┤
│              │                                   │
│  File Tree   │   Debate Panel (메인)              │
│              │   ┌─────────────────────────────┐ │
│  - 프로젝트   │   │ 👤 User: "로그인 기능 만들어"  │ │
│    파일 목록  │   │ 🟣 Claude: "JWT 기반으로..."  │ │
│              │   │ 🟢 Codex: "세션 방식이..."    │ │
│              │   │ 🟣 Claude: "그럼 절충안으로..." │ │
│              │   │ ✅ 합의 도출                   │ │
│              │   │ 🔨 코드 생성 중...             │ │
│              │   └─────────────────────────────┘ │
│              ├──────────────────────────────────┤
│              │   Code View (Monaco Editor)       │
│              │   실시간 변경 사항 표시              │
│              ├──────────────────────────────────┤
│              │   Terminal                        │
│              │   빌드/실행 로그                    │
└──────────────┴──────────────────────────────────┘
```

## 토론 엔진 설계

### 플로우
1. 사용자가 명령 입력 ("로그인 기능 만들어줘")
2. Claude에게 구현 계획 요청
3. Claude 응답을 Codex에게 리뷰 요청
4. Codex가 의견 제시 (동의/반대/대안)
5. 의견이 다르면 → 토론 라운드 (최대 N회)
6. 합의 도달 → Claude가 코드 생성
7. 생성된 코드를 에디터에 반영

### 토론 모드
- **Auto**: AI끼리 자동 토론 → 합의 → 실행
- **Guided**: 매 라운드마다 사용자가 방향 결정
- **Watch**: 토론 과정만 보고, 최종 결과에 승인/거부

### 합의 판단 로직
```typescript
interface DebateRound {
  claudeResponse: string;
  codexResponse: string;
  agreement: 'agree' | 'partial' | 'disagree';
  round: number;
}

// 합의 조건:
// 1. 두 AI 모두 "동의" 표시
// 2. 최대 라운드(3-5회) 도달 시 Claude 의견 우선 (코더이므로)
// 3. 사용자가 중간에 개입하여 결정
```

## 인증 (OAuth)

### Claude
- Anthropic OAuth 플로우
- Claude Max 구독 시 API 비용 없음
- 토큰 로컬 저장 (Electron keychain)

### OpenAI
- OpenAI OAuth 플로우
- ChatGPT Plus/Pro 구독
- 토큰 로컬 저장

### API Key (대안)
- 직접 API 키 입력도 지원
- 설정 화면에서 전환 가능

## Git 워크트리

```bash
# 메인 프로젝트
/project
  ├── .git/
  ├── src/
  └── ...

# 토론별 워크트리 (격리된 환경)
/project-worktrees/
  ├── debate-001/  # "로그인 기능" 토론
  ├── debate-002/  # "대시보드 UI" 토론
  └── debate-003/  # "API 리팩토링" 토론
```

- 각 토론/태스크마다 별도 브랜치 + 워크트리 생성
- 토론 완료 → 머지 또는 폐기
- 병렬 토론 가능

## UI 구성

### 1. Debate Panel (토론 패널) - 메인
- 채팅 형태로 AI 대화 표시
- Claude: 보라색, Codex: 초록색, User: 기본
- 합의 상태 표시 (동의/부분동의/반대)
- "합의됨" 뱃지 → 코드 생성 진행

### 2. Code View (코드 뷰)
- Monaco Editor
- 실시간 diff 표시
- 변경된 파일 탭

### 3. File Explorer (파일 탐색기)
- 프로젝트 파일 트리
- 변경된 파일 하이라이트

### 4. Terminal (터미널)
- 빌드/실행 로그
- 직접 명령어 입력

### 5. Settings (설정)
- AI 계정 연결 (OAuth / API Key)
- 토론 모드 설정
- 최대 라운드 수
- 자동 실행 여부

## Phase 1 (MVP)
- [ ] Electron + React + Monaco Editor 기본 셸
- [ ] Claude API + OpenAI API 연동
- [ ] 토론 엔진 (기본 플로우)
- [ ] 토론 패널 UI
- [ ] 코드 뷰 (읽기 전용)
- [ ] 파일 탐색기

## Phase 2
- [ ] OAuth 로그인 (Claude, OpenAI)
- [ ] 코드 자동 적용 (파일 쓰기)
- [ ] Git worktree 격리
- [ ] 병렬 토론
- [ ] 터미널 통합

## Phase 3
- [ ] 토론 히스토리 저장/검색
- [ ] 토론 모드 (Auto/Guided/Watch)
- [ ] 프로젝트 설정 (.debaterai.json)
- [ ] 플러그인 시스템 (다른 AI 모델 추가)
- [ ] 테마/커스터마이징

## 레퍼런스
- [Conductor](https://conductor.build) — 병렬 에이전트 UI 참고
- [Emdash](https://github.com/generalaction/emdash) — 오픈소스 멀티에이전트 ADE
- [Vibe Kanban](https://github.com/BloopAI/vibe-kanban) — 에이전트 오케스트레이션
- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) — Claude CLI 인터페이스
