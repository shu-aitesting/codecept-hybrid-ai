import { InferenceClient } from '@huggingface/inference';

import { BaseProvider } from './BaseProvider';
import { ChatMessage, ChatOptions, ChatResult, ChatUsage, ProviderError } from './types';

interface HuggingFaceProviderOpts {
  token?: string;
  model?: string;
}

/**
 * HuggingFace serverless inference. The free tier caps at ~30k tokens/day
 * across all models — RateLimitTracker is responsible for that gate.
 */
export class HuggingFaceProvider extends BaseProvider {
  readonly name = 'huggingface';
  private readonly client: InferenceClient | null;
  private readonly model: string;

  constructor(opts: HuggingFaceProviderOpts = {}) {
    super();
    const token = opts.token ?? process.env.HF_TOKEN;
    this.client = token ? new InferenceClient(token) : null;
    this.model = opts.model ?? 'Qwen/Qwen2.5-Coder-32B-Instruct';
  }

  isConfigured(): boolean {
    return this.client !== null;
  }

  async chat(messages: ChatMessage[], opts: ChatOptions = {}): Promise<ChatResult> {
    if (!this.client) {
      throw new ProviderError('[huggingface] missing HF_TOKEN', 'auth');
    }
    const start = Date.now();

    const response = await this.withRetry(
      () =>
        this.client!.chatCompletion({
          model: this.model,
          messages: messages.map((m) => ({ role: m.role, content: m.content })),
          temperature: opts.temperature ?? 0,
          max_tokens: opts.maxTokens ?? 1024,
          stop: opts.stop,
        }),
      { timeoutMs: opts.timeoutMs ?? 30_000, maxRetries: opts.maxRetries ?? 3 },
    );

    const text = response.choices?.[0]?.message?.content ?? '';
    const usage: ChatUsage = {
      inputTokens: response.usage?.prompt_tokens ?? 0,
      outputTokens: response.usage?.completion_tokens ?? 0,
    };

    return {
      text,
      usage,
      provider: this.name,
      model: this.model,
      latencyMs: Date.now() - start,
    };
  }

  estimateCostUsd(_usage: ChatUsage): number {
    return 0;
  }
}
