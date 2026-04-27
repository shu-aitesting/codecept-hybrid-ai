import * as crypto from 'node:crypto';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { GenerationCache } from '../../../../src/ai/codegen/GenerationCache';
import { GenerationFailedError, GenerationPipeline } from '../../../../src/ai/codegen/GenerationPipeline';
import {
  ScenarioGeneratorAgent,
  ScenarioGeneratorInput,
  ScenarioGeneratorOutput,
} from '../../../../src/ai/codegen/ScenarioGeneratorAgent';
import { PromptLibrary } from '../../../../src/ai/prompts/PromptLibrary';
import { BudgetGuard } from '../../../../src/ai/providers/BudgetGuard';
import { CircuitBreaker } from '../../../../src/ai/providers/CircuitBreaker';
import { CostMeter } from '../../../../src/ai/providers/CostMeter';
import { MockProvider } from '../../../../src/ai/providers/MockProvider';
import { RateLimitTracker } from '../../../../src/ai/providers/RateLimitTracker';
import { StructuredOutputParser } from '../../../../src/ai/providers/StructuredOutputParser';
import { TaskAwareRouter } from '../../../../src/ai/providers/TaskAwareRouter';

const outputSchema = z.object({
  featureFile: z.string().min(1),
  stepsTs: z.string().min(1),
});

const VALID_OUTPUT = JSON.stringify({
  featureFile: [
    'Feature: Registration',
    '',
    '  Scenario: happy path',
    '    Given I am on the page',
    '    When I submit',
    '    Then I see success',
    '',
    '  Scenario: invalid email',
    '    Given I am on the page',
    '    When I enter bad email',
    '    Then I see error',
    '',
    '  Scenario: empty password',
    '    Given I am on the page',
    '    When I leave password empty',
    '    Then I see validation',
    '',
    '  Scenario: duplicate email',
    '    Given I am on the page',
    '    When I enter existing email',
    '    Then I see already exists',
    '',
    '  Scenario: server error',
    '    Given server fails',
    '    When I submit',
    '    Then I see friendly error',
    '',
    '  Scenario: max length password',
    '    Given I am on the page',
    '    When I enter 300 char password',
    '    Then I see validation',
  ].join('\n'),
  stepsTs: 'Given("I am on the page", async () => { await I.amOnPage("/register"); });',
});

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

