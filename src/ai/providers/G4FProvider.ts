import axios, { AxiosInstance } from 'axios';

import { BaseProvider } from './BaseProvider';
import { ChatMessage, ChatOptions, ChatResult, ChatUsage } from './types';

interface G4FProviderOpts {
  endpoint?: string;
  model?: string;
}

/**
 * Last-resort provider — community-hosted gateway, no API key. Quality and
 * uptime are unstable. Use only when every other provider is exhausted.
 */
export class G4FProvider extends BaseProvider {
  readonly name = 'g4f';
  private readonly endpoint: string;
  private readonly model: string;
  private readonly http: AxiosInstance;

  constructor(opts: G4FProviderOpts = {}) {
    super();
    this.endpoint = opts.endpoint ?? 'https://g4f.dev/api/openai/v1/chat/completions';
    this.model = opts.model ?? 'gpt-4o-mini';
    this.http = axios.create({ timeout: 30_000 });
  }

  isConfigured(): boolean {
    return true;
  }

  async chat(messages: ChatMessage[], opts: ChatOptions = {}): Promise<ChatResult> {
    const start = Date.now();
    const response = await this.withRetry(
      () =>
        this.http.post(this.endpoint, {
          model: this.model,
          messages: messages.map((m) => ({ role: m.role, content: m.content })),
          temperature: opts.temperature ?? 0,
          max_tokens: opts.maxTokens ?? 1024,
          stop: opts.stop,
        }),
      { timeoutMs: opts.timeoutMs ?? 30_000, maxRetries: opts.maxRetries ?? 2 },
    );

    const data = response.data;
    const text: string = data?.choices?.[0]?.message?.content ?? '';
    const usage: ChatUsage = {
      inputTokens: data?.usage?.prompt_tokens ?? 0,
      outputTokens: data?.usage?.completion_tokens ?? 0,
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
