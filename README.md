# 🤖⚔️🤖 debaterAI

**AI agents debate and code together.**

Claude와 Codex(GPT)가 실시간으로 토론하며 최적의 코드를 만들어내는 Mac 데스크톱 앱.

![debaterAI UI](docs/screenshot-placeholder.png)

## ✨ 핵심 기능

| 기능 | 설명 |
|------|------|
| 🔥 **AI 토론** | Claude와 Codex가 서로 의견을 나누며 최적의 구현 방법을 찾음 |
| 🤝 **합의 기반 개발** | 두 AI가 합의에 도달하면 코드 생성 |
| 👀 **실시간 관전** | 토론 과정을 채팅 형태로 실시간 확인 |
| 📁 **프로젝트 컨텍스트** | 파일 구조와 코드를 AI에게 자동 전달 |
| 🔒 **권한 시스템** | Claude Code 스타일 승인/거부/항상허용 |
| 📦 **Git 워크트리** | 토론별 격리된 브랜치에서 안전하게 작업 |
| 💻 **Monaco Editor** | VS Code 에디터 엔진으로 코드 뷰 |
| 🔍 **코드 검색** | grep, 파일 검색, diff 뷰 |

## 🚀 설치

### DMG 설치 (권장)
1. [Releases](https://github.com/sjk0503/debaterAI/releases) 페이지에서 최신 DMG 다운로드
2. `debaterAI-arm64.dmg` (M1/M2/M3) 또는 `debaterAI-x64.dmg` (Intel) 선택
3. 앱을 Applications 폴더로 드래그
4. 처음 실행 시 System Preferences → Security에서 허용

### 소스 빌드
```bash
git clone https://github.com/sjk0503/debaterAI.git
cd debaterAI
npm install
npm run dev
```

## ⚙️ 초기 설정

1. 앱 실행 후 **⚙️ Settings** 클릭
2. Claude API Key 또는 OAuth 로그인 설정
3. OpenAI API Key 설정 (Codex 토론용)
4. 프로젝트 폴더 선택 후 토론 시작!

### 지원 모델

**Claude (Anthropic)**
- 👑 Claude Opus 4.6 (1M context) — 최고 성능
- ⚡ Claude Sonnet 4 — 균형 (기본값 추천)
- 🚀 Claude Haiku 3.5 — 빠른 응답

**Codex / GPT (OpenAI)**
- 👑 GPT-4.1 (1M context)
- ⚡ GPT-4o — 기본값 추천
- 👑 o3 — 추론 특화
- 🚀 GPT-4o Mini

## 💬 토론 모드

| 모드 | 설명 |
|------|------|
| **Debate** | Claude ↔ Codex 토론 → 합의 → 코드 생성 |
| **Claude Only** | Claude 단독으로 코딩 |
| **Codex Only** | GPT 단독으로 코딩 |

## 📁 Git 워크트리

```
프로젝트/                         ../.debaterai-worktrees/
├── .git/                         ├── debate-a1b2/  ← 로그인 기능
├── src/                          ├── debate-c3d4/  ← 대시보드
└── ...                           └── debate-e5f6/  ← API 리팩토링
```

각 토론이 독립된 브랜치에서 진행 → 충돌 없음 → 완료 시 메인 브랜치에 머지.

## 🛠️ 개발 환경

**요구 사항**
- Node.js 18+
- npm 9+
- macOS 12+ (Monterey 이상)

```bash
# 의존성 설치
npm install

# 개발 모드 실행
npm run dev

# 프로덕션 빌드
npm run build

# DMG 패키징 (arm64)
npm run package:arm64

# DMG 패키징 (Universal - arm64 + x64)
npm run package
```

## 📂 프로젝트 구조

```
debaterAI/
├── src/
│   ├── main/                    # Electron 메인 프로세스
│   │   ├── index.ts             # 앱 진입점 + IPC 핸들러
│   │   ├── debate-engine.ts     # 🔥 AI 토론 엔진 (핵심)
│   │   ├── ai-service.ts        # Claude + OpenAI API
│   │   ├── claude-code-service.ts # Claude Code CLI 연동
│   │   ├── git-service.ts       # Git 워크트리 + 브랜치
│   │   ├── terminal-service.ts  # 명령 실행
│   │   ├── search-service.ts    # grep + 파일 검색
│   │   ├── permission-service.ts # 권한 시스템
│   │   └── preload.ts           # IPC 브릿지
│   ├── renderer/                # React UI
│   │   ├── App.tsx              # 메인 레이아웃
│   │   └── components/
│   │       ├── DebatePanel.tsx  # 토론 채팅 패널
│   │       ├── MarkdownMessage.tsx # 마크다운 + 코드 하이라이팅
│   │       ├── CodeView.tsx     # Monaco Editor
│   │       ├── DiffView.tsx     # Git diff 뷰어
│   │       ├── FileExplorer.tsx # 파일 탐색기
│   │       ├── SettingsModal.tsx # 설정 (6탭)
│   │       └── PermissionModal.tsx # 권한 요청 UI
│   └── shared/
│       ├── types.ts             # 공통 타입
│       └── models.ts            # AI 모델 레지스트리
├── docs/
│   ├── DESIGN.md                # 설계 문서
│   └── USAGE.md                 # 상세 사용법
├── build/
│   └── entitlements.mac.plist   # Mac 권한 설정
└── electron-builder.yml         # 패키징 설정
```

## 🔐 보안

- AI API 키는 로컬 encrypted store에만 저장
- 파일 접근/명령 실행은 권한 시스템으로 제어
- Claude Code 스타일 승인/거부/항상허용
- Git 워크트리로 원본 코드 보호

## 📜 라이선스

MIT

## 🙏 레퍼런스

- [Conductor](https://conductor.build) — 병렬 에이전트 UI 벤치마킹
- [Emdash](https://github.com/generalaction/emdash) — 오픈소스 ADE 참고
- [Vibe Kanban](https://github.com/BloopAI/vibe-kanban) — 에이전트 오케스트레이션
