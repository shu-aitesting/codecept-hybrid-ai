import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import type { OpenAPIObject } from 'openapi3-ts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { GenerationCache } from '../../../../src/ai/codegen/GenerationCache';
import { GenerationPipeline } from '../../../../src/ai/codegen/GenerationPipeline';
import { OpenApiSuiteAgent } from '../../../../src/ai/codegen/OpenApiSuiteAgent';
import { PromptLibrary } from '../../../../src/ai/prompts/PromptLibrary';
import { BudgetGuard } from '../../../../src/ai/providers/BudgetGuard';
import { CircuitBreaker } from '../../../../src/ai/providers/CircuitBreaker';
import { CostMeter } from '../../../../src/ai/providers/CostMeter';
import { MockProvider } from '../../../../src/ai/providers/MockProvider';
import { RateLimitTracker } from '../../../../src/ai/providers/RateLimitTracker';
import { StructuredOutputParser } from '../../../../src/ai/providers/StructuredOutputParser';
import { TaskAwareRouter } from '../../../../src/ai/providers/TaskAwareRouter';

// ─── fixture helpers ──────────────────────────────────────────────────────────

function loadFixture(name: string): OpenAPIObject {
  const p = path.join(__dirname, '../../fixtures/openapi', name);
  return JSON.parse(fs.readFileSync(p, 'utf8')) as OpenAPIObject;
}

const multiTagSpec = loadFixture('petstore-multi-tag.json');

// ─── mock helpers ─────────────────────────────────────────────────────────────

const tagOutputSchema = z.object({
  operations: z.array(
    z.object({
      operationId: z.string(),
      scenarios: z.array(
        z.object({
          name: z.string(),
          type: z.enum(['happy', 'schema', 'sla', 'array', '404', '400', '401']),
          body: z.string(),
        }),
      ),
    }),
  ),
  testTs: z.string().min(1),
});

type TagOutput = z.infer<typeof tagOutputSchema>;

function makeTagOutput(tag: string): TagOutput {
  return {
    operations: [
      {
        operationId: `list${tag}`,
        scenarios: [{ name: 'lists items', type: 'happy', body: '// happy' }],
      },
    ],
    testTs: `Feature('${tag} API');\nScenario('lists', async () => { /* stub */ });`,
  };
}

function makeRouter(mock: MockProvider, tmpDir: string): TaskAwareRouter {
  const costMeter = new CostMeter({ filePath: path.join(tmpDir, `cost-${Date.now()}.jsonl`) });
  const budgetGuard = new BudgetGuard({ costMeter, maxDailyUsd: 999 });
  const rateLimit = new RateLimitTracker({ filePath: path.join(tmpDir, `rl-${Date.now()}.json`) });
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
  tmpDir: string,
): GenerationPipeline<
  { tag: string; operations: unknown[]; schemasImportPath: string },
  TagOutput
> {
  return new GenerationPipeline(
    {
      agentName: 'openapi-test-suite',
      promptTemplate: 'openapi-test-suite',
      outputSchema: tagOutputSchema,
      inputHasher: (i) =>
        crypto
          .createHash('sha256')
          .update(i.tag + JSON.stringify(i.operations))
          .digest('hex'),
      contextBuilder: async (i) => ({
        tag: i.tag,
        serviceClass: i.tag + 'Service',
        schemasImport: i.schemasImportPath,
        operationsSummary: 'op summary',
      }),
    },
    {
      router: makeRouter(mock, tmpDir),
      cache,
      prompts: new PromptLibrary(),
      parser: new StructuredOutputParser(),
    },
  );
}

// ─── setup ────────────────────────────────────────────────────────────────────

let tempDir: string;
let cache: GenerationCache;

beforeEach(() => {
  CircuitBreaker.reset();
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'suite-agent-test-'));
  cache = new GenerationCache({
    dbPath: path.join(tempDir, 'cache.db'),
    ttlDays: 1,
  });
});

