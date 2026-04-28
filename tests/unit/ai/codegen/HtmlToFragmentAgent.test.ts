import * as crypto from 'node:crypto';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { GenerationCache } from '../../../../src/ai/codegen/GenerationCache';
import {
  GenerationFailedError,
  GenerationPipeline,
} from '../../../../src/ai/codegen/GenerationPipeline';
import {
  HtmlToFragmentAgent,
  HtmlToFragmentInput,
  HtmlToFragmentOutput,
} from '../../../../src/ai/codegen/HtmlToFragmentAgent';
import { PromptLibrary } from '../../../../src/ai/prompts/PromptLibrary';
import { BudgetGuard } from '../../../../src/ai/providers/BudgetGuard';
import { CircuitBreaker } from '../../../../src/ai/providers/CircuitBreaker';
import { CostMeter } from '../../../../src/ai/providers/CostMeter';
import { MockProvider } from '../../../../src/ai/providers/MockProvider';
import { RateLimitTracker } from '../../../../src/ai/providers/RateLimitTracker';
import { StructuredOutputParser } from '../../../../src/ai/providers/StructuredOutputParser';
import { TaskAwareRouter } from '../../../../src/ai/providers/TaskAwareRouter';

const VALID_OUTPUT = JSON.stringify({
  fragments: [
    { name: 'LoginFormFragment', fragmentTs: 'class LoginFormFragment extends BaseFragment {}' },
  ],
  pageTs: 'export class LoginPage extends BasePage {}',
  stepsTs: 'class LoginSteps {} export = new LoginSteps();',
  testTs: 'Scenario("login", () => {});',
});

const outputSchema = z.object({
  fragments: z.array(z.object({ name: z.string().min(1), fragmentTs: z.string().min(1) })).min(1),
  pageTs: z.string().min(1),
  stepsTs: z.string().min(1),
  testTs: z.string().min(1),
});

function makeRouter(mock: MockProvider) {
  const costMeter = new CostMeter({ filePath: path.join(os.tmpdir(), `cost-${Date.now()}.jsonl`) });
  const budgetGuard = new BudgetGuard({ costMeter, maxDailyUsd: 999 });
  const rateLimit = new RateLimitTracker({
    filePath: path.join(os.tmpdir(), `rl-${Date.now()}.json`),
  });
  return new TaskAwareRouter('codegen', {
    providers: { 'anthropic:sonnet': mock },
    costMeter,
    budgetGuard,
    rateLimit,
  });
}

function makePipeline(
  mock: MockProvider,
  cache: GenerationCache,
  postValidate?: (f: HtmlToFragmentOutput) => Promise<string[]>,
): GenerationPipeline<HtmlToFragmentInput, HtmlToFragmentOutput> {
  return new GenerationPipeline(
    {
      agentName: 'html-to-fragment',
      promptTemplate: 'html-to-fragment',
      outputSchema,
      inputHasher: (i) =>
        crypto.createHash('sha256').update(`${i.fragmentName}:${i.html}`).digest('hex'),
      contextBuilder: async (i) => ({
        fragmentName: i.fragmentName,
        dom: i.html,
        elements: '[]',
        segments: '[]',
        hasSegments: false,
      }),
      postValidate,
    },
    {
      router: makeRouter(mock),
      cache,
      prompts: new PromptLibrary(),
      parser: new StructuredOutputParser(),
    },
  );
}

let dbPath: string;
let cache: GenerationCache;

beforeEach(() => {
  CircuitBreaker.reset();
  dbPath = path.join(os.tmpdir(), `frag-test-${Date.now()}-${Math.random()}.db`);
  cache = new GenerationCache({ dbPath, ttlDays: 1 });
});

afterEach(() => {
  cache.close();
});

