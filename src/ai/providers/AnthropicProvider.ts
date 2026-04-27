import Anthropic from '@anthropic-ai/sdk';

import { BaseProvider } from './BaseProvider';
import { ChatMessage, ChatOptions, ChatResult, ChatUsage, ProviderError } from './types';

type AnthropicModel = 'claude-haiku-4-5-20251001' | 'claude-sonnet-4-6' | string;

interface AnthropicProviderOpts {
  apiKey?: string;
  model?: AnthropicModel;
}

interface ModelPricing {
  input: number;
  output: number;
  cachedInput: number;
}

/** USD per 1M tokens — public Anthropic pricing as of 2026-04. */
const PRICING: Record<string, ModelPricing> = {
  'claude-haiku-4-5-20251001': { input: 0.8, output: 4, cachedInput: 0.08 },
  'claude-sonnet-4-6': { input: 3, output: 15, cachedInput: 0.3 },
};

const DEFAULT_PRICING: ModelPricing = { input: 0.8, output: 4, cachedInput: 0.08 };

export class AnthropicProvider extends BaseProvider {
  readonly name = 'anthropic';
  private readonly client: Anthropic | null;
  private readonly model: AnthropicModel;

  constructor(opts: AnthropicProviderOpts = {}) {
    super();
    const key = opts.apiKey ?? process.env.ANTHROPIC_API_KEY;
    this.client = key ? new Anthropic({ apiKey: key }) : null;
    this.model = opts.model ?? 'claude-haiku-4-5-20251001';
  }

  isConfigured(): boolean {
    return this.client !== null;
  }

  async chat(messages: ChatMessage[], opts: ChatOptions = {}): Promise<ChatResult> {
    if (!this.client) {
      throw new ProviderError('[anthropic] missing ANTHROPIC_API_KEY', 'auth');
    }
    const start = Date.now();
    const systemBlocks = this.buildSystemBlocks(messages);
    const turnMessages = this.buildTurnMessages(messages);

    const response = await this.withRetry(
      () =>
        this.client!.messages.create({
          model: this.model,
          max_tokens: opts.maxTokens ?? 1024,
          temperature: opts.temperature ?? 0,
          stop_sequences: opts.stop,
          system: systemBlocks.length ? systemBlocks : undefined,
          messages: turnMessages,
        }),
      { timeoutMs: opts.timeoutMs ?? 30_000, maxRetries: opts.maxRetries ?? 3 },
    );

    const text = response.content
      .filter((b: { type: string }) => b.type === 'text')
      .map((b: { type: string; text?: string }) => b.text ?? '')
      .join('');

    const usage: ChatUsage = {
      inputTokens: response.usage.input_tokens ?? 0,
      outputTokens: response.usage.output_tokens ?? 0,
      cachedTokens:
        (response.usage.cache_read_input_tokens ?? 0) +
        (response.usage.cache_creation_input_tokens ?? 0),
    };

    return {
      text,
      usage,
      provider: this.name,
      model: this.model,
      latencyMs: Date.now() - start,
    };
  }

  estimateCostUsd(usage: ChatUsage): number {
    const pricing = PRICING[this.model] ?? DEFAULT_PRICING;
    const cached = usage.cachedTokens ?? 0;
    const uncachedInput = Math.max(0, usage.inputTokens - cached);
    const usd =
      (uncachedInput / 1_000_000) * pricing.input +
      (cached / 1_000_000) * pricing.cachedInput +
      (usage.outputTokens / 1_000_000) * pricing.output;
    return Number(usd.toFixed(6));
  }

  private buildSystemBlocks(
    messages: ChatMessage[],
  ): Array<{ type: 'text'; text: string; cache_control?: { type: 'ephemeral' } }> {
    return messages
      .filter((m) => m.role === 'system')
      .map((m) => ({
        type: 'text' as const,
        text: m.content,
        ...(m.cache ? { cache_control: { type: 'ephemeral' as const } } : {}),
      }));
  }

  private buildTurnMessages(
    messages: ChatMessage[],
  ): Array<{ role: 'user' | 'assistant'; content: string }> {
    return messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }));
  }

  protected override classifyError(err: unknown) {
    if (err instanceof Anthropic.AuthenticationError) return 'auth';
    if (err instanceof Anthropic.PermissionDeniedError) return 'auth';
    if (err instanceof Anthropic.RateLimitError) return 'rate_limit';
    if (err instanceof Anthropic.APIConnectionTimeoutError) return 'timeout';
    if (err instanceof Anthropic.APIConnectionError) return 'transient';
    if (err instanceof Anthropic.InternalServerError) return 'transient';
    if (err instanceof Anthropic.BadRequestError) return 'fatal';
    if (err instanceof Anthropic.NotFoundError) return 'fatal';
    return super.classifyError(err);
  }
}
