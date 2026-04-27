import { describe, expect, it } from 'vitest';

import { BaseProvider } from '../../../../src/ai/providers/BaseProvider';
import {
  ChatMessage,
  ChatOptions,
  ChatResult,
  ChatUsage,
  ProviderError,
} from '../../../../src/ai/providers/types';

class TestableProvider extends BaseProvider {
  readonly name = 'test';
  isConfigured() {
    return true;
  }
  async chat(_messages: ChatMessage[], _opts?: ChatOptions): Promise<ChatResult> {
    return {
      text: '',
      usage: { inputTokens: 0, outputTokens: 0 },
      provider: this.name,
      model: 'm',
      latencyMs: 0,
    };
  }
  estimateCostUsd(_u: ChatUsage) {
    return 0;
  }

  exposeRetry<T>(fn: () => Promise<T>, opts?: { maxRetries?: number; timeoutMs?: number; baseDelayMs?: number }) {
    return this.withRetry(fn, opts);
  }

  exposeClassify(err: unknown) {
    return this.classifyError(err);
  }
}

describe('BaseProvider.classifyError', () => {
  const p = new TestableProvider();
  it('classifies HTTP 401/403 as auth', () => {
    expect(p.exposeClassify({ status: 401 })).toBe('auth');
    expect(p.exposeClassify({ status: 403 })).toBe('auth');
  });
  it('classifies HTTP 429 as rate_limit', () => {
    expect(p.exposeClassify({ status: 429 })).toBe('rate_limit');
  });
  it('classifies 5xx as transient', () => {
    expect(p.exposeClassify({ status: 503 })).toBe('transient');
  });
  it('classifies 4xx (non-auth) as fatal', () => {
    expect(p.exposeClassify({ status: 404 })).toBe('fatal');
    expect(p.exposeClassify({ status: 400 })).toBe('fatal');
  });
  it('classifies timeout-named errors as timeout', () => {
    expect(p.exposeClassify({ name: 'AbortError' })).toBe('timeout');
    expect(p.exposeClassify({ message: 'request timeout' })).toBe('timeout');
    expect(p.exposeClassify({ code: 'ETIMEDOUT' })).toBe('timeout');
  });
  it('falls back to transient for unknown errors', () => {
    expect(p.exposeClassify(new Error('something exploded'))).toBe('transient');
    expect(p.exposeClassify(undefined)).toBe('transient');
  });
  it('preserves classification on existing ProviderError', () => {
    expect(p.exposeClassify(new ProviderError('x', 'auth'))).toBe('auth');
  });
});

describe('BaseProvider.withRetry', () => {
  it('succeeds without retry when fn passes', async () => {
    const p = new TestableProvider();
    let calls = 0;
    const result = await p.exposeRetry(async () => {
      calls += 1;
      return 'ok';
    });
    expect(result).toBe('ok');
    expect(calls).toBe(1);
  });

  it('retries transient failures and eventually returns', async () => {
    const p = new TestableProvider();
    let calls = 0;
    const result = await p.exposeRetry(
      async () => {
        calls += 1;
        if (calls < 3) {
          const err = new Error('transient') as Error & { status: number };
          err.status = 503;
          throw err;
        }
        return 'after-retry';
      },
      { baseDelayMs: 1, maxRetries: 3 },
    );
    expect(result).toBe('after-retry');
    expect(calls).toBe(3);
  });

  it('does not retry auth errors', async () => {
    const p = new TestableProvider();
    let calls = 0;
    await expect(
      p.exposeRetry(async () => {
        calls += 1;
        const err = new Error('unauthorized') as Error & { status: number };
        err.status = 401;
        throw err;
      }),
    ).rejects.toBeInstanceOf(ProviderError);
    expect(calls).toBe(1);
  });

  it('throws after exhausting retries', async () => {
    const p = new TestableProvider();
    let calls = 0;
    await expect(
      p.exposeRetry(
        async () => {
          calls += 1;
          throw new Error('boom');
        },
        { baseDelayMs: 1, maxRetries: 2 },
      ),
    ).rejects.toBeInstanceOf(ProviderError);
    expect(calls).toBe(3); // initial + 2 retries
  });

  it('aborts on hard timeout', async () => {
    const p = new TestableProvider();
    await expect(
      p.exposeRetry(
        () => new Promise(() => undefined), // never resolves
        { timeoutMs: 50, maxRetries: 0, baseDelayMs: 1 },
      ),
    ).rejects.toBeInstanceOf(ProviderError);
  });
});
