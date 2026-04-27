import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { HealTelemetry } from '../../../../src/ai/heal/HealTelemetry';
import { LocatorRepository } from '../../../../src/ai/heal/LocatorRepository';
import { PageLike, SelfHealEngine } from '../../../../src/ai/heal/SelfHealEngine';
import { PromptLibrary } from '../../../../src/ai/prompts/PromptLibrary';
import { BudgetGuard } from '../../../../src/ai/providers/BudgetGuard';
import { CircuitBreaker } from '../../../../src/ai/providers/CircuitBreaker';
import { CostMeter } from '../../../../src/ai/providers/CostMeter';
import { MockProvider } from '../../../../src/ai/providers/MockProvider';
import { RateLimitTracker } from '../../../../src/ai/providers/RateLimitTracker';
import { TaskAwareRouter } from '../../../../src/ai/providers/TaskAwareRouter';

interface FakePageOpts {
  html: string;
  /** selectors that should resolve to count=1; everything else resolves to 0. */
  uniqueSelectors?: string[];
  /** selectors that should resolve to count>1 (ambiguous). */
  ambiguousSelectors?: string[];
}

function fakePage(opts: FakePageOpts): PageLike {
  return {
    content: async () => opts.html,
    locator: (selector: string) => ({
      count: async () => {
        if (opts.uniqueSelectors?.includes(selector)) return 1;
        if (opts.ambiguousSelectors?.includes(selector)) return 2;
        return 0;
      },
    }),
  };
}

function makeRouter(provider: MockProvider, dir: string) {
  return new TaskAwareRouter('heal', {
    providers: {
      'anthropic:haiku': provider,
      cohere: new MockProvider(),
      g4f: new MockProvider(),
    },
    costMeter: new CostMeter({ filePath: path.join(dir, 'cost.jsonl') }),
    budgetGuard: new BudgetGuard({
      costMeter: new CostMeter({ filePath: path.join(dir, 'cost.jsonl') }),
      maxDailyUsd: 10,
    }),
    rateLimit: new RateLimitTracker({ filePath: path.join(dir, 'rate.json') }),
  });
}

function promptLib(): PromptLibrary {
  return new PromptLibrary({
    promptDir: path.resolve(__dirname, '..', '..', '..', '..', 'config', 'ai', 'prompts'),
  });
}

