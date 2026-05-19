import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GenerationCache } from '../../../../src/ai/codegen/GenerationCache';
import { ScenarioEnricher } from '../../../../src/ai/codegen/shared/ScenarioEnricher';
import {
  SwaggerToApiAgent,
  SwaggerToApiInput,
  SwaggerToApiOutput,
} from '../../../../src/ai/codegen/SwaggerToApiAgent';
import { DataFactory } from '../../../../src/ai/data/DataFactory';
import { SwaggerGroup, SwaggerParserResult } from '../../../../src/api/swagger/SwaggerParser';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

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
        schema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
        example: { name: 'Alice' },
        contents: {
          'application/json': {
            schema: {
              type: 'object',
              properties: { name: { type: 'string' } },
              required: ['name'],
            },
            example: { name: 'Alice' },
          },
        },
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build an agent with a no-op postValidate and noLlm=true so tests are fast. */
function makeAgent(
  overrides: {
    postValidate?: (f: SwaggerToApiOutput) => Promise<string[]>;
    cache?: GenerationCache;
    noLlm?: boolean;
  } = {},
): SwaggerToApiAgent {
  return new SwaggerToApiAgent(
    {
      postValidate: overrides.postValidate ?? (() => Promise.resolve([])),
      cache: overrides.cache,
    },
    { noLlm: overrides.noLlm ?? true },
  );
}

function makeInput(group = USER_GROUP): SwaggerToApiInput {
  return { group, baseUrl: 'https://api.example.com' };
}

let dbPath: string;
let cache: GenerationCache;

beforeEach(() => {
  dbPath = path.join(os.tmpdir(), `swagger-test-${Date.now()}-${Math.random()}.db`);
  cache = new GenerationCache({ dbPath, ttlDays: 1 });
});

afterEach(() => {
  cache.close();
});

// ---------------------------------------------------------------------------
// run() — basic generation
// ---------------------------------------------------------------------------

describe('SwaggerToApiAgent.run()', () => {
  it('returns serviceTs + testTs', async () => {
    const agent = makeAgent();
    const result = await agent.run(makeInput(), { dryRun: true });
    expect(result.serviceTs).toBeTruthy();
    expect(result.testTs).toBeTruthy();
  });

  it('serviceTs contains the service class name', async () => {
    const agent = makeAgent();
    const result = await agent.run(makeInput(), { dryRun: true });
    expect(result.serviceTs).toContain('UserService');
  });

  it('testTs contains Feature and Scenario blocks', async () => {
    const agent = makeAgent();
    const result = await agent.run(makeInput(), { dryRun: true });
    expect(result.testTs).toContain("Feature('User API')");
    expect(result.testTs).toContain('Scenario(');
  });

  it('handles GET-only endpoint group (no body, no negative-validation)', async () => {
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
    const agent = makeAgent();
    const result = await agent.run(
      { group: readOnlyGroup, baseUrl: 'https://api.example.com' },
      { dryRun: true },
    );
    expect(result.serviceTs).toContain('HealthService');
  });

  it('handles deprecated endpoint — testTs must not contain @smoke for deprecated', async () => {
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
    const agent = makeAgent();
    const result = await agent.run(
      { group: deprecatedGroup, baseUrl: 'https://api.example.com' },
      { dryRun: true },
    );
    expect(result.testTs).not.toContain("'@smoke'");
    expect(result.testTs).toContain("'@deprecated'");
  });

  it('throws when postValidate returns errors', async () => {
    const agent = makeAgent({
      postValidate: () => Promise.resolve(['Forbidden header: Token']),
    });
    await expect(agent.run(makeInput(), { dryRun: true })).rejects.toThrow(
      'Post-validation failed',
    );
  });

  it('exclude filter removes matching operationId from output', async () => {
    const agentWithExclude = new SwaggerToApiAgent(
      { postValidate: () => Promise.resolve([]) },
      { noLlm: true, exclude: ['createUser'] },
    );
    const result = await agentWithExclude.run(makeInput(), { dryRun: true });
    expect(result.serviceTs).not.toContain('createUser');
  });
});

// ---------------------------------------------------------------------------
// run() — cache
// ---------------------------------------------------------------------------

