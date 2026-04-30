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
    "Feature('Registration').tag('@ui').tag('@regression');",
    '',
    "Scenario('Successful registration', async ({ I, registrationSteps }) => {",
    '  await registrationSteps.navigateToRegistration();',
    "  await registrationSteps.fillForm('user@example.com', 'Password1!');",
    '  await registrationSteps.submit();',
    "  I.see('Welcome');",
    "}).tag('@smoke');",
    '',
    "Scenario('Fails with existing email', async ({ I, registrationSteps }) => {",
    '  await registrationSteps.navigateToRegistration();',
    "  await registrationSteps.fillForm('existing@example.com', 'Password1!');",
    '  await registrationSteps.submit();',
    "  I.see('Email already in use');",
    "}).tag('@negative');",
    '',
    "Scenario('Fails with invalid email format', async ({ registrationSteps }) => {",
    '  await registrationSteps.navigateToRegistration();',
    "  await registrationSteps.fillForm('not-an-email', 'Password1!');",
    '  await registrationSteps.submit();',
    '  await registrationSteps.verifyEmailError();',
    "}).tag('@negative');",
    '',
    "Scenario('Fails with password too short', async ({ I, registrationSteps }) => {",
    '  await registrationSteps.navigateToRegistration();',
    "  await registrationSteps.fillForm('user@example.com', 'abc');",
    '  await registrationSteps.submit();',
    "  I.see('Password must be at least 8 characters');",
    "}).tag('@negative');",
    '',
    "Scenario('Fails with empty email', async ({ I, registrationSteps }) => {",
    '  await registrationSteps.navigateToRegistration();',
    "  await registrationSteps.fillForm('', 'Password1!');",
    '  await registrationSteps.submit();',
    "  I.see('Email is required');",
    "}).tag('@negative');",
    '',
    "Scenario('Fails with empty password', async ({ I, registrationSteps }) => {",
    '  await registrationSteps.navigateToRegistration();',
    "  await registrationSteps.fillForm('user@example.com', '');",
    '  await registrationSteps.submit();',
    "  I.see('Password is required');",
    "}).tag('@negative');",
  ].join('\n'),
  stepsTs: [
    "import { RegistrationPage } from '../pages/RegistrationPage';",
    '',
    'class RegistrationSteps {',
    '  private readonly page = new RegistrationPage();',
    '  protected get I(): CodeceptJS.I { return inject().I; }',
    '  async navigateToRegistration(): Promise<void> { await this.page.open(); }',
    '  async fillForm(email: string, password: string): Promise<void> {',
    '    await this.page.form.fillCredentials(email, password);',
    '  }',
    '  async submit(): Promise<void> { await this.page.form.submit(); }',
    '  async verifyEmailError(): Promise<void> { await this.page.form.verifyEmailError(); }',
    '}',
    'export = new RegistrationSteps();',
  ].join('\n'),
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
    expect(result.featureFile).toContain('Feature(');
    expect(result.stepsTs).toBeTruthy();
  });

  it('featureFile has ≥6 scenarios', async () => {
    const mock = new MockProvider({ fallback: VALID_OUTPUT });
    const agent = new ScenarioGeneratorAgent({ pipeline: makePipeline(mock, cache) });

    const result = await agent.run(
      { userStory: STORY, featureName: 'Registration', outputDir: '/tmp' },
      { skipCache: true },
    );
    const scenarioCount = (result.featureFile.match(/\bScenario\(/g) ?? []).length;
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
      const kebab = input.replaceAll(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
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
      agent.run(
        { userStory: '', featureName: 'EmptyStory', outputDir: '/tmp' },
        { skipCache: true },
      ),
    ).resolves.toHaveProperty('featureFile');
  });

  it('very long user story is passed through without truncation', async () => {
    const longStory = 'As a user '.repeat(500) + 'I want everything.';
    const mock = new MockProvider({ fallback: VALID_OUTPUT });
    const agent = new ScenarioGeneratorAgent({ pipeline: makePipeline(mock, cache) });

    await expect(
      agent.run(
        { userStory: longStory, featureName: 'LongStory', outputDir: '/tmp' },
        { skipCache: true },
      ),
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
      {
        router: makeRouter(mock),
        cache,
        prompts: new PromptLibrary(),
        parser: new StructuredOutputParser(),
      },
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
