import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BudgetGuard } from '../../../../src/ai/providers/BudgetGuard';
import { CircuitBreaker } from '../../../../src/ai/providers/CircuitBreaker';
import { CostMeter } from '../../../../src/ai/providers/CostMeter';
import { MockProvider } from '../../../../src/ai/providers/MockProvider';
import { RateLimitTracker } from '../../../../src/ai/providers/RateLimitTracker';
import { TaskAwareRouter } from '../../../../src/ai/providers/TaskAwareRouter';
import {
  BudgetExceededError,
  ChatMessage,
  ChatOptions,
  ChatResult,
  LLMProvider,
  ProviderError,
} from '../../../../src/ai/providers/types';

class FailingProvider implements LLMProvider {
  readonly name: string;
  configured = true;
  constructor(name: string, configured = true) {
    this.name = name;
    this.configured = configured;
  }
  isConfigured() {
    return this.configured;
  }
  chat(_messages: ChatMessage[], _opts?: ChatOptions): Promise<ChatResult> {
    return Promise.reject(new ProviderError(`${this.name} broken`, 'transient'));
  }
  estimateCostUsd() {
    return 0;
  }
}

describe('TaskAwareRouter', () => {
  let dir: string;
  let costFile: string;
  let rateFile: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'router-'));
    costFile = path.join(dir, 'cost.jsonl');
    rateFile = path.join(dir, 'rate.json');
    CircuitBreaker.reset();
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('uses primary provider when it succeeds', async () => {
    const primary = new MockProvider({ fallback: 'ok' });
    const fallback = new MockProvider({ fallback: 'never' });
    const router = new TaskAwareRouter('heal', {
      providers: { 'anthropic:haiku': primary, cohere: fallback, g4f: fallback },
      costMeter: new CostMeter({ filePath: costFile }),
      budgetGuard: new BudgetGuard({ costMeter: new CostMeter({ filePath: costFile }), maxDailyUsd: 1 }),
      rateLimit: new RateLimitTracker({ filePath: rateFile }),
    });
    const result = await router.chat([{ role: 'user', content: 'hi' }]);
    expect(result.text).toBe('ok');
    expect(primary.calls).toHaveLength(1);
    expect(fallback.calls).toHaveLength(0);
  });

  it('falls back when primary fails', async () => {
    const primary = new FailingProvider('anthropic-fake');
    const cohere = new MockProvider({ fallback: 'cohere-ok' });
    const router = new TaskAwareRouter('heal', {
      providers: { 'anthropic:haiku': primary, cohere, g4f: new FailingProvider('g4f') },
      costMeter: new CostMeter({ filePath: costFile }),
      budgetGuard: new BudgetGuard({ costMeter: new CostMeter({ filePath: costFile }), maxDailyUsd: 1 }),
      rateLimit: new RateLimitTracker({ filePath: rateFile }),
    });
    const result = await router.chat([{ role: 'user', content: 'hi' }]);
    expect(result.text).toBe('cohere-ok');
  });

  it('skips providers that are not configured', async () => {
    class NotConfigured extends MockProvider {
      override isConfigured() {
        return false;
      }
    }
    const primary = new NotConfigured({ fallback: 'never' });
    const cohere = new MockProvider({ fallback: 'cohere-used' });
    const router = new TaskAwareRouter('heal', {
      providers: { 'anthropic:haiku': primary, cohere, g4f: new MockProvider({ fallback: 'g' }) },
      costMeter: new CostMeter({ filePath: costFile }),
      budgetGuard: new BudgetGuard({ costMeter: new CostMeter({ filePath: costFile }), maxDailyUsd: 1 }),
      rateLimit: new RateLimitTracker({ filePath: rateFile }),
    });
    const result = await router.chat([{ role: 'user', content: 'hi' }]);
    expect(result.text).toBe('cohere-used');
  });

  it('throws when every provider fails', async () => {
    const router = new TaskAwareRouter('heal', {
      providers: {
        'anthropic:haiku': new FailingProvider('a'),
        cohere: new FailingProvider('c'),
        g4f: new FailingProvider('g'),
      },
      costMeter: new CostMeter({ filePath: costFile }),
      budgetGuard: new BudgetGuard({ costMeter: new CostMeter({ filePath: costFile }), maxDailyUsd: 1 }),
      rateLimit: new RateLimitTracker({ filePath: rateFile }),
    });
    await expect(router.chat([{ role: 'user', content: 'x' }])).rejects.toBeInstanceOf(
      ProviderError,
    );
  });

  it('throws BudgetExceededError before calling any provider', async () => {
    // Pre-seed the cost ledger above the cap.
    const today = new Date().toISOString();
    fs.writeFileSync(costFile, `${JSON.stringify({ timestamp: today, costUsd: 5 })}\n`);
    const meter = new CostMeter({ filePath: costFile });
    const router = new TaskAwareRouter('heal', {
      providers: { 'anthropic:haiku': new MockProvider({ fallback: 'never' }) },
      costMeter: meter,
      budgetGuard: new BudgetGuard({ costMeter: meter, maxDailyUsd: 0.01 }),
      rateLimit: new RateLimitTracker({ filePath: rateFile }),
    });
    await expect(router.chat([{ role: 'user', content: 'x' }])).rejects.toBeInstanceOf(
      BudgetExceededError,
    );
  });

  it('marks system messages with cache=true under cacheSystem profiles', async () => {
    const recording = new MockProvider({ fallback: 'ok' });
    const spy = vi.spyOn(recording, 'chat');
    const router = new TaskAwareRouter('heal', {
      providers: { 'anthropic:haiku': recording, cohere: new MockProvider(), g4f: new MockProvider() },
      costMeter: new CostMeter({ filePath: costFile }),
      budgetGuard: new BudgetGuard({ costMeter: new CostMeter({ filePath: costFile }), maxDailyUsd: 1 }),
      rateLimit: new RateLimitTracker({ filePath: rateFile }),
    });
    await router.chat([
      { role: 'system', content: 'system rules' },
      { role: 'user', content: 'do x' },
    ]);
    const sent = spy.mock.calls[0][0];
    expect(sent[0]).toMatchObject({ role: 'system', cache: true });
    expect(sent[1]).toMatchObject({ role: 'user' });
  });

  it('logs cost entries via CostMeter on success', async () => {
    const router = new TaskAwareRouter('heal', {
      providers: { 'anthropic:haiku': new MockProvider({ fallback: 'r' }) },
      costMeter: new CostMeter({ filePath: costFile }),
      budgetGuard: new BudgetGuard({ costMeter: new CostMeter({ filePath: costFile }), maxDailyUsd: 1 }),
      rateLimit: new RateLimitTracker({ filePath: rateFile }),
    });
    await router.chat([{ role: 'user', content: 'x' }], {}, { testFile: 'x.test.ts', agentName: 'test' });
    const ledger = fs.readFileSync(costFile, 'utf8').trim().split('\n');
    expect(ledger).toHaveLength(1);
    const entry = JSON.parse(ledger[0]);
    expect(entry.provider).toBe('mock');
    expect(entry.task).toBe('heal');
    expect(entry.testFile).toBe('x.test.ts');
  });

  it('skips a provider when its circuit is open', async () => {
    const failing = new FailingProvider('anthropic-fake');
    const cohere = new MockProvider({ fallback: 'cohere-used' });
    // Manually trip the breaker for the failing provider id.
    const breaker = CircuitBreaker.for('anthropic:haiku');
    breaker.recordFailure();
    breaker.recordFailure();
    breaker.recordFailure();
    const router = new TaskAwareRouter('heal', {
      providers: { 'anthropic:haiku': failing, cohere, g4f: new MockProvider({ fallback: 'g' }) },
      costMeter: new CostMeter({ filePath: costFile }),
      budgetGuard: new BudgetGuard({ costMeter: new CostMeter({ filePath: costFile }), maxDailyUsd: 1 }),
      rateLimit: new RateLimitTracker({ filePath: rateFile }),
    });
    const result = await router.chat([{ role: 'user', content: 'x' }]);
    expect(result.text).toBe('cohere-used');
  });
});
