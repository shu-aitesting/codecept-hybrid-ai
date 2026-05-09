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
import { SwaggerToApiAgent, SwaggerToApiInput } from '../../../../src/ai/codegen/SwaggerToApiAgent';
import { PromptLibrary } from '../../../../src/ai/prompts/PromptLibrary';
import { BudgetGuard } from '../../../../src/ai/providers/BudgetGuard';
import { CircuitBreaker } from '../../../../src/ai/providers/CircuitBreaker';
import { CostMeter } from '../../../../src/ai/providers/CostMeter';
import { MockProvider } from '../../../../src/ai/providers/MockProvider';
import { RateLimitTracker } from '../../../../src/ai/providers/RateLimitTracker';
import { StructuredOutputParser } from '../../../../src/ai/providers/StructuredOutputParser';
import { TaskAwareRouter } from '../../../../src/ai/providers/TaskAwareRouter';
import { SwaggerGroup, SwaggerParserResult } from '../../../../src/api/swagger/SwaggerParser';

// ─── Valid LLM output fixture ─────────────────────────────────────────────────

const VALID_OUTPUT = JSON.stringify({
  serviceTs: "import { config } from '@core/config/ConfigLoader';\nexport class UserService {}",
  testTs:
    "Feature('User API').tag('@api').tag('@regression');\nScenario('health', async () => {}).tag('@smoke').tag('@health');",
});

const outputSchema = z.object({ serviceTs: z.string().min(1), testTs: z.string().min(1) });
type AgentOutput = z.infer<typeof outputSchema>;

// ─── Test fixtures ────────────────────────────────────────────────────────────

const USER_GROUP: SwaggerGroup = {
  groupName: 'User',
  tagSlug: 'user',
  endpoints: [
    {
      operationId: 'listUsers',
      method: 'GET',
      path: '/users',
      summary: 'List users',
      tags: ['User'],
      parameters: [],
      responses: [{ statusCode: 200, description: 'OK' }],
      deprecated: false,
    },
    {
      operationId: 'createUser',
      method: 'POST',
      path: '/users',
      summary: 'Create user',
      tags: ['User'],
      parameters: [],
      requestBody: {
        required: true,
        contentType: 'application/json',
        schema: { type: 'object' },
        example: { name: 'Alice' },
      },
      responses: [
        { statusCode: 201, description: 'Created' },
        { statusCode: 400, description: 'Bad Request' },
      ],
      deprecated: false,
    },
  ],
};

const ORDER_GROUP: SwaggerGroup = {
  groupName: 'Order',
  tagSlug: 'order',
  endpoints: [
    {
      operationId: 'listOrders',
      method: 'GET',
      path: '/orders',
      tags: ['Order'],
      parameters: [],
      responses: [{ statusCode: 200, description: 'OK' }],
      deprecated: false,
    },
  ],
};

const PARSED_RESULT: SwaggerParserResult = {
  title: 'Test API',
  version: '1.0.0',
  baseUrl: 'https://api.example.com',
  groups: [USER_GROUP, ORDER_GROUP],
  securitySchemes: {},
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
  postValidate?: (f: AgentOutput) => Promise<string[]>,
): GenerationPipeline<SwaggerToApiInput, AgentOutput> {
  const config: PipelineConfig<SwaggerToApiInput, AgentOutput> = {
    agentName: 'swagger-to-api',
    promptTemplate: 'swagger-to-api',
    outputSchema,
    inputHasher: (i) =>
      crypto
        .createHash('sha256')
        .update(`${i.group.groupName}:${JSON.stringify(i.group.endpoints)}`)
        .digest('hex'),
    contextBuilder: async (i) => ({
      groupName: i.group.groupName,
      tagSlug: i.group.tagSlug,
      baseUrl: i.baseUrl,
      endpointCount: i.group.endpoints.length,
      endpointsJson: JSON.stringify(i.group.endpoints),
      goldenServiceTs: '',
    }),
    postValidate,
  };

  return new GenerationPipeline(config, {
    router: makeRouter(mock),
    cache,
    prompts: new PromptLibrary(),
    parser: new StructuredOutputParser(),
  });
}

