import {
  ChatMessage,
  ChatOptions,
  ChatResult,
  ChatUsage,
  ErrorClass,
  LLMProvider,
  ProviderError,
} from './types';

interface RetryOptions {
  maxRetries?: number;
  timeoutMs?: number;
  baseDelayMs?: number;
}

/**
 * Shared scaffolding for every concrete provider — exponential backoff with
 * jitter, hard timeouts, and a unified error classifier so the router can
 * react to failures uniformly.
 *
 * Why: Without a shared retry layer every provider would invent its own
 * (slightly different) approach to rate-limit and 5xx handling, producing
 * inconsistent telemetry and surprising failures further up the stack.
 */
export abstract class BaseProvider implements LLMProvider {
  abstract readonly name: string;
  abstract isConfigured(): boolean;
  abstract chat(messages: ChatMessage[], opts?: ChatOptions): Promise<ChatResult>;
  abstract estimateCostUsd(usage: ChatUsage): number;

  protected async withRetry<T>(
    fn: () => Promise<T>,
    opts: RetryOptions = {},
  ): Promise<T> {
    const maxRetries = opts.maxRetries ?? 3;
    const timeoutMs = opts.timeoutMs ?? 30_000;
    const baseDelay = opts.baseDelayMs ?? 1000;

    let lastErr: unknown;
    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      try {
        return await this.withTimeout(fn(), timeoutMs);
      } catch (err) {
        lastErr = err;
        const cls = this.classifyError(err);

        // Auth + fatal errors never improve with retries — fail fast.
        if (cls === 'auth' || cls === 'fatal') {
          throw this.wrap(err, cls);
        }

        if (attempt === maxRetries) {
          throw this.wrap(err, cls);
        }

        const retryAfterSec = this.extractRetryAfter(err);
        const baseWait =
          cls === 'rate_limit' && retryAfterSec
            ? retryAfterSec * 1000
            : baseDelay * 2 ** attempt;
        // ±300ms jitter to avoid thundering-herd retries from parallel workers.
        const jitter = (Math.random() - 0.5) * 600;
        const wait = Math.max(0, baseWait + jitter);
        await this.sleep(wait);
      }
    }
    throw this.wrap(lastErr, 'fatal');
  }

  protected classifyError(err: unknown): ErrorClass {
    if (err instanceof ProviderError) return err.classification;
    const e = err as { status?: number; statusCode?: number; code?: string; name?: string; message?: string };
    const status = e?.status ?? e?.statusCode;
    const message = (e?.message ?? '').toLowerCase();
    const code = (e?.code ?? '').toString();

    if (status === 401 || status === 403) return 'auth';
    if (status === 429) return 'rate_limit';
    if (status && status >= 500) return 'transient';
    if (status && status >= 400 && status < 500) return 'fatal';

    if (
      e?.name === 'AbortError' ||
      code === 'ETIMEDOUT' ||
      code === 'ESOCKETTIMEDOUT' ||
      message.includes('timeout')
    ) {
      return 'timeout';
    }
    if (code === 'ECONNRESET' || code === 'ENETUNREACH' || code === 'ECONNREFUSED') {
      return 'transient';
    }
    return 'transient';
  }

  protected extractRetryAfter(err: unknown): number | undefined {
    const e = err as { headers?: Record<string, string>; response?: { headers?: Record<string, string> } };
    const headers = e?.headers ?? e?.response?.headers;
    const raw = headers?.['retry-after'] ?? headers?.['Retry-After'];
    if (!raw) return undefined;
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
  }

  private wrap(err: unknown, cls: ErrorClass): ProviderError {
    if (err instanceof ProviderError) return err;
    const msg = err instanceof Error ? err.message : String(err);
    return new ProviderError(`[${this.name}] ${cls}: ${msg}`, cls, err);
  }

  protected async withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
    if (ms <= 0) return p;
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(new ProviderError(`[${this.name}] timeout after ${ms}ms`, 'timeout'));
      }, ms);
    });
    try {
      return await Promise.race([p, timeout]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  protected sleep(ms: number): Promise<void> {
    return new Promise((res) => setTimeout(res, ms));
  }
}
