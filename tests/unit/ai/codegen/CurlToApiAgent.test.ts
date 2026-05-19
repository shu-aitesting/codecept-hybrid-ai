import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  CurlToApiAgent,
  CurlToApiInput,
  CurlToApiOutput,
} from '../../../../src/ai/codegen/CurlToApiAgent';
import { GenerationCache } from '../../../../src/ai/codegen/GenerationCache';
import { classify } from '../../../../src/ai/codegen/headerClassifier';
import { ScenarioEnricher } from '../../../../src/ai/codegen/shared/ScenarioEnricher';
import { CurlConverter } from '../../../../src/api/rest/CurlConverter';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SAMPLE_CURL =
  'curl -X POST https://api.example.com/users -H \'Content-Type: application/json\' -d \'{"name":"Alice"}\'';

const GET_CURL = 'curl https://api.example.com/health';

const AUTH_CURL =
  "curl -X GET https://api.example.com/users -H 'Token: mytoken123' -H 'Lng: vi-VN'";

function makeAgent(
  overrides: {
    postValidate?: (f: CurlToApiOutput) => Promise<string[]>;
    cache?: GenerationCache;
    noLlm?: boolean;
  } = {},
): CurlToApiAgent {
  return new CurlToApiAgent(
    {
      postValidate: overrides.postValidate ?? (() => Promise.resolve([])),
      cache: overrides.cache,
    },
    { noLlm: overrides.noLlm ?? true },
  );
}

function makeInput(curl: string, serviceName = 'Sample'): CurlToApiInput {
  return { curl, serviceName, outputDir: path.join(os.tmpdir(), 'curl-agent-out') };
}

let dbPath: string;
let cache: GenerationCache;

beforeEach(() => {
  dbPath = path.join(os.tmpdir(), `curl-test-${Date.now()}-${Math.random()}.db`);
  cache = new GenerationCache({ dbPath, ttlDays: 1 });
});

afterEach(() => {
  cache.close();
});

// ---------------------------------------------------------------------------
// run() — basic generation
// ---------------------------------------------------------------------------

describe('CurlToApiAgent.run()', () => {
  it('returns serviceTs + testTs from a POST cURL', async () => {
    const agent = makeAgent();
    const result = await agent.run(makeInput(SAMPLE_CURL), { dryRun: true });
    expect(result.serviceTs).toBeTruthy();
    expect(result.testTs).toBeTruthy();
  });

  it('serviceTs contains the service class name', async () => {
    const agent = makeAgent();
    const result = await agent.run(makeInput(SAMPLE_CURL, 'User'), { dryRun: true });
    expect(result.serviceTs).toContain('UserService');
  });

  it('testTs has Feature, Before, After and at least one Scenario', async () => {
    const agent = makeAgent();
    const result = await agent.run(makeInput(SAMPLE_CURL), { dryRun: true });
    expect(result.testTs).toContain("Feature('");
    expect(result.testTs).toContain('Before(');
    expect(result.testTs).toContain('After(');
    expect(result.testTs).toContain('Scenario(');
  });

  it('GET cURL without body produces output without throwing', async () => {
    const agent = makeAgent();
    const result = await agent.run(makeInput(GET_CURL, 'Health'), { dryRun: true });
    expect(result.serviceTs).toContain('HealthService');
  });

  it('DELETE cURL with Authorization header produces output', async () => {
    const curl = "curl -X DELETE https://api.example.com/users/1 -H 'Token: tok'";
    const agent = makeAgent();
    const result = await agent.run(makeInput(curl, 'User'), { dryRun: true });
    expect(result.serviceTs).toBeTruthy();
  });

  it('minimal bare cURL does not throw', async () => {
    const agent = makeAgent();
    await expect(
      agent.run(makeInput('curl http://x.com', 'Min'), { dryRun: true }),
    ).resolves.toHaveProperty('serviceTs');
  });

  it('throws when postValidate returns errors', async () => {
    const agent = makeAgent({
      postValidate: () => Promise.resolve(['Forbidden header in service']),
    });
    await expect(agent.run(makeInput(SAMPLE_CURL), { dryRun: true })).rejects.toThrow(
      'Post-validation failed',
    );
  });

  it('cURL with Token header → @negative-auth-missing scenario in testTs', async () => {
    const agent = makeAgent();
    const result = await agent.run(makeInput(AUTH_CURL, 'User'), { dryRun: true });
    expect(result.testTs).toContain("skipAmbient: ['token']");
  });

  it('GET cURL without auth → no @negative-auth scenarios', async () => {
    const agent = makeAgent();
    const result = await agent.run(makeInput(GET_CURL, 'Health'), { dryRun: true });
    expect(result.testTs).not.toContain("skipAmbient: ['token']");
  });
});

// ---------------------------------------------------------------------------
// run() — cache
// ---------------------------------------------------------------------------

describe('CurlToApiAgent.run() — cache', () => {
  it('second identical call hits cache (only one enricher call)', async () => {
    const enricher = new ScenarioEnricher();
    const enrichSpy = vi.spyOn(enricher, 'enrich').mockResolvedValue([]);
    const agent = new CurlToApiAgent(
      { postValidate: () => Promise.resolve([]), cache, enricher },
      { noLlm: false },
    );
    const input = makeInput(SAMPLE_CURL);
    await agent.run(input, { dryRun: true, skipCache: false });
    await agent.run(input, { dryRun: true, skipCache: false });
    // Second call is a cache hit — enricher not called again
    expect(enrichSpy).toHaveBeenCalledTimes(1);
  });

  it('skipCache=true forces re-enrichment both times', async () => {
    const enricher = new ScenarioEnricher();
    const enrichSpy = vi.spyOn(enricher, 'enrich').mockResolvedValue([]);
    const agent = new CurlToApiAgent(
      { postValidate: () => Promise.resolve([]), cache, enricher },
      { noLlm: false },
    );
    const input = makeInput(SAMPLE_CURL);
    await agent.run(input, { dryRun: true, skipCache: true });
    await agent.run(input, { dryRun: true, skipCache: true });
    expect(enrichSpy).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// CurlConverter + headerClassifier integration (still valid)
// ---------------------------------------------------------------------------

describe('CurlConverter + headerClassifier integration', () => {
  it('routes Authorization, Accept-Language, X-Timezone into ambient correctly', () => {
    const curl =
      "curl -X POST 'https://api.example.com/foo' " +
      "-H 'Authorization: Bearer tok' " +
      "-H 'Accept-Language: en-US' " +
      "-H 'X-Timezone: UTC' " +
      "-H 'X-Request-ID: r1' " +
      '-H \'sec-ch-ua: "Chrome"\' ' +
      "--data '{}'";
    const req = CurlConverter.fromCurl(curl);
    const cls = classify(req.headers);
    expect(cls.ambient.token).toBeDefined();
    expect(cls.ambient.language).toBe('en-US');
    expect(cls.ambient.timezone).toBe('UTC');
    expect(cls.skipped.map((h) => h.name)).toContain('sec-ch-ua');
    expect(cls.optionalParams.map((p) => p.name)).toContain('X-Request-ID');
    expect(cls.requiredParams).toHaveLength(0);
  });

  it('tokenHeaderName option routes custom header name as ambient.token', () => {
    const headers = { 'X-Custom-Auth': 'my-secret' };
    const cls = classify(headers, { tokenHeaderName: 'X-Custom-Auth' });
    expect(cls.ambient.token).toBe('my-secret');
    expect(cls.requiredParams).toHaveLength(0);
    expect(cls.optionalParams).toHaveLength(0);
  });
});
