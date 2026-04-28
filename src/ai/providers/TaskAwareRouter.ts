import { profiles, type ProfileSpec } from '../../../config/ai/providers.profiles';

import { AnthropicProvider } from './AnthropicProvider';
import { BudgetGuard } from './BudgetGuard';
import { CircuitBreaker } from './CircuitBreaker';
import { CohereProvider } from './CohereProvider';
import { CostMeter } from './CostMeter';
import { G4FProvider } from './G4FProvider';
import { HuggingFaceProvider } from './HuggingFaceProvider';
import { RateLimitTracker } from './RateLimitTracker';
import {
  ChatMessage,
  ChatOptions,
  ChatResult,
  LLMProvider,
  ProviderError,
  TaskProfile,
} from './types';

interface RouterDeps {
  costMeter?: CostMeter;
  budgetGuard?: BudgetGuard;
  rateLimit?: RateLimitTracker;
  /** Override providers (used by tests with MockProvider). Keyed by spec id. */
  providers?: Record<string, LLMProvider>;
  /** Used by tests to inject a deterministic clock for circuit breakers. */
  breakerNow?: () => number;
}

interface CallMeta {
  task: TaskProfile;
  testFile?: string;
  agentName?: string;
}

/**
 * Picks a provider per task profile with fallback chain. Skips providers that
 * are not configured, broken (circuit open), out of free-tier quota, or
 * would push spend over the daily budget.
 */
export class TaskAwareRouter {
  private readonly profile: ProfileSpec;
  private readonly chain: Array<{ id: string; provider: LLMProvider; breaker: CircuitBreaker }>;
  private readonly costMeter: CostMeter;
  private readonly budgetGuard: BudgetGuard;
  private readonly rateLimit: RateLimitTracker;

  constructor(
    public readonly task: TaskProfile,
    deps: RouterDeps = {},
  ) {
    this.profile = profiles[task];
    if (!this.profile) {
      throw new Error(`Unknown task profile: ${task}`);
    }
    this.costMeter = deps.costMeter ?? new CostMeter();
    this.budgetGuard = deps.budgetGuard ?? new BudgetGuard({ costMeter: this.costMeter });
    this.rateLimit = deps.rateLimit ?? new RateLimitTracker();
    const ids = [this.profile.primary, ...this.profile.fallback];
    this.chain = ids.map((id) => ({
      id,
      provider: deps.providers?.[id] ?? this.buildProvider(id),
      breaker: CircuitBreaker.for(id, deps.breakerNow ? { now: deps.breakerNow } : {}),
    }));
  }

  /**
   * Try each provider in order. The first one that is configured, allowed by
   * its circuit breaker, within rate-limit headroom, and fits the budget gets
   * the call. Failures advance to the next provider; the last error bubbles up.
   */
  async chat(
    messages: ChatMessage[],
    opts: ChatOptions = {},
    meta: Omit<CallMeta, 'task'> = {},
  ): Promise<ChatResult> {
    const tagged = this.applyCacheFlags(messages);
    const callOpts: ChatOptions = {
      temperature: this.profile.temperature,
      maxTokens: this.profile.maxTokens,
      timeoutMs: this.profile.timeoutMs,
      ...opts,
    };

    const errors: Array<{ id: string; err: unknown }> = [];
    for (const link of this.chain) {
      if (!link.provider.isConfigured()) continue;
      if (!link.breaker.allow()) {
        errors.push({
          id: link.id,
          err: new ProviderError(`circuit open for ${link.id}`, 'transient'),
        });
        continue;
      }
      if (!this.rateLimit.canCall(link.provider.name)) {
        errors.push({
          id: link.id,
          err: new ProviderError(`rate-limited: ${link.id}`, 'rate_limit'),
        });
        continue;
      }
      // Budget check: assume worst case = full maxTokens to be conservative.
      if (!this.budgetGuard.canSpend(0)) {
        this.budgetGuard.assertCanSpend(0); // throws BudgetExceededError
      }

      try {
        const result = await link.provider.chat(tagged, callOpts);
        const cost = link.provider.estimateCostUsd(result.usage);
        this.costMeter.log(result, cost, { task: this.task, ...meta });
        this.rateLimit.record(
          link.provider.name,
          result.usage.inputTokens + result.usage.outputTokens,
        );
        link.breaker.recordSuccess();
        return result;
      } catch (err) {
        link.breaker.recordFailure();
        errors.push({ id: link.id, err });
        // For auth/fatal errors, advancing to the next provider is correct.
        // For transient errors we already retried inside BaseProvider.
      }
    }

    const summary = errors.map((e) => `${e.id}: ${(e.err as Error)?.message ?? e.err}`).join(' | ');
    throw new ProviderError(
      `all providers failed for task=${this.task}: ${summary || 'no provider configured'}`,
      'fatal',
    );
  }

  /** Mark `system` messages for prompt caching when the profile opts in. */
  private applyCacheFlags(messages: ChatMessage[]): ChatMessage[] {
    if (!this.profile.cacheSystem) return messages;
    return messages.map((m) =>
      m.role === 'system' && m.cache === undefined ? { ...m, cache: true } : m,
    );
  }

  private buildProvider(id: string): LLMProvider {
    const [name, variant] = id.split(':');
    switch (name) {
      case 'anthropic': {
        const model = variant === 'sonnet' ? 'claude-sonnet-4-6' : 'claude-haiku-4-5-20251001';
        return new AnthropicProvider({ model });
      }
      case 'cohere':
        return new CohereProvider();
      case 'huggingface':
        return new HuggingFaceProvider();
      case 'g4f':
        return new G4FProvider();
      default:
        throw new Error(`Unknown provider id: ${id}`);
    }
  }
}
