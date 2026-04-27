import * as crypto from 'node:crypto';

import {
  ChatMessage,
  ChatOptions,
  ChatResult,
  ChatUsage,
  LLMProvider,
  NoMockResponseError,
} from './types';

type MockResponse =
  | string
  | ((messages: ChatMessage[], opts?: ChatOptions) => Promise<string> | string);

interface MockProviderOpts {
  responses?: Map<string, MockResponse>;
  /** Default response when no key matches. If unset, throws NoMockResponseError. */
  fallback?: MockResponse;
  /** Inject a deterministic clock for assertions on latency. */
  now?: () => number;
}

/**
 * Deterministic provider for unit tests — no API key, no network. The key is
 * a SHA-256 hash of the message array; tests register `(messages → text)`
 * pairs ahead of time, or supply a fallback function.
 */
export class MockProvider implements LLMProvider {
  readonly name = 'mock';
  private readonly responses: Map<string, MockResponse>;
  private readonly fallback?: MockResponse;
  private readonly now: () => number;
  /** Indexed history of every call — handy for assertions. */
  readonly calls: Array<{ messages: ChatMessage[]; opts?: ChatOptions }> = [];

  constructor(opts: MockProviderOpts = {}) {
    this.responses = opts.responses ?? new Map();
    this.fallback = opts.fallback;
    this.now = opts.now ?? Date.now;
  }

  static keyFor(messages: ChatMessage[]): string {
    const normalized = messages.map((m) => `${m.role}:${m.content}`).join('\n');
    return crypto.createHash('sha256').update(normalized).digest('hex');
  }

  set(messages: ChatMessage[] | string, response: MockResponse): void {
    const key = typeof messages === 'string' ? messages : MockProvider.keyFor(messages);
    this.responses.set(key, response);
  }

  isConfigured(): boolean {
    return true;
  }

  async chat(messages: ChatMessage[], opts: ChatOptions = {}): Promise<ChatResult> {
    this.calls.push({ messages, opts });
    const key = MockProvider.keyFor(messages);
    const response = this.responses.get(key) ?? this.fallback;
    if (response === undefined) {
      throw new NoMockResponseError(key);
    }
    const text =
      typeof response === 'function' ? await response(messages, opts) : response;
    const start = this.now();
    const usage: ChatUsage = {
      inputTokens: this.estimateTokens(messages.map((m) => m.content).join(' ')),
      outputTokens: this.estimateTokens(text),
    };
    return {
      text,
      usage,
      provider: this.name,
      model: 'mock-model',
      latencyMs: Math.max(0, this.now() - start),
    };
  }

  estimateCostUsd(_usage: ChatUsage): number {
    return 0;
  }

  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }
}