function makePipeline(
  mock: MockProvider,
  cache: GenerationCache,
  postValidate?: (f: ScenarioGeneratorOutput) => Promise<string[]>,
): GenerationPipeline<ScenarioGeneratorInput, ScenarioGeneratorOutput> {
  return new GenerationPipeline(
    {
      agentName: 'scenario-gen',
      promptTemplate: 'scenario-gen',
      outputSchema,
      inputHasher: (i) =>
        crypto.createHash('sha256').update(`${i.featureName}:${i.userStory}`).digest('hex'),
      contextBuilder: async (i) => ({ featureName: i.featureName, userStory: i.userStory }),
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
  dbPath = path.join(os.tmpdir(), `scen-test-${Date.now()}-${Math.random()}.db`);
  cache = new GenerationCache({ dbPath, ttlDays: 1 });
});

afterEach(() => {
  cache.close();
});

describe('ScenarioGeneratorAgent', () => {
  const STORY = 'As a user I want to register with email and password so I can login.';

  // ── Happy path ────────────────────────────────────────────────────────────

  it('returns featureFile + stepsTs', async () => {
    const mock = new MockProvider({ fallback: VALID_OUTPUT });
    const agent = new ScenarioGeneratorAgent({ pipeline: makePipeline(mock, cache) });

    const result = await agent.run({
      userStory: STORY,
      featureName: 'Registration',
      outputDir: '/tmp',
    });
    expect(result.featureFile).toContain('Feature:');
    expect(result.stepsTs).toBeTruthy();
  });

  it('featureFile has ≥6 scenarios', async () => {
    const mock = new MockProvider({ fallback: VALID_OUTPUT });
    const agent = new ScenarioGeneratorAgent({ pipeline: makePipeline(mock, cache) });

    const result = await agent.run(
      { userStory: STORY, featureName: 'Registration', outputDir: '/tmp' },
      { skipCache: true },
    );
    const scenarioCount = (result.featureFile.match(/Scenario:/g) ?? []).length;
    expect(scenarioCount).toBeGreaterThanOrEqual(6);
  });

  it('outputMapper produces kebab-case filename from PascalCase featureName', () => {
    const cases: Array<[string, string]> = [
      ['UserRegistration', 'user-registration'],
      ['LoginFlow', 'login-flow'],
      ['CheckoutPage', 'checkout-page'],
      ['simplefeature', 'simplefeature'],
    ];
    for (const [input, expected] of cases) {
      const kebab = input.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
      expect(kebab).toBe(expected);
    }
  });

  // ── Cache behaviour ───────────────────────────────────────────────────────

  it('second identical call hits cache (no LLM)', async () => {
    const mock = new MockProvider({ fallback: VALID_OUTPUT });
    const agent = new ScenarioGeneratorAgent({ pipeline: makePipeline(mock, cache) });

    const input = { userStory: STORY, featureName: 'CacheTest', outputDir: '/tmp' };
    await agent.run(input, { skipCache: false });
    await agent.run(input, { skipCache: false });

    expect(mock.calls).toHaveLength(1);
  });

  it('skipCache=true forces LLM re-call', async () => {
    const mock = new MockProvider({ fallback: VALID_OUTPUT });
    const agent = new ScenarioGeneratorAgent({ pipeline: makePipeline(mock, cache) });

    const input = { userStory: STORY, featureName: 'SkipCache', outputDir: '/tmp' };
    await agent.run(input, { skipCache: false });
    await agent.run(input, { skipCache: true });

    expect(mock.calls).toHaveLength(2);
  });

  // ── Negative cases ────────────────────────────────────────────────────────

  it('throws GenerationFailedError when postValidate always returns errors', async () => {
    const mock = new MockProvider({ fallback: VALID_OUTPUT });
    const postValidate = vi.fn().mockResolvedValue(['step not defined']);
    const agent = new ScenarioGeneratorAgent({ pipeline: makePipeline(mock, cache, postValidate) });

    await expect(
      agent.run(
        { userStory: STORY, featureName: 'FailScen', outputDir: '/tmp' },
        { maxRetries: 0, skipCache: true },
      ),
    ).rejects.toThrow(GenerationFailedError);
  });

  it('retries and succeeds when postValidate fails only on first attempt', async () => {
    const mock = new MockProvider({ fallback: VALID_OUTPUT });
    let attempt = 0;
    const postValidate = vi.fn().mockImplementation(async () => {
      attempt += 1;
      return attempt === 1 ? ['step-not-implemented'] : [];
    });

    const agent = new ScenarioGeneratorAgent({ pipeline: makePipeline(mock, cache, postValidate) });
    const result = await agent.run(
      { userStory: STORY, featureName: 'RetryScen', outputDir: '/tmp' },
      { skipCache: true },
    );

    expect(result.featureFile).toBeTruthy();
    expect(postValidate).toHaveBeenCalledTimes(2);
    expect(mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('empty user story runs without throwing', async () => {
    const mock = new MockProvider({ fallback: VALID_OUTPUT });
    const agent = new ScenarioGeneratorAgent({ pipeline: makePipeline(mock, cache) });

    await expect(
      agent.run({ userStory: '', featureName: 'EmptyStory', outputDir: '/tmp' }, { skipCache: true }),
    ).resolves.toHaveProperty('featureFile');
  });

  it('very long user story is passed through without truncation', async () => {
    const longStory = 'As a user '.repeat(500) + 'I want everything.';
    const mock = new MockProvider({ fallback: VALID_OUTPUT });
    const agent = new ScenarioGeneratorAgent({ pipeline: makePipeline(mock, cache) });

    await expect(
      agent.run({ userStory: longStory, featureName: 'LongStory', outputDir: '/tmp' }, { skipCache: true }),
    ).resolves.toHaveProperty('featureFile');
  });

  it('dryRun prevents file writing', async () => {
    const mock = new MockProvider({ fallback: VALID_OUTPUT });
    const targetFile = path.join(os.tmpdir(), `dry-scenario-${Date.now()}.feature`);

    const pipeline = new GenerationPipeline<ScenarioGeneratorInput, ScenarioGeneratorOutput>(
      {
        agentName: 'scenario-gen',
        promptTemplate: 'scenario-gen',
        outputSchema,
        inputHasher: (i) => crypto.createHash('sha256').update(JSON.stringify(i)).digest('hex'),
        contextBuilder: async (i) => ({ featureName: i.featureName, userStory: i.userStory }),
        outputMapper: () => ({ [targetFile]: 'content' }),
      },
      { router: makeRouter(mock), cache, prompts: new PromptLibrary(), parser: new StructuredOutputParser() },
    );

    const agent = new ScenarioGeneratorAgent({ pipeline });
    await agent.run(
      { userStory: 'story', featureName: 'Dry', outputDir: '/tmp' },
      { dryRun: true, skipCache: true },
    );

    const { existsSync } = await import('node:fs');
    expect(existsSync(targetFile)).toBe(false);
  });
});
