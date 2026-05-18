import * as path from 'node:path';

import { describe, expect, it, beforeAll } from 'vitest';

import { EndpointModel } from '../../../../../src/ai/codegen/shared/EndpointModel';
import { SwaggerNegativeStrategy } from '../../../../../src/ai/codegen/shared/strategies/SwaggerNegativeStrategy';
import { TestCasePlanner } from '../../../../../src/ai/codegen/shared/TestCasePlanner';
import { swaggerToModel } from '../../../../../src/api/swagger/SwaggerEndpointAdapter';
import { SwaggerParser } from '../../../../../src/api/swagger/SwaggerParser';

const FIXTURE = path.resolve(__dirname, '../../../../api/_fixtures/system-health.yaml');
const DEFAULT_CONFIG = {
  apiHeaderNames: { token: 'Token', tokenPrefix: '', language: 'Lng', timezone: 'Tz' },
};

let allEndpoints: EndpointModel[];
let planner: TestCasePlanner;

beforeAll(async () => {
  const parsed = await SwaggerParser.parse(FIXTURE);
  const pingGroup = parsed.groups.find((g) => g.tagSlug === 'ping')!;
  const userGroup = parsed.groups.find((g) => g.tagSlug === 'user')!;
  allEndpoints = [
    ...swaggerToModel(pingGroup, parsed.securitySchemes, parsed.globalSecurity, DEFAULT_CONFIG),
    ...swaggerToModel(userGroup, parsed.securitySchemes, parsed.globalSecurity, DEFAULT_CONFIG),
  ];
  planner = new TestCasePlanner(new SwaggerNegativeStrategy(), { authNegativeCases: 'both' });
});

// ---------------------------------------------------------------------------
// GET /ping — no auth, security:[]
// ---------------------------------------------------------------------------
describe('TestCasePlanner — GET /ping (no auth, security:[])', () => {
  it('produces exactly 1 plan (positive only — no auth, no body)', () => {
    const ep = allEndpoints.find((e) => e.operationId === 'getPing')!;
    const plans = planner.plan(ep);
    expect(plans).toHaveLength(1);
    expect(plans[0].kind).toBe('positive');
  });

  it('positive plan has @smoke, @positive, @contract tags', () => {
    const ep = allEndpoints.find((e) => e.operationId === 'getPing')!;
    const plan = planner.plan(ep)[0];
    expect(plan.tags).toContain('@smoke');
    expect(plan.tags).toContain('@positive');
    expect(plan.tags).toContain('@contract');
  });

  it('positive plan expectedStatus is 200', () => {
    const ep = allEndpoints.find((e) => e.operationId === 'getPing')!;
    const plan = planner.plan(ep)[0];
    expect(plan.expectedStatus).toBe(200);
  });

  it('positive plan has @schema tag (200 response has schema)', () => {
    const ep = allEndpoints.find((e) => e.operationId === 'getPing')!;
    const plan = planner.plan(ep)[0];
    expect(plan.tags).toContain('@schema');
  });

  it('plan id is a 64-char hex sha256', () => {
    const ep = allEndpoints.find((e) => e.operationId === 'getPing')!;
    const plan = planner.plan(ep)[0];
    expect(plan.id).toMatch(/^[0-9a-f]{64}$/);
  });

  it('plan id is deterministic across two runs', () => {
    const ep = allEndpoints.find((e) => e.operationId === 'getPing')!;
    const id1 = planner.plan(ep)[0].id;
    const id2 = planner.plan(ep)[0].id;
    expect(id1).toBe(id2);
  });
});

