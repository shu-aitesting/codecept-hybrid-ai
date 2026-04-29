import * as crypto from 'node:crypto';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import {
  CurlToApiAgent,
  CurlToApiInput,
  CurlToApiOutput,
} from '../../../../src/ai/codegen/CurlToApiAgent';
import { GenerationCache } from '../../../../src/ai/codegen/GenerationCache';
import {
  GenerationFailedError,
  GenerationPipeline,
} from '../../../../src/ai/codegen/GenerationPipeline';
import { PromptLibrary } from '../../../../src/ai/prompts/PromptLibrary';
import { BudgetGuard } from '../../../../src/ai/providers/BudgetGuard';
import { CircuitBreaker } from '../../../../src/ai/providers/CircuitBreaker';
import { CostMeter } from '../../../../src/ai/providers/CostMeter';
import { MockProvider } from '../../../../src/ai/providers/MockProvider';
import { RateLimitTracker } from '../../../../src/ai/providers/RateLimitTracker';
import { StructuredOutputParser } from '../../../../src/ai/providers/StructuredOutputParser';
import { TaskAwareRouter } from '../../../../src/ai/providers/TaskAwareRouter';
import { CurlConverter } from '../../../../src/api/rest/CurlConverter';

const VALID_OUTPUT = JSON.stringify({
  serviceTs: 'export class UserService { async createUser() {} }',
  testTs: 'Scenario("creates user", () => {});',
});

