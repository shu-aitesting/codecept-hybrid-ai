import * as fs from 'node:fs';
import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

import { EndpointModel } from '../../../../../../src/ai/codegen/shared/EndpointModel';
import { CurlNegativeStrategy } from '../../../../../../src/ai/codegen/shared/strategies/CurlNegativeStrategy';
import { curlToModel } from '../../../../../../src/api/curl/CurlEndpointAdapter';
import { CurlConverter } from '../../../../../../src/api/rest/CurlConverter';

const FIXTURES = path.resolve(__dirname, '../../../../../api/_fixtures/sample-curls');
const strategy = new CurlNegativeStrategy();

function readFixture(name: string): string {
  return fs.readFileSync(path.join(FIXTURES, name), 'utf-8');
}

function postBodyModel(): EndpointModel {
  const req = CurlConverter.fromCurl(readFixture('post-with-body.txt'));
  return curlToModel(req, { serviceName: 'User' });
}

// ---------------------------------------------------------------------------
// Mutating methods
// ---------------------------------------------------------------------------
describe('CurlNegativeStrategy — POST with body', () => {
  it('emits missing-required for first required path', () => {
    const ep = postBodyModel();
    const plans = strategy.planNegative(ep);
    const missingReq = plans.find((p) => p.mutation?.kind === 'missing-required');
    expect(missingReq).toBeDefined();
  });

  it('heuristic: email field in body → invalid-pattern plan', () => {
    const ep = postBodyModel();
    const plans = strategy.planNegative(ep);
    const patternPlan = plans.find((p) => p.mutation?.kind === 'invalid-pattern');
    expect(patternPlan).toBeDefined();
    expect(patternPlan!.mutation!.path).toMatch(/email|mail/i);
  });

  it('max 2 negative-validation plans per endpoint', () => {
    const ep = postBodyModel();
    const plans = strategy.planNegative(ep);
    expect(plans.length).toBeLessThanOrEqual(2);
  });

  it('all plans have @negative-validation tag', () => {
    const ep = postBodyModel();
    const plans = strategy.planNegative(ep);
    for (const plan of plans) {
      expect(plan.tags).toContain('@negative-validation');
      expect(plan.kind).toBe('negative-validation');
    }
  });

  it('all plan ids are 64-char hex', () => {
    const ep = postBodyModel();
    const plans = strategy.planNegative(ep);
    for (const plan of plans) {
      expect(plan.id).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it('plan ids are unique', () => {
    const ep = postBodyModel();
    const plans = strategy.planNegative(ep);
    const ids = plans.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('plan ids are deterministic', () => {
    const ep = postBodyModel();
    const ids1 = strategy.planNegative(ep).map((p) => p.id);
    const ids2 = strategy.planNegative(ep).map((p) => p.id);
    expect(ids1).toEqual(ids2);
  });
});

// ---------------------------------------------------------------------------
// GET method — should produce no plans
// ---------------------------------------------------------------------------
describe('CurlNegativeStrategy — GET method', () => {
  it('returns empty array for GET request', () => {
    const req = CurlConverter.fromCurl(readFixture('get-with-token.txt'));
    const ep = curlToModel(req, { serviceName: 'User' });
    const plans = strategy.planNegative(ep);
    expect(plans).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Heuristic detection
// ---------------------------------------------------------------------------
describe('CurlNegativeStrategy — heuristic field detection', () => {
  it('url field → invalid-pattern plan', () => {
    const ep = postBodyModel();
    const urlEp: EndpointModel = {
      ...ep,
      requestBody: {
        ...ep.requestBody!,
        schema: {
          type: 'object',
          properties: { websiteUrl: { type: 'string' }, name: { type: 'string' } },
        },
        requiredPaths: [],
      },
    };
    const plans = strategy.planNegative(urlEp);
    expect(plans.some((p) => /url|uri/i.test(p.mutation?.path ?? ''))).toBe(true);
  });

  it('phone field → invalid-pattern plan', () => {
    const ep = postBodyModel();
    const phoneEp: EndpointModel = {
      ...ep,
      requestBody: {
        ...ep.requestBody!,
        schema: {
          type: 'object',
          properties: { phone: { type: 'string' }, name: { type: 'string' } },
        },
        requiredPaths: [],
      },
    };
    const plans = strategy.planNegative(phoneEp);
    expect(plans.some((p) => /phone|mobile/i.test(p.mutation?.path ?? ''))).toBe(true);
  });

  it('does not add heuristic plan for already-covered missing-required field', () => {
    const ep = postBodyModel();
    // If requiredPaths[0] is 'email', it should NOT generate a second email plan
    const emailAsRequired: EndpointModel = {
      ...ep,
      requestBody: {
        ...ep.requestBody!,
        schema: {
          type: 'object',
          properties: { email: { type: 'string' } },
        },
        requiredPaths: ['email'],
      },
    };
    const plans = strategy.planNegative(emailAsRequired);
    const emailPlans = plans.filter((p) => p.mutation?.path === 'email');
    expect(emailPlans.length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Non-JSON body
// ---------------------------------------------------------------------------
describe('CurlNegativeStrategy — non-JSON body', () => {
  it('returns empty array when content-type is not application/json', () => {
    const ep = postBodyModel();
    const formEp: EndpointModel = {
      ...ep,
      requestBody: { ...ep.requestBody!, contentType: 'multipart/form-data' },
    };
    expect(strategy.planNegative(formEp)).toHaveLength(0);
  });

  it('returns empty array when no requestBody', () => {
    const ep = postBodyModel();
    const noBodyEp: EndpointModel = { ...ep, requestBody: undefined };
    expect(strategy.planNegative(noBodyEp)).toHaveLength(0);
  });
});