let dbPath: string;
let cache: GenerationCache;

beforeEach(() => {
  CircuitBreaker.reset();
  dbPath = path.join(os.tmpdir(), `swagger-test-${Date.now()}-${Math.random()}.db`);
  cache = new GenerationCache({ dbPath, ttlDays: 1 });
});

afterEach(() => {
  cache.close();
});

// ─── run() — happy path ───────────────────────────────────────────────────────

describe('SwaggerToApiAgent.run()', () => {
  it('returns serviceTs + testTs from LLM response', async () => {
    const mock = new MockProvider({ fallback: VALID_OUTPUT });
    const agent = new SwaggerToApiAgent({ pipeline: makePipeline(mock, cache) });

    const result = await agent.run({ group: USER_GROUP, baseUrl: 'https://api.example.com' });
    expect(result.serviceTs).toContain('UserService');
    expect(result.testTs).toContain('@health');
  });

  it('passes groupName and baseUrl into context', async () => {
    const mock = new MockProvider({
      fallback: async (messages) => {
        const userMsg = messages.find((m) => m.role === 'user')?.content ?? '';
        expect(userMsg).toContain('User');
        expect(userMsg).toContain('https://api.example.com');
        return VALID_OUTPUT;
      },
    });
    const agent = new SwaggerToApiAgent({ pipeline: makePipeline(mock, cache) });

    await agent.run({ group: USER_GROUP, baseUrl: 'https://api.example.com' }, { skipCache: true });
  });

  it('handles group with only GET endpoints (read-only)', async () => {
    const readOnlyGroup: SwaggerGroup = {
      groupName: 'Health',
      tagSlug: 'health',
      endpoints: [
        {
          operationId: 'getHealth',
          method: 'GET',
          path: '/health',
          tags: ['Health'],
          parameters: [],
          responses: [{ statusCode: 200, description: 'OK' }],
          deprecated: false,
        },
      ],
    };
    const mock = new MockProvider({ fallback: VALID_OUTPUT });
    const agent = new SwaggerToApiAgent({ pipeline: makePipeline(mock, cache) });

    await expect(
      agent.run({ group: readOnlyGroup, baseUrl: 'https://api.example.com' }, { skipCache: true }),
    ).resolves.toHaveProperty('serviceTs');
  });

  it('handles group with deprecated endpoints', async () => {
    const deprecatedGroup: SwaggerGroup = {
      groupName: 'Legacy',
      tagSlug: 'legacy',
      endpoints: [
        {
          operationId: 'oldEndpoint',
          method: 'GET',
          path: '/legacy',
          tags: ['Legacy'],
          parameters: [],
          responses: [{ statusCode: 200, description: 'OK' }],
          deprecated: true,
        },
      ],
    };
    const mock = new MockProvider({ fallback: VALID_OUTPUT });
    const agent = new SwaggerToApiAgent({ pipeline: makePipeline(mock, cache) });

    await expect(
      agent.run(
        { group: deprecatedGroup, baseUrl: 'https://api.example.com' },
        { skipCache: true },
      ),
    ).resolves.toHaveProperty('serviceTs');
  });

  it('handles endpoint with path parameters', async () => {
    const pathParamGroup: SwaggerGroup = {
      groupName: 'Item',
      tagSlug: 'item',
      endpoints: [
        {
          operationId: 'getItem',
          method: 'GET',
          path: '/items/{id}',
          tags: ['Item'],
          parameters: [{ name: 'id', in: 'path', required: true }],
          responses: [{ statusCode: 200, description: 'OK' }],
          deprecated: false,
        },
      ],
    };
    const mock = new MockProvider({ fallback: VALID_OUTPUT });
    const agent = new SwaggerToApiAgent({ pipeline: makePipeline(mock, cache) });

    await expect(
      agent.run({ group: pathParamGroup, baseUrl: 'https://api.example.com' }, { skipCache: true }),
    ).resolves.toHaveProperty('serviceTs');
  });
});

// ─── cache behaviour ─────────────────────────────────────────────────────────