const outputSchema = z.object({ serviceTs: z.string().min(1), testTs: z.string().min(1) });

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
  postValidate?: (f: CurlToApiOutput) => Promise<string[]>,
): GenerationPipeline<CurlToApiInput, CurlToApiOutput> {
  return new GenerationPipeline(
    {
      agentName: 'curl-to-api',
      promptTemplate: 'curl-to-api',
      outputSchema,
      inputHasher: (i) =>
        crypto.createHash('sha256').update(`${i.serviceName}:${i.curl}`).digest('hex'),
      contextBuilder: async (i) => {
        const req = CurlConverter.fromCurl(i.curl);
        const parsed = new URL(req.url);
        return {
          serviceName: i.serviceName,
          method: req.method,
          url: req.url,
          baseUrl: parsed.origin,
          endpoint: parsed.pathname + (parsed.search || ''),
          headers: JSON.stringify(req.headers),
          body: req.body ? JSON.stringify(req.body) : '{}',
          endpointDescription: `Endpoint for ${i.serviceName}`,
        };
      },
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
  dbPath = path.join(os.tmpdir(), `curl-test-${Date.now()}-${Math.random()}.db`);
  cache = new GenerationCache({ dbPath, ttlDays: 1 });
});

afterEach(() => {
  cache.close();
});

describe('CurlToApiAgent', () => {
  const SAMPLE_CURL =
    'curl -X POST https://api.example.com/users -H \'Content-Type: application/json\' -d \'{"name":"Alice"}\'';

  // ── Happy path ────────────────────────────────────────────────────────────

  it('returns serviceTs + testTs from LLM response', async () => {
    const mock = new MockProvider({ fallback: VALID_OUTPUT });
    const agent = new CurlToApiAgent({ pipeline: makePipeline(mock, cache) });

    const result = await agent.run({ curl: SAMPLE_CURL, serviceName: 'User', outputDir: '/tmp' });
    expect(result.serviceTs).toContain('UserService');
    expect(result.testTs).toContain('Scenario');
  });

  it('parses GET curl (no -X flag defaults to GET)', async () => {
    const getCurl = 'curl https://api.example.com/users/123';
    const mock = new MockProvider({ fallback: VALID_OUTPUT });
    const agent = new CurlToApiAgent({ pipeline: makePipeline(mock, cache) });

    const result = await agent.run(
      { curl: getCurl, serviceName: 'User', outputDir: '/tmp' },
      { skipCache: true },
    );
    expect(result).toHaveProperty('serviceTs');
  });

  it('parses DELETE curl with Authorization header', async () => {
    const delCurl = "curl -X DELETE https://api.example.com/users/1 -H 'Authorization: Bearer tok'";
    const mock = new MockProvider({ fallback: VALID_OUTPUT });
    const agent = new CurlToApiAgent({ pipeline: makePipeline(mock, cache) });

    const result = await agent.run(
      { curl: delCurl, serviceName: 'User', outputDir: '/tmp' },
      { skipCache: true },
    );
    expect(result).toHaveProperty('serviceTs');
  });

  it('curl with no body does not throw', async () => {
    const noBodCurl = 'curl -X GET https://api.example.com/health';
    const mock = new MockProvider({ fallback: VALID_OUTPUT });
    const agent = new CurlToApiAgent({ pipeline: makePipeline(mock, cache) });

    await expect(
      agent.run({ curl: noBodCurl, serviceName: 'Health', outputDir: '/tmp' }, { skipCache: true }),
    ).resolves.toHaveProperty('serviceTs');
  });

  it('minimal curl string does not throw', async () => {
    const mock = new MockProvider({ fallback: VALID_OUTPUT });
    const agent = new CurlToApiAgent({ pipeline: makePipeline(mock, cache) });

    await expect(
      agent.run(
        { curl: 'curl http://x.com', serviceName: 'Empty', outputDir: '/tmp' },
        { skipCache: true },
      ),
    ).resolves.toHaveProperty('serviceTs');
  });

  // ── Cache behaviour ───────────────────────────────────────────────────────

  it('second identical call hits cache without LLM', async () => {
    const mock = new MockProvider({ fallback: VALID_OUTPUT });
    const agent = new CurlToApiAgent({ pipeline: makePipeline(mock, cache) });

    const input = { curl: SAMPLE_CURL, serviceName: 'User', outputDir: '/tmp' };
    await agent.run(input, { skipCache: false });
    await agent.run(input, { skipCache: false });

    expect(mock.calls).toHaveLength(1);
  });

  // ── Negative cases ────────────────────────────────────────────────────────

  it('throws GenerationFailedError when postValidate always fails', async () => {
    const mock = new MockProvider({ fallback: VALID_OUTPUT });
    const postValidate = vi.fn().mockResolvedValue(['TS error']);
    const agent = new CurlToApiAgent({ pipeline: makePipeline(mock, cache, postValidate) });

    await expect(
      agent.run(
        { curl: SAMPLE_CURL, serviceName: 'Fail', outputDir: '/tmp' },
        { maxRetries: 0, skipCache: true },
      ),
    ).rejects.toThrow(GenerationFailedError);
  });

  it('retries once when postValidate fails on first attempt', async () => {
    const mock = new MockProvider({ fallback: VALID_OUTPUT });
    let attempt = 0;
    const postValidate = vi.fn().mockImplementation(async () => {
      attempt += 1;
      return attempt === 1 ? ['first-attempt-error'] : [];
    });

    const agent = new CurlToApiAgent({ pipeline: makePipeline(mock, cache, postValidate) });
    const result = await agent.run(
      { curl: SAMPLE_CURL, serviceName: 'Retry', outputDir: '/tmp' },
      { skipCache: true },
    );
    expect(result.serviceTs).toBeTruthy();
    expect(mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('dryRun prevents file writing', async () => {
    const mock = new MockProvider({ fallback: VALID_OUTPUT });
    const targetFile = path.join(os.tmpdir(), `dry-service-${Date.now()}.ts`);

    const pipeline = new GenerationPipeline<CurlToApiInput, CurlToApiOutput>(
      {
        agentName: 'curl-to-api',
        promptTemplate: 'curl-to-api',
        outputSchema,
        inputHasher: (i) => crypto.createHash('sha256').update(JSON.stringify(i)).digest('hex'),
        contextBuilder: async (i) => {
          const req = CurlConverter.fromCurl(i.curl);
          const parsed = new URL(req.url);
          return {
            serviceName: i.serviceName,
            method: req.method,
            url: req.url,
            baseUrl: parsed.origin,
            endpoint: parsed.pathname + (parsed.search || ''),
            headers: '{}',
            body: '{}',
            endpointDescription: 'x',
          };
        },
        outputMapper: () => ({ [targetFile]: 'content' }),
      },
      {
        router: makeRouter(mock),
        cache,
        prompts: new PromptLibrary(),
        parser: new StructuredOutputParser(),
      },
    );

    const agent = new CurlToApiAgent({ pipeline });
    await agent.run(
      { curl: 'curl http://x.com', serviceName: 'X', outputDir: '/tmp' },
      { dryRun: true, skipCache: true },
    );

    const { existsSync } = await import('node:fs');
    expect(existsSync(targetFile)).toBe(false);
  });
});
