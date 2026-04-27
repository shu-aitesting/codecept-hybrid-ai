import type { TaskProfile } from '../../src/ai/providers/types';

export interface ProfileSpec {
  /** Provider chain: first entry is preferred. Format: `name` or `name:variant`. */
  primary: string;
  fallback: string[];
  temperature: number;
  maxTokens: number;
  /** Whether the system prompt should be marked for prompt caching. */
  cacheSystem?: boolean;
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
    primary: 'anthropic:sonnet',
    fallback: ['anthropic:haiku', 'cohere'],
    temperature: 0.2,
    maxTokens: 4096,
    cacheSystem: true,
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