describe('HtmlToFragmentAgent', () => {
  // ── Happy path ───────────────────────────────────────────────────────────

  it('returns fragments[] + pageTs + testTs from LLM response', async () => {
    const mock = new MockProvider({ fallback: VALID_OUTPUT });
    const agent = new HtmlToFragmentAgent({ pipeline: makePipeline(mock, cache) });

    const result = await agent.run({
      html: '<button data-testid="login-btn">Login</button>',
      fragmentName: 'LoginForm',
      outputDir: path.join(os.tmpdir(), 'output'),
    });

    expect(result.fragments).toHaveLength(1);
    expect(result.fragments[0].fragmentTs).toContain('LoginFormFragment');
    expect(result.pageTs).toContain('LoginPage');
    expect(result.testTs).toBeTruthy();
  });

  it('output is stored in cache after first run', async () => {
    const mock = new MockProvider({ fallback: VALID_OUTPUT });
    const agent = new HtmlToFragmentAgent({ pipeline: makePipeline(mock, cache) });

    const input = { html: '<form/>', fragmentName: 'CacheForm', outputDir: '/tmp' };
    await agent.run(input, { skipCache: false });
    await agent.run(input, { skipCache: false });

    expect(mock.calls).toHaveLength(1); // Second call → cache hit
  });

  it('dryRun=true skips file writing even when outputMapper provided', async () => {
    const mock = new MockProvider({ fallback: VALID_OUTPUT });
    const targetFile = path.join(os.tmpdir(), `dry-fragment-${Date.now()}.ts`);

    const pipeline = new GenerationPipeline<HtmlToFragmentInput, HtmlToFragmentOutput>(
      {
        agentName: 'html-to-fragment',
        promptTemplate: 'html-to-fragment',
        outputSchema,
        inputHasher: (i) => crypto.createHash('sha256').update(JSON.stringify(i)).digest('hex'),
        contextBuilder: async (i) => ({
          fragmentName: i.fragmentName,
          dom: i.html,
          elements: '[]',
          segments: '[]',
          hasSegments: false,
        }),
        outputMapper: () => ({ [targetFile]: 'content' }),
      },
      {
        router: makeRouter(mock),
        cache,
        prompts: new PromptLibrary(),
        parser: new StructuredOutputParser(),
      },
    );

    const agent = new HtmlToFragmentAgent({ pipeline });
    await agent.run(
      { html: '<button>Go</button>', fragmentName: 'Go', outputDir: '/tmp' },
      { dryRun: true, skipCache: true },
    );

    const { existsSync } = await import('node:fs');
    expect(existsSync(targetFile)).toBe(false);
  });

  it('skipCache=true forces a fresh LLM call', async () => {
    const mock = new MockProvider({ fallback: VALID_OUTPUT });
    const agent = new HtmlToFragmentAgent({ pipeline: makePipeline(mock, cache) });

    const input = { html: '<form/>', fragmentName: 'SkipForm', outputDir: '/tmp' };
    await agent.run(input, { skipCache: false }); // populates cache
    await agent.run(input, { skipCache: true }); // bypasses cache

    expect(mock.calls).toHaveLength(2);
  });

  // ── Negative cases ────────────────────────────────────────────────────────

  it('throws GenerationFailedError when postValidate always fails', async () => {
    const mock = new MockProvider({ fallback: VALID_OUTPUT });
    const postValidate = vi.fn().mockResolvedValue(['TS2304: broken']);
    const agent = new HtmlToFragmentAgent({ pipeline: makePipeline(mock, cache, postValidate) });

    await expect(
      agent.run(
        { html: '<form/>', fragmentName: 'BadForm', outputDir: '/tmp' },
        { maxRetries: 0, skipCache: true },
      ),
    ).rejects.toThrow(GenerationFailedError);
  });

  it('retries when postValidate fails on first attempt', async () => {
    const mock = new MockProvider({ fallback: VALID_OUTPUT });
    let attempt = 0;
    const postValidate = vi.fn().mockImplementation(async () => {
      attempt += 1;
      return attempt === 1 ? ['TS2304: cannot find name'] : [];
    });

    const agent = new HtmlToFragmentAgent({ pipeline: makePipeline(mock, cache, postValidate) });
    const result = await agent.run(
      { html: '<button/>', fragmentName: 'RetryForm', outputDir: '/tmp' },
      { skipCache: true },
    );

    expect(result.fragments[0].fragmentTs).toBeTruthy();
    expect(postValidate).toHaveBeenCalledTimes(2);
    expect(mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('empty HTML runs without throwing', async () => {
    const mock = new MockProvider({ fallback: VALID_OUTPUT });
    const agent = new HtmlToFragmentAgent({ pipeline: makePipeline(mock, cache) });

    const result = await agent.run(
      { html: '', fragmentName: 'EmptyForm', outputDir: '/tmp' },
      { skipCache: true },
    );
    expect(result).toHaveProperty('fragments');
  });

  it('GenerationFailedError exposes validationErrors array', async () => {
    const mock = new MockProvider({ fallback: VALID_OUTPUT });
    const errs = ['error line 1', 'error line 2'];
    const postValidate = vi.fn().mockResolvedValue(errs);
    const agent = new HtmlToFragmentAgent({ pipeline: makePipeline(mock, cache, postValidate) });

    let caught: unknown;
    try {
      await agent.run(
        { html: '<form/>', fragmentName: 'ErrForm', outputDir: '/tmp' },
        { maxRetries: 0, skipCache: true },
      );
    } catch (e) {
      caught = e;
    }

    expect(caught).toBeInstanceOf(GenerationFailedError);
    expect((caught as GenerationFailedError).validationErrors).toContain('error line 1');
  });
});