describe('SelfHealEngine', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'heal-engine-'));
    CircuitBreaker.reset();
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('returns a verified candidate when LLM proposes valid selectors', async () => {
    const provider = new MockProvider({
      fallback: '{"candidates":["[data-testid=\\"login\\"]","button:has-text(\\"X\\")"]}',
    });
    const repo = new LocatorRepository({ dbPath: path.join(dir, 'h.db') });
    const telemetry = new HealTelemetry({ filePath: path.join(dir, 'events.jsonl') });
    const engine = new SelfHealEngine({
      router: makeRouter(provider, dir),
      repository: repo,
      promptLibrary: promptLib(),
      telemetry,
    });
    const result = await engine.heal({
      testFile: 't.test.ts',
      step: 'I.click',
      locator: '#old',
      error: 'no element',
      page: fakePage({
        html: '<button data-testid="login">X</button>',
        uniqueSelectors: ['[data-testid="login"]'],
      }),
    });
    expect(result.healedSelector).toBe('[data-testid="login"]');
    expect(result.fromCache).toBe(false);
    const events = telemetry.readAll();
    expect(events).toHaveLength(1);
    expect(events[0].success).toBe(true);
    repo.close();
  });

  it('rejects hallucinated selectors that match zero elements', async () => {
    const provider = new MockProvider({
      fallback: '{"candidates":["#does-not-exist", "#also-fake"]}',
    });
    const repo = new LocatorRepository({ dbPath: path.join(dir, 'h.db') });
    const telemetry = new HealTelemetry({ filePath: path.join(dir, 'events.jsonl') });
    const engine = new SelfHealEngine({
      router: makeRouter(provider, dir),
      repository: repo,
      promptLibrary: promptLib(),
      telemetry,
    });
    const result = await engine.heal({
      testFile: 't.test.ts',
      step: 'I.click',
      locator: '#old',
      error: 'no element',
      page: fakePage({ html: '<button data-testid="real">X</button>' }),
    });
    expect(result.healedSelector).toBeNull();
    expect(result.reason).toBe('no-unique-candidate');
    const events = telemetry.readAll();
    expect(events[0].success).toBe(false);
    repo.close();
  });

  it('skips ambiguous candidates (count > 1) and tries the next', async () => {
    const provider = new MockProvider({
      fallback: '{"candidates":["button","[data-testid=\\"unique\\"]"]}',
    });
    const repo = new LocatorRepository({ dbPath: path.join(dir, 'h.db') });
    const engine = new SelfHealEngine({
      router: makeRouter(provider, dir),
      repository: repo,
      promptLibrary: promptLib(),
      telemetry: new HealTelemetry({ filePath: path.join(dir, 'events.jsonl') }),
    });
    const result = await engine.heal({
      testFile: 't.test.ts',
      step: 'I.click',
      locator: '#old',
      error: 'x',
      page: fakePage({
        html: '<button>a</button><button>b</button><button data-testid="unique">c</button>',
        ambiguousSelectors: ['button'],
        uniqueSelectors: ['[data-testid="unique"]'],
      }),
    });
    expect(result.healedSelector).toBe('[data-testid="unique"]');
    repo.close();
  });

  it('serves a cache hit without calling LLM', async () => {
    const provider = new MockProvider();
    const llmSpy = vi.spyOn(provider, 'chat');
    const repo = new LocatorRepository({ dbPath: path.join(dir, 'h.db') });
    repo.record('t.test.ts', '#old', '#cached', true);
    repo.record('t.test.ts', '#old', '#cached', true);
    const engine = new SelfHealEngine({
      router: makeRouter(provider, dir),
      repository: repo,
      promptLibrary: promptLib(),
      telemetry: new HealTelemetry({ filePath: path.join(dir, 'events.jsonl') }),
    });
    const result = await engine.heal({
      testFile: 't.test.ts',
      step: 'I.click',
      locator: '#old',
      error: 'x',
      page: fakePage({
        html: '<a id="cached">x</a>',
        uniqueSelectors: ['#cached'],
      }),
    });
    expect(result.fromCache).toBe(true);
    expect(result.healedSelector).toBe('#cached');
    expect(llmSpy).not.toHaveBeenCalled();
    repo.close();
  });

  it('falls back to LLM if cache hit is no longer unique on the page', async () => {
    const provider = new MockProvider({
      fallback: '{"candidates":["#fresh"]}',
    });
    const repo = new LocatorRepository({ dbPath: path.join(dir, 'h.db') });
    repo.record('t.test.ts', '#old', '#stale', true);
    repo.record('t.test.ts', '#old', '#stale', true);
    const engine = new SelfHealEngine({
      router: makeRouter(provider, dir),
      repository: repo,
      promptLibrary: promptLib(),
      telemetry: new HealTelemetry({ filePath: path.join(dir, 'events.jsonl') }),
    });
    const result = await engine.heal({
      testFile: 't.test.ts',
      step: 'I.click',
      locator: '#old',
      error: 'x',
      // The cached selector resolves to 0 in DOM → triggers LLM fallback.
      page: fakePage({ html: '<a id="fresh">x</a>', uniqueSelectors: ['#fresh'] }),
    });
    expect(result.fromCache).toBe(false);
    expect(result.healedSelector).toBe('#fresh');
    repo.close();
  });

  it('aborts and reports dom-too-large when sanitized html exceeds budget', async () => {
    const repo = new LocatorRepository({ dbPath: path.join(dir, 'h.db') });
    const engine = new SelfHealEngine({
      router: makeRouter(new MockProvider({ fallback: '{"candidates":["#x"]}' }), dir),
      repository: repo,
      promptLibrary: promptLib(),
      telemetry: new HealTelemetry({ filePath: path.join(dir, 'events.jsonl') }),
      maxTokens: 50,
    });
    const huge = '<html><body>' + '<div>x</div>'.repeat(2000) + '</body></html>';
    const result = await engine.heal({
      testFile: 't.test.ts',
      step: 'I.click',
      locator: '#old',
      error: 'x',
      page: fakePage({ html: huge }),
    });
    expect(result.healedSelector).toBeNull();
    expect(result.reason).toBe('dom-too-large');
    repo.close();
  });

  it('handles LLM returning malformed JSON gracefully', async () => {
    const provider = new MockProvider({ fallback: 'not json at all' });
    const repo = new LocatorRepository({ dbPath: path.join(dir, 'h.db') });
    const engine = new SelfHealEngine({
      router: makeRouter(provider, dir),
      repository: repo,
      promptLibrary: promptLib(),
      telemetry: new HealTelemetry({ filePath: path.join(dir, 'events.jsonl') }),
    });
    const result = await engine.heal({
      testFile: 't.test.ts',
      step: 'I.click',
      locator: '#old',
      error: 'x',
      page: fakePage({ html: '<button>x</button>' }),
    });
    expect(result.healedSelector).toBeNull();
    expect(result.reason).toBeTruthy();
    repo.close();
  });

  it('records sanitized dom bytes so dashboards can compute reduction', async () => {
    const provider = new MockProvider({
      fallback: '{"candidates":["[data-testid=\\"login\\"]"]}',
    });
    const repo = new LocatorRepository({ dbPath: path.join(dir, 'h.db') });
    const engine = new SelfHealEngine({
      router: makeRouter(provider, dir),
      repository: repo,
      promptLibrary: promptLib(),
      telemetry: new HealTelemetry({ filePath: path.join(dir, 'events.jsonl') }),
    });
    const html = '<html><body><script>x()</script><div><button data-testid="login">x</button></div></body></html>';
    const result = await engine.heal({
      testFile: 't.test.ts',
      step: 'I.click',
      locator: '#old',
      error: 'x',
      page: fakePage({ html, uniqueSelectors: ['[data-testid="login"]'] }),
    });
    expect(result.sanitizedDomBytes).toBeGreaterThan(0);
    expect(result.sanitizedDomBytes).toBeLessThan(html.length);
    repo.close();
  });
});