afterEach(() => {
  cache.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

// ─── happy path ───────────────────────────────────────────────────────────────

describe('OpenApiSuiteAgent.run() — happy path', () => {
  it('returns one SuiteResult per tag in the spec', async () => {
    const mock = new MockProvider({
      fallback: (_msgs) => JSON.stringify(makeTagOutput('pets')),
    });
    const pipeline = makePipeline(mock, cache, tempDir);
    const agent = new OpenApiSuiteAgent({ pipeline });

    const results = await agent.run(
      { openApiDoc: multiTagSpec, outServices: tempDir, outTests: tempDir },
      { skipCache: true, dryRun: true },
    );

    // multiTagSpec has 3 tags: pets, users, admin
    expect(results.length).toBe(3);
  });

  it('each result includes tag, serviceTs, testTs', async () => {
    const mock = new MockProvider({
      fallback: (msgs) => {
        // detect which tag from prompt context
        const content = msgs[msgs.length - 1]?.content ?? '';
        const tag = /Tag: (\w+)/.exec(content)?.[1] ?? 'unknown';
        return JSON.stringify(makeTagOutput(tag));
      },
    });
    const pipeline = makePipeline(mock, cache, tempDir);
    const agent = new OpenApiSuiteAgent({ pipeline });

    const results = await agent.run(
      { openApiDoc: multiTagSpec, outServices: tempDir, outTests: tempDir },
      { skipCache: true, dryRun: true },
    );

    for (const r of results) {
      expect(r.tag).toBeTruthy();
      expect(r.serviceTs).toContain('Service');
      expect(r.testTs).toContain('Feature');
    }
  });

  it('serviceTs contains method names derived from operations', async () => {
    const mock = new MockProvider({ fallback: () => JSON.stringify(makeTagOutput('pets')) });
    const pipeline = makePipeline(mock, cache, tempDir);
    const agent = new OpenApiSuiteAgent({ pipeline });

    const results = await agent.run(
      {
        openApiDoc: multiTagSpec,
        outServices: tempDir,
        outTests: tempDir,
        filterOpts: { tags: ['pets'] },
      },
      { skipCache: true, dryRun: true },
    );

    const petsResult = results.find((r) => r.tag === 'pets');
    expect(petsResult?.serviceTs).toContain('PetsService');
    expect(petsResult?.serviceTs).toContain('listPets');
  });
});

// ─── filter opts ─────────────────────────────────────────────────────────────

describe('OpenApiSuiteAgent.run() — filter opts', () => {
  it('--tags filter limits results to matching tags only', async () => {
    const mock = new MockProvider({ fallback: () => JSON.stringify(makeTagOutput('users')) });
    const pipeline = makePipeline(mock, cache, tempDir);
    const agent = new OpenApiSuiteAgent({ pipeline });

    const results = await agent.run(
      {
        openApiDoc: multiTagSpec,
        outServices: tempDir,
        outTests: tempDir,
        filterOpts: { tags: ['users'] },
      },
      { skipCache: true, dryRun: true },
    );

    expect(results).toHaveLength(1);
    expect(results[0].tag).toBe('users');
  });

  it('--exclude-deprecated removes deprecated operations from service', async () => {
    const mock = new MockProvider({ fallback: () => JSON.stringify(makeTagOutput('pets')) });
    const pipeline = makePipeline(mock, cache, tempDir);
    const agent = new OpenApiSuiteAgent({ pipeline });

    const results = await agent.run(
      {
        openApiDoc: multiTagSpec,
        outServices: tempDir,
        outTests: tempDir,
        filterOpts: { tags: ['pets'], excludeDeprecated: true },
      },
      { skipCache: true, dryRun: true },
    );

    const petsResult = results.find((r) => r.tag === 'pets');
    // deletePet is deprecated — should not appear in service
    expect(petsResult?.serviceTs).not.toContain('deletePet');
  });
});

// ─── dryRun ───────────────────────────────────────────────────────────────────

describe('OpenApiSuiteAgent.run() — dryRun: true', () => {
  it('does not write service files to disk when dryRun', async () => {
    const mock = new MockProvider({ fallback: () => JSON.stringify(makeTagOutput('users')) });
    const pipeline = makePipeline(mock, cache, tempDir);
    const agent = new OpenApiSuiteAgent({ pipeline });

    await agent.run(
      {
        openApiDoc: multiTagSpec,
        outServices: path.join(tempDir, 'services'),
        outTests: path.join(tempDir, 'tests'),
        filterOpts: { tags: ['users'] },
      },
      { skipCache: true, dryRun: true },
    );

    expect(fs.existsSync(path.join(tempDir, 'services'))).toBe(false);
  });
});

// ─── file writing ─────────────────────────────────────────────────────────────

describe('OpenApiSuiteAgent.run() — file writing', () => {
  it('writes service file to outServices directory when not dryRun', async () => {
    const mock = new MockProvider({ fallback: () => JSON.stringify(makeTagOutput('users')) });
    const pipeline = makePipeline(mock, cache, tempDir);
    const agent = new OpenApiSuiteAgent({ pipeline });

    await agent.run(
      {
        openApiDoc: multiTagSpec,
        outServices: path.join(tempDir, 'services'),
        outTests: path.join(tempDir, 'tests'),
        filterOpts: { tags: ['users'] },
      },
      { skipCache: true, dryRun: false },
    );

    expect(fs.existsSync(path.join(tempDir, 'services', 'UsersService.ts'))).toBe(true);
  });
});

// ─── cache behaviour ─────────────────────────────────────────────────────────

describe('OpenApiSuiteAgent.run() — caching', () => {
  it('second call for same tag hits cache — LLM not called again', async () => {
    const mock = new MockProvider({ fallback: () => JSON.stringify(makeTagOutput('users')) });
    const pipeline = makePipeline(mock, cache, tempDir);
    const agent = new OpenApiSuiteAgent({ pipeline });

    const input = {
      openApiDoc: multiTagSpec,
      outServices: tempDir,
      outTests: tempDir,
      filterOpts: { tags: ['users'] },
    };

    await agent.run(input, { skipCache: false, dryRun: true });
    const callsAfterFirst = mock.calls.length;

    await agent.run(input, { skipCache: false, dryRun: true });
    expect(mock.calls.length).toBe(callsAfterFirst);
  });
});

// ─── empty spec ───────────────────────────────────────────────────────────────

describe('OpenApiSuiteAgent.run() — edge cases', () => {
  it('returns empty array for spec with no paths', async () => {
    const emptySpec: OpenAPIObject = {
      openapi: '3.0.3',
      info: { title: 'T', version: '1' },
      paths: {},
    };
    const mock = new MockProvider({ fallback: () => JSON.stringify(makeTagOutput('default')) });
    const pipeline = makePipeline(mock, cache, tempDir);
    const agent = new OpenApiSuiteAgent({ pipeline });

    const results = await agent.run(
      { openApiDoc: emptySpec, outServices: tempDir, outTests: tempDir },
      { skipCache: true, dryRun: true },
    );

    expect(results).toHaveLength(0);
  });

  it('no-match tag filter returns empty results', async () => {
    const mock = new MockProvider({ fallback: () => JSON.stringify(makeTagOutput('ghost')) });
    const pipeline = makePipeline(mock, cache, tempDir);
    const agent = new OpenApiSuiteAgent({ pipeline });

    const results = await agent.run(
      {
        openApiDoc: multiTagSpec,
        outServices: tempDir,
        outTests: tempDir,
        filterOpts: { tags: ['nonexistent'] },
      },
      { skipCache: true, dryRun: true },
    );

    expect(results).toHaveLength(0);
  });
});
