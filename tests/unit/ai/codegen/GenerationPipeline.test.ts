import * as crypto from 'node:crypto';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { GenerationCache } from '../../../../src/ai/codegen/GenerationCache';
import {
  GenerationFailedError,
  GenerationPipeline,
  PipelineConfig,
} from '../../../../src/ai/codegen/GenerationPipeline';
import { PromptLibrary } from '../../../../src/ai/prompts/PromptLibrary';
import { BudgetGuard } from '../../../../src/ai/providers/BudgetGuard';
import { CircuitBreaker } from '../../../../src/ai/providers/CircuitBreaker';
import { CostMeter } from '../../../../src/ai/providers/CostMeter';
import { MockProvider } from '../../../../src/ai/providers/MockProvider';
import { RateLimitTracker } from '../../../../src/ai/providers/RateLimitTracker';
import { TaskAwareRouter } from '../../../../src/ai/providers/TaskAwareRouter';

const testSchema = z.object({ code: z.string().min(1) });
type TestOut = z.infer<typeof testSchema>;

interface TestIn {
  content: string;
  name: string;
}

function makeRouter(mock: MockProvider) {
  const costMeter = new CostMeter({ filePath: path.join(os.tmpdir(), `cost-${Date.now()}.jsonl`) });
  const budgetGuard = new BudgetGuard({ costMeter, maxDailyUsd: 999 });
  const rateLimit = new RateLimitTracker({ filePath: path.join(os.tmpdir(), `rl-${Date.now()}.json`) });
  return new TaskAwareRouter('codegen', {
    providers: { 'anthropic:sonnet': mock },
    costMeter,
    budgetGuard,
    rateLimit,
  });
}

function makeConfig(
  extras: Partial<PipelineConfig<TestIn, TestOut>> = {},
): PipelineConfig<TestIn, TestOut> {
  return {
    agentName: 'test-agent',
    promptTemplate: 'html-to-fragment', // any existing template
    outputSchema: testSchema,
    inputHasher: (input) =>
      crypto.createHash('sha256').update(JSON.stringify(input)).digest('hex'),
    contextBuilder: async (input) => ({ fragmentName: input.name, dom: input.content, elements: '[]' }),
    ...extras,
  };
}

let dbPath: string;
let cache: GenerationCache;
let mock: MockProvider;

beforeEach(() => {
  CircuitBreaker.reset();
  dbPath = path.join(os.tmpdir(), `pipe-test-${Date.now()}-${Math.random()}.db`);
  cache = new GenerationCache({ dbPath, ttlDays: 1 });
  mock = new MockProvider({ fallback: JSON.stringify({ code: 'export const x = 1;' }) });
});

afterEach(() => {
  cache.close();
});

