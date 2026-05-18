import { describe, it, expect, vi } from 'vitest';

import type { GenerationPipeline } from '../../../../../src/ai/codegen/GenerationPipeline';
import type { EndpointModel } from '../../../../../src/ai/codegen/shared/EndpointModel';
import type { EnrichedPlan } from '../../../../../src/ai/codegen/shared/EnrichedPlan';
import {
  ScenarioEnricher,
  type EnricherInput,
} from '../../../../../src/ai/codegen/shared/ScenarioEnricher';
import type { TestCasePlan } from '../../../../../src/ai/codegen/shared/TestCasePlan';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeEndpoint(overrides: Partial<EndpointModel> = {}): EndpointModel {
  return {
    operationId: 'createUser',
    method: 'POST',
    path: '/users',
    pathParams: [],
    queryParams: [],
    headerParams: {
      required: [],
      optional: [],
      ambient: { token: true, language: false, timezone: false },
    },
    responses: [],
    auth: { required: true, headerName: 'Token', prefix: '', scheme: 'apiKey' },
    constraints: [],
    fieldExamples: {},
    bodyExamples: [],
    deprecated: false,
    source: 'swagger',
    tags: [],
    ...overrides,
  };
}

function makePlan(id: string, kind: TestCasePlan['kind'], ep?: EndpointModel): TestCasePlan {
  return { id, kind, endpoint: ep ?? makeEndpoint(), tags: [], expectedStatus: 200 };
}

function mockPipeline(
  result: EnrichedPlan[] | Error,
): GenerationPipeline<EnricherInput, EnrichedPlan[]> {
  return {
    run: vi
      .fn()
      .mockImplementation(() =>
        result instanceof Error ? Promise.reject(result) : Promise.resolve(result),
      ),
  } as unknown as GenerationPipeline<EnricherInput, EnrichedPlan[]>;
}

// Shared fixtures reused across suites
const endpoint = makeEndpoint();
const plans: TestCasePlan[] = [
  makePlan('id1', 'positive', endpoint),
  makePlan('id2', 'negative-auth-missing', endpoint),
  makePlan('id3', 'negative-validation', endpoint),
];

// ---------------------------------------------------------------------------
// enrich() — valid LLM output
// ---------------------------------------------------------------------------