describe('SwaggerToApiAgent.run() — cache', () => {
  it('second identical call hits cache without LLM call', async () => {
    const mock = new MockProvider({ fallback: VALID_OUTPUT });
    const agent = new SwaggerToApiAgent({ pipeline: makePipeline(mock, cache) });
    const input: SwaggerToApiInput = { group: USER_GROUP, baseUrl: 'https://api.example.com' };

    await agent.run(input, { skipCache: false });
    await agent.run(input, { skipCache: false });

    expect(mock.calls).toHaveLength(1);
  });

  it('skipCache=true forces LLM call even when cached', async () => {
    const mock = new MockProvider({ fallback: VALID_OUTPUT });
    const agent = new SwaggerToApiAgent({ pipeline: makePipeline(mock, cache) });
    const input: SwaggerToApiInput = { group: USER_GROUP, baseUrl: 'https://api.example.com' };

    await agent.run(input, { skipCache: false });
    await agent.run(input, { skipCache: true });

    expect(mock.calls).toHaveLength(2);
  });

  it('different group produces different cache key (no cross-contamination)', async () => {
    const mock = new MockProvider({ fallback: VALID_OUTPUT });
    const agent = new SwaggerToApiAgent({ pipeline: makePipeline(mock, cache) });

    await agent.run(
      { group: USER_GROUP, baseUrl: 'https://api.example.com' },
      { skipCache: false },
    );
    await agent.run(
      { group: ORDER_GROUP, baseUrl: 'https://api.example.com' },
      { skipCache: false },
    );

    // Two distinct groups → two LLM calls, no cache hit
    expect(mock.calls).toHaveLength(2);
  });
});

// ─── negative cases ───────────────────────────────────────────────────────────

