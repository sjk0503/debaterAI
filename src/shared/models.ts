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
  supportsReasoningEffort: boolean;
  description: string;
}

// ============================================================================
// Claude Models (Anthropic) — 2026 Latest
// ============================================================================
export const CLAUDE_MODELS: ModelInfo[] = [
  {
    id: 'claude-opus-4-6',
    name: 'Claude Opus 4.6',
    provider: 'anthropic',
    tier: 'flagship',
    contextWindow: 1000000,
    maxOutput: 128000,
    supportsVision: true,
    supportsStreaming: true,
    supportsReasoningEffort: false,
    description: '최고 성능. 1M 컨텍스트. 복잡한 아키텍처 설계, 대규모 코드베이스 분석에 최적.',
  },
  {
    id: 'claude-sonnet-4-6',
    name: 'Claude Sonnet 4.6',
    provider: 'anthropic',
    tier: 'balanced',
    contextWindow: 1000000,
    maxOutput: 64000,
    supportsVision: true,
    supportsStreaming: true,
    supportsReasoningEffort: false,
    description: '성능과 속도의 균형. 1M 컨텍스트. 일반 코딩 작업에 추천.',
  },
  {
    id: 'claude-haiku-4-5-20251001',
    name: 'Claude Haiku 4.5',
    provider: 'anthropic',
    tier: 'fast',
    contextWindow: 200000,
    maxOutput: 64000,
    supportsVision: true,
    supportsStreaming: true,
    supportsReasoningEffort: false,
    description: '빠른 응답. 간단한 코드 수정, 리뷰에 적합.',
  },
];

// ============================================================================
// OpenAI Models — 2026 Latest
// ============================================================================
export const OPENAI_MODELS: ModelInfo[] = [
  {
    id: 'gpt-5.4',
    name: 'GPT-5.4',
    provider: 'openai',
    tier: 'flagship',
    contextWindow: 1050000,
    maxOutput: 128000,
    supportsVision: true,
    supportsStreaming: true,
    supportsReasoningEffort: true,
    description: '최신 플래그십. 1M 컨텍스트, 코딩 성능 최고.',
  },
  {
    id: 'gpt-5.4-mini',
    name: 'GPT-5.4 Mini',
    provider: 'openai',
    tier: 'balanced',
    contextWindow: 400000,
    maxOutput: 128000,
    supportsVision: true,
    supportsStreaming: true,
    supportsReasoningEffort: true,
    description: '빠르고 효율적. 400K 컨텍스트. 일반 코딩에 추천.',
  },
  {
    id: 'gpt-5.4-nano',
    name: 'GPT-5.4 Nano',
    provider: 'openai',
    tier: 'fast',
    contextWindow: 400000,
    maxOutput: 128000,
    supportsVision: true,
    supportsStreaming: true,
    supportsReasoningEffort: true,
    description: '가볍고 빠른 모델. 간단한 작업에 적합.',
  },
];

export const ALL_MODELS = [...CLAUDE_MODELS, ...OPENAI_MODELS];

export function getModel(id: string): ModelInfo | undefined {
  return ALL_MODELS.find((m) => m.id === id);
}

export function getModelsByProvider(provider: 'anthropic' | 'openai'): ModelInfo[] {
  return ALL_MODELS.filter((m) => m.provider === provider);
}

export const DEFAULT_CLAUDE_MODEL = 'claude-sonnet-4-6';
export const DEFAULT_OPENAI_MODEL = 'gpt-5.4-mini';

// Legacy model migration map
export const LEGACY_MODEL_MAP: Record<string, string> = {
  // Claude legacy
  'claude-opus-4-20250514': 'claude-opus-4-6',
  'claude-sonnet-4-20250514': 'claude-sonnet-4-6',
  'claude-haiku-3-5-20241022': 'claude-haiku-4-5-20251001',
  // OpenAI legacy
  'gpt-4.1-2025-04-14': 'gpt-5.4',
  'gpt-4.1': 'gpt-5.4',
  'gpt-4o-2024-11-20': 'gpt-5.4-mini',
  'gpt-4o': 'gpt-5.4-mini',
  'gpt-4o-mini-2024-07-18': 'gpt-5.4-nano',
  'gpt-4o-mini': 'gpt-5.4-nano',
  'o3-2025-04-16': 'gpt-5.4-mini',
  'o3': 'gpt-5.4-mini',
  'o3-mini-2025-01-31': 'gpt-5.4-nano',
  'o3-mini': 'gpt-5.4-nano',
  'o4-mini': 'gpt-5.4-mini',
  'o1-2024-12-17': 'gpt-5.4-mini',
  'o1': 'gpt-5.4-mini',
};