describe('GenerationPipeline', () => {
  // ── Cache hit ─────────────────────────────────────────────────────────────

  it('returns cached result without calling LLM', async () => {
    const input: TestIn = { content: '<button>Click</button>', name: 'LoginForm' };
    const config = makeConfig();
    const hash = config.inputHasher(input);
    cache.store(config.agentName, hash, { code: 'cached-code' });

    const pipeline = new GenerationPipeline(config, {
      router: makeRouter(mock),
      cache,
      prompts: new PromptLibrary(),
    });

    const result = await pipeline.run(input);
    expect(result.code).toBe('cached-code');
    expect(mock.calls).toHaveLength(0); // No LLM call
  });

  it('skips cache when skipCache=true', async () => {
    const input: TestIn = { content: '<button>Skip</button>', name: 'SkipForm' };
    const config = makeConfig();
    const hash = config.inputHasher(input);
    cache.store(config.agentName, hash, { code: 'stale-code' });

    const pipeline = new GenerationPipeline(config, {
      router: makeRouter(mock),
      cache,
      prompts: new PromptLibrary(),
    });

    const result = await pipeline.run(input, { skipCache: true });
    expect(result.code).toBe('export const x = 1;'); // Fresh from LLM
    expect(mock.calls.length).toBeGreaterThan(0);
  });

  // ── Happy path: LLM → parse ───────────────────────────────────────────────

  it('calls LLM, parses JSON, returns typed output', async () => {
    const pipeline = new GenerationPipeline(makeConfig(), {
      router: makeRouter(mock),
      cache,
      prompts: new PromptLibrary(),
    });

    const result = await pipeline.run({ content: '<form/>', name: 'TestForm' });
    expect(result.code).toBe('export const x = 1;');
  });

  it('stores result in cache after successful LLM call', async () => {
    const config = makeConfig();
    const pipeline = new GenerationPipeline(config, {
      router: makeRouter(mock),
      cache,
      prompts: new PromptLibrary(),
    });

    const input: TestIn = { content: '<form/>', name: 'CacheForm' };
    await pipeline.run(input);

    // Second call should hit cache
    await pipeline.run(input);
    expect(mock.calls).toHaveLength(1); // Only one real LLM call
  });

  // ── postValidate retry ────────────────────────────────────────────────────

  it('retries when postValidate returns errors, succeeds on 2nd attempt', async () => {
    let attempt = 0;
    const postValidate = vi.fn().mockImplementation(async () => {
      attempt += 1;
      return attempt === 1 ? ['TS2304: Cannot find name x'] : [];
    });

    const pipeline = new GenerationPipeline(makeConfig({ postValidate }), {
      router: makeRouter(mock),
      cache,
      prompts: new PromptLibrary(),
    });

    const result = await pipeline.run({ content: '<form/>', name: 'RetryForm' }, { skipCache: true });
    expect(result.code).toBe('export const x = 1;');
    expect(postValidate).toHaveBeenCalledTimes(2);
    expect(mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('throws GenerationFailedError when all retries exhausted', async () => {
    const postValidate = vi.fn().mockResolvedValue(['TS2304: error on every attempt']);

    const pipeline = new GenerationPipeline(makeConfig({ postValidate }), {
      router: makeRouter(mock),
      cache,
      prompts: new PromptLibrary(),
    });

    await expect(
      pipeline.run({ content: '<form/>', name: 'FailForm' }, { maxRetries: 1, skipCache: true }),
    ).rejects.toThrow(GenerationFailedError);
  });

  it('GenerationFailedError contains validation errors', async () => {
    const errs = ['TS error line 1', 'TS error line 2'];
    const postValidate = vi.fn().mockResolvedValue(errs);

    const pipeline = new GenerationPipeline(makeConfig({ postValidate }), {
      router: makeRouter(mock),
      cache,
      prompts: new PromptLibrary(),
    });

    let caught: unknown;
    try {
      await pipeline.run({ content: '<form/>', name: 'ErrForm' }, { maxRetries: 0, skipCache: true });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(GenerationFailedError);
    expect((caught as GenerationFailedError).validationErrors).toContain('TS error line 1');
  });

  // ── dryRun: no file writes ────────────────────────────────────────────────

  it('dryRun=true skips file writing even when outputMapper provided', async () => {
    const outputMapper = vi.fn().mockReturnValue({});
    const pipeline = new GenerationPipeline(makeConfig({ outputMapper }), {
      router: makeRouter(mock),
      cache,
      prompts: new PromptLibrary(),
    });

    await pipeline.run({ content: '<form/>', name: 'DryForm' }, { dryRun: true, skipCache: true });
    expect(outputMapper).not.toHaveBeenCalled();
  });

  it('without outputMapper no file write occurs (no error)', async () => {
    const pipeline = new GenerationPipeline(makeConfig(), {
      router: makeRouter(mock),
      cache,
      prompts: new PromptLibrary(),
    });

    // Should succeed without trying to write files
    await expect(
      pipeline.run({ content: '<form/>', name: 'NoMapperForm' }, { skipCache: true }),
    ).resolves.not.toThrow();
  });

  // ── maxRetries=0: no retries ──────────────────────────────────────────────

  it('maxRetries=0 means exactly 1 attempt, fails immediately on validation error', async () => {
    const postValidate = vi.fn().mockResolvedValue(['always-fails']);

    const pipeline = new GenerationPipeline(makeConfig({ postValidate }), {
      router: makeRouter(mock),
      cache,
      prompts: new PromptLibrary(),
    });

    await expect(
      pipeline.run({ content: '<form/>', name: 'Zero' }, { maxRetries: 0, skipCache: true }),
    ).rejects.toThrow(GenerationFailedError);
    expect(mock.calls).toHaveLength(1);
  });

  // ── LLM JSON parse failure with fix ──────────────────────────────────────

  it('fixes malformed JSON via parser llmFix: sequence mock returns bad then good', async () => {
    // Sequence mock: first call returns invalid JSON, subsequent calls return valid JSON.
    let seq = 0;
    const seqMock = new MockProvider({
      fallback: async () => {
        seq += 1;
        return seq === 1 ? 'not json at all' : JSON.stringify({ code: 'fixed-code' });
      },
    });

    const pipeline = new GenerationPipeline(makeConfig(), {
      router: makeRouter(seqMock),
      cache,
      prompts: new PromptLibrary(),
    });

    const result = await pipeline.run({ content: '<button/>', name: 'FixForm' }, { skipCache: true });
    expect(result.code).toBe('fixed-code');
    // The parser's llmFix made at least 2 calls (original + fix)
    expect(seqMock.calls.length).toBeGreaterThanOrEqual(2);
  });
});