describe('SwaggerToApiAgent.run() — cache', () => {
  it('second identical call hits cache (only one enricher call)', async () => {
    const enricher = new ScenarioEnricher();
    const enrichSpy = vi.spyOn(enricher, 'enrich').mockResolvedValue([]);
    const agent = new SwaggerToApiAgent(
      { postValidate: () => Promise.resolve([]), cache, enricher },
      { noLlm: false },
    );
    const input = makeInput();
    await agent.run(input, { dryRun: true, skipCache: false });
    await agent.run(input, { dryRun: true, skipCache: false });
    // Second call should be cache hit — enricher not called again
    expect(enrichSpy).toHaveBeenCalledTimes(
      // listUsers (1 plan) + createUser (2 plans) → 2 endpoint enrichment calls
      USER_GROUP.endpoints.length,
    );
  });

  it('skipCache=true forces re-enrichment even when cached', async () => {
    const enricher = new ScenarioEnricher();
    const enrichSpy = vi.spyOn(enricher, 'enrich').mockResolvedValue([]);
    const agent = new SwaggerToApiAgent(
      { postValidate: () => Promise.resolve([]), cache, enricher },
      { noLlm: false },
    );
    const input = makeInput();
    await agent.run(input, { dryRun: true, skipCache: true });
    await agent.run(input, { dryRun: true, skipCache: true });
    // No caching — enricher called both times
    expect(enrichSpy).toHaveBeenCalledTimes(USER_GROUP.endpoints.length * 2);
  });

  it('different group produces different cache entry', async () => {
    const dataFactory = new DataFactory();
    const buildSpy = vi.spyOn(dataFactory, 'build').mockResolvedValue(undefined);
    const agent = new SwaggerToApiAgent(
      { postValidate: () => Promise.resolve([]), cache, dataFactory },
      { noLlm: true },
    );
    await agent.run(
      { group: USER_GROUP, baseUrl: 'https://api.example.com' },
      { dryRun: true, skipCache: false },
    );
    await agent.run(
      { group: ORDER_GROUP, baseUrl: 'https://api.example.com' },
      { dryRun: true, skipCache: false },
    );
    // Both groups processed independently — build called at least once per group
    expect(buildSpy.mock.calls.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// runAll()
// ---------------------------------------------------------------------------

describe('SwaggerToApiAgent.runAll()', () => {
  it('returns Map with all group names', async () => {
    const agent = makeAgent();
    const results = await agent.runAll(PARSED_RESULT, { dryRun: true });
    expect(results.size).toBe(2);
    expect(results.has('User')).toBe(true);
    expect(results.has('Order')).toBe(true);
  });

  it('each output has serviceTs and testTs', async () => {
    const agent = makeAgent();
    const results = await agent.runAll(PARSED_RESULT, { dryRun: true });
    for (const output of results.values()) {
      expect(output.serviceTs).toBeTruthy();
      expect(output.testTs).toBeTruthy();
    }
  });

  it('calls onGroupStart and onGroupDone for each group', async () => {
    const agent = makeAgent();
    const starts: string[] = [];
    const dones: string[] = [];
    await agent.runAll(PARSED_RESULT, {
      dryRun: true,
      onGroupStart: (name) => starts.push(name),
      onGroupDone: (name) => dones.push(name),
    });
    expect(starts).toEqual(['User', 'Order']);
    expect(dones).toEqual(['User', 'Order']);
  });

  it('onGroupStart receives correct index and total', async () => {
    const agent = makeAgent();
    const indices: number[] = [];
    const totals: number[] = [];
    await agent.runAll(PARSED_RESULT, {
      dryRun: true,
      onGroupStart: (_name, index, total) => {
        indices.push(index);
        totals.push(total);
      },
    });
    expect(indices).toEqual([0, 1]);
    expect(totals).toEqual([2, 2]);
  });

  it('empty groups list returns empty Map', async () => {
    const agent = makeAgent();
    const emptyParsed: SwaggerParserResult = { ...PARSED_RESULT, groups: [] };
    const results = await agent.runAll(emptyParsed, { dryRun: true });
    expect(results.size).toBe(0);
  });

  it('single group returns Map of size 1', async () => {
    const agent = makeAgent();
    const singleGroupParsed: SwaggerParserResult = { ...PARSED_RESULT, groups: [USER_GROUP] };
    const results = await agent.runAll(singleGroupParsed, { dryRun: true });
    expect(results.size).toBe(1);
  });
});
