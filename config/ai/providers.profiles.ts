import type { TaskProfile } from '../../src/ai/providers/types';

export interface ProfileSpec {
  /** Provider chain: first entry is preferred. Format: `name` or `name:variant`. */
  primary: string;
  fallback: string[];
  temperature: number;
  maxTokens: number;
  /** Whether the system prompt should be marked for prompt caching. */
  cacheSystem?: boolean;
  /** Hard timeout per LLM call in ms (default: 30 000). Codegen needs more for large pages. */
  timeoutMs?: number;
}

/**
 * Per-task provider routing rules. Heal calls run dozens of times per CI run
 * and have a tight latency budget → cheap Haiku. Codegen runs once per file
 * but quality matters → Sonnet. Data-gen wants creativity → Cohere.
 */
export const profiles: Record<TaskProfile, ProfileSpec> = {
  heal: {
    // Cohere promoted to primary — Anthropic key not available in current env.
    // Swap back to 'anthropic:haiku' when ANTHROPIC_API_KEY is configured.
    primary: 'cohere',
    fallback: ['anthropic:haiku', 'g4f'],
    temperature: 0,
    maxTokens: 256,
  },
  codegen: {
    // Cohere promoted to primary — swap back to 'anthropic:sonnet' when ANTHROPIC_API_KEY is set.
    primary: 'cohere',
    fallback: ['anthropic:sonnet', 'anthropic:haiku'],
    temperature: 0.2,
    maxTokens: 8192,
    cacheSystem: true,
    timeoutMs: 120_000,
  },
  'data-gen': {
    primary: 'cohere',
    fallback: ['anthropic:haiku'],
    temperature: 0.7,
    maxTokens: 1024,
  },
  review: {
    primary: 'anthropic:haiku',
    fallback: ['cohere'],
    temperature: 0,
    maxTokens: 1024,
    cacheSystem: true,
  },
};
