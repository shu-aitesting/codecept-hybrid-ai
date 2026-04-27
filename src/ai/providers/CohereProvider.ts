import { CohereClient } from 'cohere-ai';

import { BaseProvider } from './BaseProvider';
import { ChatMessage, ChatOptions, ChatResult, ChatUsage, ProviderError } from './types';

interface CohereProviderOpts {
  apiKey?: string;
  model?: string;
}

/**
 * Cohere is treated as a free-tier fallback (1000 calls/month on `command-r-plus`).
 * estimateCostUsd returns 0 because cost is billed indirectly via that quota,
 * not per call — RateLimitTracker enforces the quota separately.
 */
export class CohereProvider extends BaseProvider {
  readonly name = 'cohere';
  private readonly client: CohereClient | null;
  private readonly model: string;

  constructor(opts: CohereProviderOpts = {}) {
    super();
    const key = opts.apiKey ?? process.env.COHERE_API_KEY;
    this.client = key ? new CohereClient({ token: key }) : null;
    this.model = opts.model ?? 'command-r-plus';
  }

  isConfigured(): boolean {
    return this.client !== null;
  }

  async chat(messages: ChatMessage[], opts: ChatOptions = {}): Promise<ChatResult> {
    if (!this.client) {
      throw new ProviderError('[cohere] missing COHERE_API_KEY', 'auth');
    }
    const start = Date.now();

    const systemPrompt = messages
      .filter((m) => m.role === 'system')
      .map((m) => m.content)
      .join('\n\n');

    const turns = messages.filter((m) => m.role !== 'system');
    const lastUser = [...turns].reverse().find((m) => m.role === 'user');
    const message = lastUser ? lastUser.content : '';
    const chatHistory = turns
      .slice(0, lastUser ? turns.lastIndexOf(lastUser) : turns.length)
      .map((m) => ({
        role: m.role === 'assistant' ? ('CHATBOT' as const) : ('USER' as const),
        message: m.content,
      }));

    const response = await this.withRetry(
      () =>
        this.client!.chat({
          model: this.model,
          message,
          chatHistory: chatHistory.length ? chatHistory : undefined,
          preamble: systemPrompt || undefined,
          temperature: opts.temperature ?? 0,
          maxTokens: opts.maxTokens ?? 1024,
          stopSequences: opts.stop,
        }),
      { timeoutMs: opts.timeoutMs ?? 30_000, maxRetries: opts.maxRetries ?? 3 },
    );

    const usage: ChatUsage = {
      inputTokens: response.meta?.tokens?.inputTokens ?? 0,
      outputTokens: response.meta?.tokens?.outputTokens ?? 0,
    };

    return {
      text: response.text ?? '',
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
