# debaterAI

**AI agents debate and code together.**

Claude와 Codex(GPT)가 실시간으로 토론한 뒤, 합의된 방향으로 에이전트가 직접 코드를 수정하는 macOS 데스크톱 앱.

## 핵심 기능

| 기능 | 설명 |
|------|------|
| **AI 토론** | Claude와 Codex가 접근법을 논의하고 합의 도달 |
| **에이전트 모드** | 합의 후 AI가 직접 파일 읽기/수정/터미널 실행 (텍스트 출력이 아닌 실제 작업) |
| **실시간 활동 표시** | 에이전트가 어떤 파일을 읽고 수정하는지 실시간 확인 |
| **슬래쉬 커맨드** | `/help`, `/diff`, `/checkpoint`, `/rollback` 등 14개 내장 명령 |
| **세션 관리** | 이전 토론 클릭하면 대화 내역 복원 |
| **자동 체크포인트** | 코드 적용 전 git 스냅샷 생성, `/rollback`으로 복원 |
| **권한 시스템** | Claude Code 스타일 승인/거부/항상허용 |
| **Monaco Editor** | VS Code 에디터 엔진으로 코드 뷰 + diff |

## 설치 및 실행

### 요구 사항

- **Node.js 18+** / npm 9+
- **macOS 12+** (Monterey 이상)
- **Claude CLI** 설치 + 로그인
- **OpenAI API Key** 또는 **Codex CLI** (토론 모드용)

### 1. 프로젝트 클론 및 설치

```bash
git clone https://github.com/sjk0503/debaterAI.git
cd debaterAI
npm install
```

### 2. Claude CLI 설치 (필수)

```bash
npm install -g @anthropic-ai/claude-code
claude login
```

### 3. Codex CLI 설치 (토론 모드 사용 시)

```bash
npm install -g @openai/codex
```

PATH에 안 잡히면 `~/.zshrc`에 추가:
```bash
export PATH="$HOME/.npm-global/bin:$PATH"
```

### 4. 실행

```bash
# 빌드 후 실행
npm run build && npx electron .

# 또는 개발 모드 (핫 리로드)
npm run dev
```

### 5. 초기 설정

1. 앱 실행 → 온보딩 위저드에서 CLI 상태 확인
2. **Settings** 클릭 → API Key 또는 CLI 로그인 설정
3. 프로젝트 폴더 선택 (Browse 버튼)
4. 모드 선택 후 프롬프트 입력

## 사용 방법

### 토론 모드 (Debate)

Claude와 Codex가 접근법을 토론합니다. 토론 중에는 코드를 작성하지 않고 **방향만 논의**합니다. 합의에 도달하면 Claude 에이전트가 직접 파일을 수정합니다.

1. 모드를 **Debate**으로 선택
2. 프롬프트 입력 (예: "로그인 기능 추가해줘")
3. Claude가 제안 → Codex가 리뷰 → 최대 3라운드 토론
4. 합의 도달 시 에이전트가 직접 코드 수정
5. 완료 후 **Diff 보기** 버튼으로 변경 사항 확인

### 솔로 모드 (Claude Only / Codex Only)

하나의 AI 에이전트가 직접 프로젝트 파일을 읽고 수정합니다. Claude Code처럼 동작합니다.

1. 모드를 **Claude Only** 또는 **Codex Only**로 선택
2. 프롬프트 입력
3. 에이전트가 파일 읽기 → 수정 → 터미널 실행을 자동으로 수행
4. 실시간 활동 표시 (ActivityBar)에서 진행 상황 확인

### 키보드 단축키

| 단축키 | 동작 |
|--------|------|
| `Enter` | 메시지 전송 |
| `Shift+Enter` | 줄바꿈 |
| `Cmd+B` | 사이드바 토글 |
| `Cmd+,` | 설정 열기 |
| `Cmd+`` ` | 터미널 토글 |
| `Cmd+N` | 새 세션 |
| `Cmd+Shift+D` | Git diff 보기 |

### 슬래쉬 커맨드

입력창에 `/`를 치면 자동완성 팔레트가 표시됩니다. 방향키로 이동, Enter/Tab으로 선택.

| 커맨드 | 설명 |
|--------|------|
| `/debate` | 토론 모드 전환 |
| `/solo <claude\|codex>` | 솔로 모드 전환 |
| `/clear` | 대화 초기화 |
| `/apply` | 생성된 코드 적용 (텍스트 모드 전용) |
| `/diff` | 현재 git diff 표시 |
| `/status` | 프로바이더 상태 확인 |
| `/context` | 프로젝트 컨텍스트 표시 |
| `/files` | 파일 트리 표시 |
| `/rounds <n>` | 최대 토론 라운드 설정 |
| `/model <provider> <model>` | 모델 변경 |
| `/checkpoint` | git 체크포인트 생성 |
| `/rollback` | 마지막 체크포인트로 복원 |
| `/history` | 세션 히스토리 |
| `/help` | 전체 커맨드 목록 |

### 세션 관리

- 왼쪽 사이드바 **Sessions** 탭에서 이전 토론 확인
- 세션 클릭 → 대화 내역 복원 (모드, 프로젝트 경로도 복원)
- 우클릭 → 삭제
- 진행 중인 세션은 펄스 애니메이션 표시

### 토론 중단

진행 중 빨간 **Stop** 버튼을 클릭하면 즉시 중단됩니다. 중단 후 새 프롬프트를 입력하면 새 토론이 시작됩니다.

## 지원 모델

**Claude (Anthropic)**
- Claude Opus 4.6 (1M context)
- Claude Sonnet 4.6 (기본값)
- Claude Haiku 4.5

**OpenAI**
- GPT-5.4 (1.05M context)
- GPT-5.4 Mini (기본값)
- GPT-5.4 Nano

## 아키텍처

### 토론 흐름

```
프롬프트 입력
  ↓
[Debate 모드]                    [Solo 모드]
  Round 1~N: 텍스트 토론            에이전트 직접 실행
  Claude 제안 → Codex 리뷰           ↓
  합의/최대 라운드 도달            파일 읽기/수정/터미널
  ↓                                 ↓
  에이전트가 합의 기반 구현        완료 → Diff 확인
  ↓
  완료 → Diff 확인
```

### 데이터 저장 위치

| 데이터 | 위치 |
|--------|------|
| 세션 기록 | `~/.debaterai/sessions/` (JSONL + meta.json) |
| 설정/API 키 | `~/Library/Application Support/debaterai/` (암호화) |
| Git 워크트리 | `../.debaterai-worktrees/` (프로젝트 상위) |

### 기술 스택

Electron 34 + React 19 + TypeScript 5.7 + Vite 6 + Tailwind CSS 3.4 + Monaco Editor

## 개발

```bash
npm run dev          # 개발 모드 (핫 리로드)
npm run build        # 프로덕션 빌드
npm run start        # 빌드된 앱 실행
npm run package      # macOS DMG 패키징 (universal)
npm run package:arm64  # Apple Silicon 전용
npm run package:x64    # Intel 전용
```

## 라이선스

MIT