describe('ScenarioEnricher.enrich() — valid output', () => {
  it('returns all LLM titles when every planId and length is valid', async () => {
    const llmOutput: EnrichedPlan[] = [
      { planId: 'id1', title: 'Create user succeeds with valid payload' },
      { planId: 'id2', title: 'Create user rejects request without token' },
      { planId: 'id3', title: 'Create user fails when email is missing' },
    ];
    const enricher = new ScenarioEnricher(mockPipeline(llmOutput));
    const result = await enricher.enrich(plans, endpoint);
    expect(result).toEqual(llmOutput);
  });

  it('returns empty array immediately when plans input is empty', async () => {
    const enricher = new ScenarioEnricher(mockPipeline([]));
    const result = await enricher.enrich([], endpoint);
    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// enrich() — invalid title lengths → per-plan fallback
// ---------------------------------------------------------------------------

describe('ScenarioEnricher.enrich() — invalid title length → partial fallback', () => {
  it('replaces a title over 80 chars with auto-title, keeps others', async () => {
    const llmOutput: EnrichedPlan[] = [
      { planId: 'id1', title: 'Create user succeeds with valid payload' },
      { planId: 'id2', title: 'x'.repeat(81) },
      { planId: 'id3', title: 'Create user fails when email is missing' },
    ];
    const enricher = new ScenarioEnricher(mockPipeline(llmOutput));
    const result = await enricher.enrich(plans, endpoint);
    expect(result[1]).toEqual({ planId: 'id2', title: 'POST /users — negative-auth-missing' });
    expect(result[0].title).toBe('Create user succeeds with valid payload');
    expect(result[2].title).toBe('Create user fails when email is missing');
  });

  it('replaces a title under 5 chars with auto-title, keeps others', async () => {
    const llmOutput: EnrichedPlan[] = [
      { planId: 'id1', title: 'ok' },
      { planId: 'id2', title: 'Create user rejects request without token' },
      { planId: 'id3', title: 'Create user fails when email is missing' },
    ];
    const enricher = new ScenarioEnricher(mockPipeline(llmOutput));
    const result = await enricher.enrich(plans, endpoint);
    expect(result[0]).toEqual({ planId: 'id1', title: 'POST /users — positive' });
    expect(result[1].title).toBe('Create user rejects request without token');
  });
});

// ---------------------------------------------------------------------------
// enrich() — missing planIds → per-plan fallback
// ---------------------------------------------------------------------------

describe('ScenarioEnricher.enrich() — missing planIds → partial fallback', () => {
  it('fills a missing planId with auto-title and preserves plan order', async () => {
    const llmOutput: EnrichedPlan[] = [
      { planId: 'id1', title: 'Create user succeeds with valid payload' },
      // id2 intentionally absent
      { planId: 'id3', title: 'Create user fails when email is missing' },
    ];
    const enricher = new ScenarioEnricher(mockPipeline(llmOutput));
    const result = await enricher.enrich(plans, endpoint);
    expect(result).toHaveLength(3);
    expect(result[0].planId).toBe('id1');
    expect(result[1]).toEqual({ planId: 'id2', title: 'POST /users — negative-auth-missing' });
    expect(result[2].planId).toBe('id3');
  });

  it('strips hallucinated planIds not present in input', async () => {
    const llmOutput: EnrichedPlan[] = [
      { planId: 'id1', title: 'Create user succeeds with valid payload' },
      { planId: 'BOGUS', title: 'Hallucinated plan title from LLM' },
      { planId: 'id2', title: 'Create user rejects request without token' },
      { planId: 'id3', title: 'Create user fails when email is missing' },
    ];
    const enricher = new ScenarioEnricher(mockPipeline(llmOutput));
    const result = await enricher.enrich(plans, endpoint);
    expect(result).toHaveLength(3);
    expect(result.some((r) => r.planId === 'BOGUS')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// enrich() — pipeline failure → full autoTitle fallback
// ---------------------------------------------------------------------------

describe('ScenarioEnricher.enrich() — pipeline failure → full fallback', () => {
  it('returns autoTitle for every plan when the pipeline throws', async () => {
    const enricher = new ScenarioEnricher(mockPipeline(new Error('LLM unavailable')));
    const result = await enricher.enrich(plans, endpoint);
    expect(result).toEqual(ScenarioEnricher.autoTitle(plans, endpoint));
  });
});

// ---------------------------------------------------------------------------
// enrich() — source routing
// ---------------------------------------------------------------------------

describe('ScenarioEnricher.enrich() — source routing', () => {
  it('calls the injected pipeline for a curl-source endpoint', async () => {
    const curlEp = makeEndpoint({ source: 'curl', method: 'POST', path: '/orders' });
    const curlPlans = [makePlan('c1', 'positive', curlEp)];
    const llmOutput: EnrichedPlan[] = [{ planId: 'c1', title: 'Submit order with valid data' }];
    const pipeline = mockPipeline(llmOutput);
    const enricher = new ScenarioEnricher(pipeline);
    const result = await enricher.enrich(curlPlans, curlEp);
    expect(result).toEqual(llmOutput);
    expect(pipeline.run).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// autoTitle() — static deterministic generator (task 6.7)
// ---------------------------------------------------------------------------

describe('ScenarioEnricher.autoTitle()', () => {
  it('generates method+path+kind titles for all plans', () => {
    const result = ScenarioEnricher.autoTitle(plans, endpoint);
    expect(result).toEqual([
      { planId: 'id1', title: 'POST /users — positive' },
      { planId: 'id2', title: 'POST /users — negative-auth-missing' },
      { planId: 'id3', title: 'POST /users — negative-validation' },
    ]);
  });

  it('is deterministic — two calls produce identical output', () => {
    const a = ScenarioEnricher.autoTitle(plans, endpoint);
    const b = ScenarioEnricher.autoTitle(plans, endpoint);
    expect(a).toEqual(b);
  });

  it('uses the endpoint parameter for method/path, not plan.endpoint', () => {
    const overrideEp = makeEndpoint({ method: 'GET', path: '/health', source: 'curl' });
    const plan = makePlan('t1', 'positive', makeEndpoint()); // plan.endpoint differs
    const result = ScenarioEnricher.autoTitle([plan], overrideEp);
    expect(result[0].title).toBe('GET /health — positive');
  });

  it('returns empty array for empty plans input', () => {
    const result = ScenarioEnricher.autoTitle([], endpoint);
    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 6.6 — Integration guard (skipped unless SKIP_LLM=false)
// ---------------------------------------------------------------------------

describe('ScenarioEnricher integration guard (6.6)', () => {
  it('confirms autoTitle works as LLM-free fallback (SKIP_LLM default)', () => {
    if (process.env['SKIP_LLM'] === 'false') return; // real call — skip in CI
    const ep = makeEndpoint({ method: 'GET', path: '/ping' });
    const p = [makePlan('g1', 'positive', ep)];
    const result = ScenarioEnricher.autoTitle(p, ep);
    expect(result[0]).toEqual({ planId: 'g1', title: 'GET /ping — positive' });
  });
});