// ---------------------------------------------------------------------------
// POST /users — auth required, has body with constraints + Lng ambient header
// ---------------------------------------------------------------------------
describe('TestCasePlanner — POST /users', () => {
  it('produces positive + negative-validation + 2 negative-auth plans', () => {
    const ep = allEndpoints.find((e) => e.operationId === 'createUser')!;
    const plans = planner.plan(ep);
    expect(plans.some((p) => p.kind === 'positive')).toBe(true);
    expect(plans.some((p) => p.kind === 'negative-validation')).toBe(true);
    expect(plans.some((p) => p.kind === 'negative-auth-missing')).toBe(true);
    expect(plans.some((p) => p.kind === 'negative-auth-invalid')).toBe(true);
  });

  it('negative-validation mutation is missing-required (highest priority constraint)', () => {
    const ep = allEndpoints.find((e) => e.operationId === 'createUser')!;
    const plans = planner.plan(ep);
    const negVal = plans.find((p) => p.kind === 'negative-validation')!;
    expect(negVal).toBeDefined();
    expect(negVal.mutation?.kind).toBe('missing-required');
  });

  it('negative-auth-missing has mutation.kind missing-token', () => {
    const ep = allEndpoints.find((e) => e.operationId === 'createUser')!;
    const plans = planner.plan(ep);
    const authMissing = plans.find((p) => p.kind === 'negative-auth-missing')!;
    expect(authMissing.expectedStatus).toBe(401);
    expect(authMissing.mutation?.kind).toBe('missing-token');
  });

  it('negative-auth-invalid has mutation.kind invalid-token', () => {
    const ep = allEndpoints.find((e) => e.operationId === 'createUser')!;
    const plans = planner.plan(ep);
    const authInvalid = plans.find((p) => p.kind === 'negative-auth-invalid')!;
    expect(authInvalid.expectedStatus).toBe(401);
    expect(authInvalid.mutation?.kind).toBe('invalid-token');
  });

  it('emits @negative-headers plan for ambient.language (Lng required header)', () => {
    const ep = allEndpoints.find((e) => e.operationId === 'createUser')!;
    const plans = planner.plan(ep);
    const headerPlan = plans.find((p) => p.kind === 'negative-headers');
    expect(headerPlan).toBeDefined();
    expect(headerPlan!.mutation?.path).toBe('language');
    expect(headerPlan!.expectedStatus).toBe(400);
  });

  it('positive plan expectedStatus is 201', () => {
    const ep = allEndpoints.find((e) => e.operationId === 'createUser')!;
    const positivePlan = planner.plan(ep).find((p) => p.kind === 'positive')!;
    expect(positivePlan.expectedStatus).toBe(201);
  });

  it('all plan ids are unique within the endpoint', () => {
    const ep = allEndpoints.find((e) => e.operationId === 'createUser')!;
    const plans = planner.plan(ep);
    const ids = plans.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

// ---------------------------------------------------------------------------
// GET /users/{id} — auth required, no body
// ---------------------------------------------------------------------------
describe('TestCasePlanner — GET /users/{id}', () => {
  it('produces positive + negative-validation (path param) + 2 negative-auth plans', () => {
    const ep = allEndpoints.find((e) => e.operationId === 'getUserById')!;
    const plans = planner.plan(ep);
    const kinds = plans.map((p) => p.kind);
    expect(kinds).toContain('positive');
    expect(kinds).toContain('negative-auth-missing');
    expect(kinds).toContain('negative-auth-invalid');
    // id path param is required → strategy emits 1 negative-validation
    expect(kinds).toContain('negative-validation');
  });
});

// ---------------------------------------------------------------------------
// PUT /users/{id} — auth required, has body with required field
// ---------------------------------------------------------------------------
describe('TestCasePlanner — PUT /users/{id}', () => {
  it('emits negative-validation with missing-required', () => {
    const ep = allEndpoints.find((e) => e.operationId === 'updateUser')!;
    const plans = planner.plan(ep);
    const negVal = plans.find((p) => p.kind === 'negative-validation')!;
    expect(negVal).toBeDefined();
    expect(negVal.mutation?.kind).toBe('missing-required');
  });
});

// ---------------------------------------------------------------------------
// DELETE /users/{id} — path param, no 2xx schema (204)
// ---------------------------------------------------------------------------
describe('TestCasePlanner — DELETE /users/{id}', () => {
  it('positive plan has no @schema tag (204 has no schema)', () => {
    const ep = allEndpoints.find((e) => e.operationId === 'deleteUser')!;
    const positivePlan = planner.plan(ep).find((p) => p.kind === 'positive')!;
    expect(positivePlan.tags).not.toContain('@schema');
  });

  it('positive plan expectedStatus is 204', () => {
    const ep = allEndpoints.find((e) => e.operationId === 'deleteUser')!;
    const positivePlan = planner.plan(ep).find((p) => p.kind === 'positive')!;
    expect(positivePlan.expectedStatus).toBe(204);
  });

  it('negative-validation plan uses path param, expects 404', () => {
    const ep = allEndpoints.find((e) => e.operationId === 'deleteUser')!;
    const plans = planner.plan(ep);
    const negVal = plans.find((p) => p.kind === 'negative-validation')!;
    expect(negVal).toBeDefined();
    expect(negVal.expectedStatus).toBe(404);
    expect(negVal.mutation?.path).toBe('id');
    expect(negVal.mutation?.kind).toBe('missing-required');
  });
});

// ---------------------------------------------------------------------------
// Deprecated endpoint
// ---------------------------------------------------------------------------
describe('TestCasePlanner — deprecated endpoint', () => {
  it('positive plan omits @smoke, adds @deprecated', () => {
    const ep = allEndpoints.find((e) => e.operationId === 'getUsers')!;
    const deprecatedEp: EndpointModel = { ...ep, deprecated: true };
    const plans = new TestCasePlanner(new SwaggerNegativeStrategy()).plan(deprecatedEp);
    const positivePlan = plans.find((p) => p.kind === 'positive')!;
    expect(positivePlan.tags).not.toContain('@smoke');
    expect(positivePlan.tags).toContain('@deprecated');
  });
});

// ---------------------------------------------------------------------------
// Skip rules
// ---------------------------------------------------------------------------
describe('TestCasePlanner — skip rules', () => {
  it('endpoint with x-internal:true returns empty array', () => {
    const ep = allEndpoints.find((e) => e.operationId === 'getUsers')!;
    const internalEp = { ...ep, 'x-internal': true };
    const plans = planner.plan(internalEp as EndpointModel);
    expect(plans).toHaveLength(0);
  });

  it('OPTIONS method returns empty array', () => {
    const ep = allEndpoints.find((e) => e.operationId === 'getUsers')!;
    const optionsEp: EndpointModel = { ...ep, method: 'OPTIONS' };
    const plans = planner.plan(optionsEp);
    expect(plans).toHaveLength(0);
  });

  it('oauth2 auth scheme skips negative-auth plans', () => {
    const ep = allEndpoints.find((e) => e.operationId === 'getUsers')!;
    const oauth2Ep: EndpointModel = {
      ...ep,
      auth: { required: true, headerName: 'Authorization', prefix: 'Bearer ', scheme: 'oauth2' },
    };
    const plans = planner.plan(oauth2Ep);
    expect(plans.every((p) => !p.kind.startsWith('negative-auth'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// authNegativeCases option
// ---------------------------------------------------------------------------
describe('TestCasePlanner — authNegativeCases option', () => {
  it('authNegativeCases:missing emits only negative-auth-missing', () => {
    const ep = allEndpoints.find((e) => e.operationId === 'getUsers')!;
    const p = new TestCasePlanner(new SwaggerNegativeStrategy(), {
      authNegativeCases: 'missing',
    });
    const plans = p.plan(ep);
    expect(plans.some((pl) => pl.kind === 'negative-auth-missing')).toBe(true);
    expect(plans.some((pl) => pl.kind === 'negative-auth-invalid')).toBe(false);
  });

  it('authNegativeCases:invalid emits only negative-auth-invalid', () => {
    const ep = allEndpoints.find((e) => e.operationId === 'getUsers')!;
    const p = new TestCasePlanner(new SwaggerNegativeStrategy(), {
      authNegativeCases: 'invalid',
    });
    const plans = p.plan(ep);
    expect(plans.some((pl) => pl.kind === 'negative-auth-invalid')).toBe(true);
    expect(plans.some((pl) => pl.kind === 'negative-auth-missing')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// planAll — topological sort (4.10)
// ---------------------------------------------------------------------------
describe('TestCasePlanner.planAll — topological sort', () => {
  it('returns executionOrder containing all operationIds', () => {
    const { executionOrder } = planner.planAll(allEndpoints);
    const ids = allEndpoints.map((e) => e.operationId);
    expect(executionOrder.sort()).toEqual(ids.sort());
  });

  it('respects xDependsOn order', () => {
    const base = allEndpoints.find((e) => e.operationId === 'getPing')!;
    const dependent: EndpointModel = {
      ...base,
      operationId: 'getDependent',
      xDependsOn: ['getPing'],
    };
    const { executionOrder } = planner.planAll([base, dependent]);
    expect(executionOrder.indexOf('getPing')).toBeLessThan(executionOrder.indexOf('getDependent'));
  });

  it('throws Cycle detected on circular xDependsOn', () => {
    const a: EndpointModel = {
      ...allEndpoints[0],
      operationId: 'opA',
      xDependsOn: ['opB'],
    };
    const b: EndpointModel = {
      ...allEndpoints[0],
      operationId: 'opB',
      xDependsOn: ['opA'],
    };
    expect(() => planner.planAll([a, b])).toThrow(/Cycle detected/);
  });

  it('plans list is not empty after planAll', () => {
    const { plans } = planner.planAll(allEndpoints);
    expect(plans.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// dependencies field (4.9)
// ---------------------------------------------------------------------------
describe('TestCasePlan — dependencies field (4.9)', () => {
  it('positive plan copies xDependsOn into dependencies', () => {
    const ep = allEndpoints.find((e) => e.operationId === 'getUsers')!;
    const epWithDep: EndpointModel = { ...ep, xDependsOn: ['createUser'] };
    const plans = planner.plan(epWithDep);
    const pos = plans.find((p) => p.kind === 'positive')!;
    expect(pos.dependencies).toEqual(['createUser']);
  });

  it('positive plan has undefined dependencies when xDependsOn is absent', () => {
    const ep = allEndpoints.find((e) => e.operationId === 'getPing')!;
    const plans = planner.plan(ep);
    expect(plans[0].dependencies).toBeUndefined();
  });
});
