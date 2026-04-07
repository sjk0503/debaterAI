// ============================================================================
// debaterAI — Supported Models Registry
// ============================================================================

export interface ModelInfo {
  id: string;
  name: string;
  provider: 'anthropic' | 'openai';
  tier: 'flagship' | 'balanced' | 'fast';
  contextWindow: number;
  maxOutput: number;
  supportsVision: boolean;
  supportsStreaming: boolean;
  description: string;
}

// ============================================================================
// Claude Models (Anthropic) — 2026 Latest
// ============================================================================
export const CLAUDE_MODELS: ModelInfo[] = [
  {
    id: 'claude-opus-4-20250514',
    name: 'Claude Opus 4.6',
    provider: 'anthropic',
    tier: 'flagship',
    contextWindow: 1000000,
    maxOutput: 32000,
    supportsVision: true,
    supportsStreaming: true,
    description: '최고 성능. 1M 컨텍스트. 복잡한 아키텍처 설계, 대규모 코드베이스 분석에 최적.',
  },
  {
    id: 'claude-sonnet-4-20250514',
    name: 'Claude Sonnet 4',
    provider: 'anthropic',
    tier: 'balanced',
    contextWindow: 200000,
    maxOutput: 16000,
    supportsVision: true,
    supportsStreaming: true,
    description: '성능과 속도의 균형. 일반 코딩 작업에 추천.',
  },
  {
    id: 'claude-haiku-3-5-20241022',
    name: 'Claude Haiku 3.5',
    provider: 'anthropic',
    tier: 'fast',
    contextWindow: 200000,
    maxOutput: 8192,
    supportsVision: true,
    supportsStreaming: true,
    description: '빠른 응답. 간단한 코드 수정, 리뷰에 적합.',
  },
];

// ============================================================================
// OpenAI Models — 2026 Latest
// ============================================================================
export const OPENAI_MODELS: ModelInfo[] = [
  {
    id: 'gpt-4.1-2025-04-14',
    name: 'GPT-4.1',
    provider: 'openai',
    tier: 'flagship',
    contextWindow: 1047576,
    maxOutput: 32768,
    supportsVision: true,
    supportsStreaming: true,
    description: '최신 플래그십. 1M 컨텍스트, 코딩 성능 최고.',
  },
  {
    id: 'gpt-4o-2024-11-20',
    name: 'GPT-4o',
    provider: 'openai',
    tier: 'balanced',
    contextWindow: 128000,
    maxOutput: 16384,
    supportsVision: true,
    supportsStreaming: true,
    description: '멀티모달 균형. 빠르면서도 강력한 코딩.',
  },
  {
    id: 'gpt-4o-mini-2024-07-18',
    name: 'GPT-4o Mini',
    provider: 'openai',
    tier: 'fast',
    contextWindow: 128000,
    maxOutput: 16384,
    supportsVision: true,
    supportsStreaming: true,
    description: '가볍고 빠른 모델. 간단한 작업에 적합.',
  },
  {
    id: 'o3-2025-04-16',
    name: 'o3',
    provider: 'openai',
    tier: 'flagship',
    contextWindow: 200000,
    maxOutput: 100000,
    supportsVision: true,
    supportsStreaming: true,
    description: '추론 특화. 복잡한 로직, 알고리즘 설계에 최적.',
  },
  {
    id: 'o3-mini-2025-01-31',
    name: 'o3-mini',
    provider: 'openai',
    tier: 'balanced',
    contextWindow: 200000,
    maxOutput: 100000,
    supportsVision: true,
    supportsStreaming: true,
    description: '추론 특화 경량. 속도와 논리력 균형.',
  },
  {
    id: 'o1-2024-12-17',
    name: 'o1',
    provider: 'openai',
    tier: 'flagship',
    contextWindow: 200000,
    maxOutput: 100000,
    supportsVision: true,
    supportsStreaming: true,
    description: '1세대 추론 모델. 수학/과학 문제에 강함.',
  },
];

export const ALL_MODELS = [...CLAUDE_MODELS, ...OPENAI_MODELS];

export function getModel(id: string): ModelInfo | undefined {
  return ALL_MODELS.find((m) => m.id === id);
}

export function getModelsByProvider(provider: 'anthropic' | 'openai'): ModelInfo[] {
  return ALL_MODELS.filter((m) => m.provider === provider);
}

export const DEFAULT_CLAUDE_MODEL = 'claude-sonnet-4-20250514';
export const DEFAULT_OPENAI_MODEL = 'gpt-4o-2024-11-20';
