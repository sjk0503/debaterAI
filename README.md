# 🤖⚔️🤖 debaterAI

**AI agents debate and code together.**

Claude와 Codex(GPT)가 실시간으로 토론하며 최적의 코드를 만들어내는 데스크톱 앱.

## 핵심 기능

- **🔥 AI 토론**: Claude와 Codex가 서로 의견을 나누며 최적의 구현 방법을 찾습니다
- **🤝 합의 기반 개발**: 두 AI가 합의에 도달하면 코드를 생성합니다
- **👀 실시간 관전**: 토론 과정을 채팅 형태로 실시간 확인
- **📁 파일 탐색**: 프로젝트 파일 트리 + 코드 뷰어
- **⚙️ 유연한 설정**: 토론 모드, 라운드 수, AI 모델 선택

## 토론 모드

| 모드 | 설명 |
|------|------|
| **Auto** | AI끼리 자동 토론 → 합의 → 코드 생성 |
| **Guided** | 매 라운드마다 사용자가 방향 결정 |
| **Watch** | 토론 관전 후 최종 결과에 승인/거부 |

## 기술 스택

- **Electron** — 데스크톱 앱
- **React + TypeScript + Tailwind** — UI
- **Monaco Editor** — 코드 뷰
- **Claude API + OpenAI API** — AI 엔진

## 시작하기

```bash
# 의존성 설치
npm install

# 개발 모드
npm run dev

# 빌드
npm run build

# 패키징
npm run package
```

## 설정

Settings에서 API 키를 입력하세요:
- **Claude**: Anthropic API Key
- **Codex**: OpenAI API Key

## 라이선스

MIT