describe('SwaggerToApiAgent.run() — negative', () => {
  it('throws GenerationFailedError when postValidate always fails', async () => {
    const mock = new MockProvider({ fallback: VALID_OUTPUT });
    const postValidate = vi.fn().mockResolvedValue(['TS2304: Cannot find name']);
    const agent = new SwaggerToApiAgent({ pipeline: makePipeline(mock, cache, postValidate) });

    await expect(
      agent.run(
        { group: USER_GROUP, baseUrl: 'https://api.example.com' },
        { maxRetries: 0, skipCache: true },
      ),
    ).rejects.toThrow(GenerationFailedError);
  });

  it('retries once when postValidate fails on first attempt', async () => {
    const mock = new MockProvider({ fallback: VALID_OUTPUT });
    let attempt = 0;
    const postValidate = vi.fn().mockImplementation(async () => {
      attempt += 1;
      return attempt === 1 ? ['first-attempt-ts-error'] : [];
    });

    const agent = new SwaggerToApiAgent({ pipeline: makePipeline(mock, cache, postValidate) });
    const result = await agent.run(
      { group: USER_GROUP, baseUrl: 'https://api.example.com' },
      { skipCache: true },
    );

    expect(result.serviceTs).toBeTruthy();
    expect(mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('dryRun prevents file writing', async () => {
    const targetFile = path.join(os.tmpdir(), `dry-swagger-${Date.now()}.ts`);
    const mock = new MockProvider({ fallback: VALID_OUTPUT });

    const pipeline = new GenerationPipeline<SwaggerToApiInput, AgentOutput>(
      {
        agentName: 'swagger-to-api',
        promptTemplate: 'swagger-to-api',
        outputSchema,
        inputHasher: (i) =>
          crypto.createHash('sha256').update(JSON.stringify(i.group.groupName)).digest('hex'),
        contextBuilder: async (i) => ({
          groupName: i.group.groupName,
          tagSlug: i.group.tagSlug,
          baseUrl: i.baseUrl,
          endpointCount: i.group.endpoints.length,
          endpointsJson: '[]',
          goldenServiceTs: '',
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

    const agent = new SwaggerToApiAgent({ pipeline });
    await agent.run(
      { group: USER_GROUP, baseUrl: 'https://api.example.com' },
      { dryRun: true, skipCache: true },
    );

    const { existsSync } = await import('node:fs');
    expect(existsSync(targetFile)).toBe(false);
  });
});

// ─── runAll() ─────────────────────────────────────────────────────────────────

describe('SwaggerToApiAgent.runAll()', () => {
  it('runs pipeline for all groups and returns Map with all group names', async () => {
    const mock = new MockProvider({ fallback: VALID_OUTPUT });
    const agent = new SwaggerToApiAgent({ pipeline: makePipeline(mock, cache) });

    const results = await agent.runAll(PARSED_RESULT, { skipCache: true });

    expect(results.size).toBe(2);
    expect(results.has('User')).toBe(true);
    expect(results.has('Order')).toBe(true);
  });

  it('makes one LLM call per group (sequential)', async () => {
    const mock = new MockProvider({ fallback: VALID_OUTPUT });
    const agent = new SwaggerToApiAgent({ pipeline: makePipeline(mock, cache) });

    await agent.runAll(PARSED_RESULT, { skipCache: true });

    // 2 groups → 2 LLM calls
    expect(mock.calls).toHaveLength(2);
  });

  it('calls onGroupStart and onGroupDone callbacks for each group', async () => {
    const mock = new MockProvider({ fallback: VALID_OUTPUT });
    const agent = new SwaggerToApiAgent({ pipeline: makePipeline(mock, cache) });

    const starts: string[] = [];
    const dones: string[] = [];

    await agent.runAll(PARSED_RESULT, {
      skipCache: true,
      onGroupStart: (name) => starts.push(name),
      onGroupDone: (name) => dones.push(name),
    });

    expect(starts).toEqual(['User', 'Order']);
    expect(dones).toEqual(['User', 'Order']);
  });

  it('onGroupStart receives correct index and total', async () => {
    const mock = new MockProvider({ fallback: VALID_OUTPUT });
    const agent = new SwaggerToApiAgent({ pipeline: makePipeline(mock, cache) });

    const indices: number[] = [];
    const totals: number[] = [];

    await agent.runAll(PARSED_RESULT, {
      skipCache: true,
      onGroupStart: (_name, index, total) => {
        indices.push(index);
        totals.push(total);
      },
    });

    expect(indices).toEqual([0, 1]);
    expect(totals).toEqual([2, 2]);
  });

  it('returns outputs that each have serviceTs and testTs', async () => {
    const mock = new MockProvider({ fallback: VALID_OUTPUT });
    const agent = new SwaggerToApiAgent({ pipeline: makePipeline(mock, cache) });

    const results = await agent.runAll(PARSED_RESULT, { skipCache: true });

    for (const [, output] of results) {
      expect(output.serviceTs).toBeTruthy();
      expect(output.testTs).toBeTruthy();
    }
  });

  it('runAll with single group returns Map of size 1', async () => {
    const mock = new MockProvider({ fallback: VALID_OUTPUT });
    const agent = new SwaggerToApiAgent({ pipeline: makePipeline(mock, cache) });

    const singleGroupParsed: SwaggerParserResult = {
      ...PARSED_RESULT,
      groups: [USER_GROUP],
    };

    const results = await agent.runAll(singleGroupParsed, { skipCache: true });
    expect(results.size).toBe(1);
    expect(mock.calls).toHaveLength(1);
  });

  it('runAll with empty groups returns empty Map', async () => {
    const mock = new MockProvider({ fallback: VALID_OUTPUT });
    const agent = new SwaggerToApiAgent({ pipeline: makePipeline(mock, cache) });

    const emptyParsed: SwaggerParserResult = { ...PARSED_RESULT, groups: [] };
    const results = await agent.runAll(emptyParsed, { skipCache: true });

    expect(results.size).toBe(0);
    expect(mock.calls).toHaveLength(0);
  });

  it('cache hit prevents duplicate LLM calls across runAll invocations', async () => {
    const mock = new MockProvider({ fallback: VALID_OUTPUT });
    const agent = new SwaggerToApiAgent({ pipeline: makePipeline(mock, cache) });

    // First run: 2 LLM calls
    await agent.runAll(PARSED_RESULT, { skipCache: false });
    // Second run: 0 LLM calls (all cached)
    await agent.runAll(PARSED_RESULT, { skipCache: false });

    expect(mock.calls).toHaveLength(2);
  });
});
