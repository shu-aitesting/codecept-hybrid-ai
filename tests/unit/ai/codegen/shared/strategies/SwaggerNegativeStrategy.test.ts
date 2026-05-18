import * as path from 'node:path';

import { describe, expect, it, beforeAll } from 'vitest';

import { EndpointModel } from '../../../../../../src/ai/codegen/shared/EndpointModel';
import { SwaggerNegativeStrategy } from '../../../../../../src/ai/codegen/shared/strategies/SwaggerNegativeStrategy';
import { swaggerToModel } from '../../../../../../src/api/swagger/SwaggerEndpointAdapter';
import { SwaggerParser } from '../../../../../../src/api/swagger/SwaggerParser';

const FIXTURE = path.resolve(__dirname, '../../../../../api/_fixtures/system-health.yaml');
const DEFAULT_CONFIG = {
  apiHeaderNames: { token: 'Token', tokenPrefix: '', language: 'Lng', timezone: 'Tz' },
};

let userEndpoints: EndpointModel[];
const strategy = new SwaggerNegativeStrategy();

beforeAll(async () => {
  const parsed = await SwaggerParser.parse(FIXTURE);
  const userGroup = parsed.groups.find((g) => g.tagSlug === 'user')!;
  userEndpoints = swaggerToModel(
    userGroup,
    parsed.securitySchemes,
    parsed.globalSecurity,
    DEFAULT_CONFIG,
  );
});

// ---------------------------------------------------------------------------
// Constraint priority
// ---------------------------------------------------------------------------
describe('SwaggerNegativeStrategy — constraint priority', () => {
  it('POST /users: picks missing-required over pattern/enum (required > pattern priority)', () => {
    const ep = userEndpoints.find((e) => e.operationId === 'createUser')!;
    const plans = strategy.planNegative(ep);
    expect(plans).toHaveLength(1);
    expect(plans[0].mutation?.kind).toBe('missing-required');
  });

  it('PUT /users/{id}: picks missing-required for name field', () => {
    const ep = userEndpoints.find((e) => e.operationId === 'updateUser')!;
    const plans = strategy.planNegative(ep);
    expect(plans).toHaveLength(1);
    expect(plans[0].mutation?.kind).toBe('missing-required');
  });

  it('endpoint with only pattern constraint → invalid-pattern', () => {
    const ep = userEndpoints.find((e) => e.operationId === 'createUser')!;
    const patternOnlyEp: EndpointModel = {
      ...ep,
      constraints: [{ path: 'email', type: 'string', required: false, pattern: '^[a-z]+$' }],
    };
    const plans = strategy.planNegative(patternOnlyEp);
    expect(plans[0].mutation?.kind).toBe('invalid-pattern');
  });

  it('endpoint with only enum constraint → invalid-enum', () => {
    const ep = userEndpoints.find((e) => e.operationId === 'createUser')!;
    const enumOnlyEp: EndpointModel = {
      ...ep,
      constraints: [{ path: 'role', type: 'string', required: false, enum: ['admin', 'user'] }],
    };
    const plans = strategy.planNegative(enumOnlyEp);
    expect(plans[0].mutation?.kind).toBe('invalid-enum');
  });

  it('endpoint with only min/max constraint → out-of-range', () => {
    const ep = userEndpoints.find((e) => e.operationId === 'createUser')!;
    const rangeOnlyEp: EndpointModel = {
      ...ep,
      constraints: [{ path: 'age', type: 'integer', required: false, min: 1, max: 120 }],
    };
    const plans = strategy.planNegative(rangeOnlyEp);
    expect(plans[0].mutation?.kind).toBe('out-of-range');
  });

  it('endpoint with only minLength constraint → over-length', () => {
    const ep = userEndpoints.find((e) => e.operationId === 'createUser')!;
    const lengthOnlyEp: EndpointModel = {
      ...ep,
      constraints: [{ path: 'name', type: 'string', required: false, minLength: 2 }],
    };
    const plans = strategy.planNegative(lengthOnlyEp);
    expect(plans[0].mutation?.kind).toBe('over-length');
  });

  it('no constraints → empty array', () => {
    const ep = userEndpoints.find((e) => e.operationId === 'createUser')!;
    const noConstraintEp: EndpointModel = { ...ep, constraints: [] };
    const plans = strategy.planNegative(noConstraintEp);
    expect(plans).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// DELETE special case
// ---------------------------------------------------------------------------
describe('SwaggerNegativeStrategy — DELETE path param', () => {
  it('DELETE /users/{id}: emits 1 plan with missing-required, expects 404', () => {
    const ep = userEndpoints.find((e) => e.operationId === 'deleteUser')!;
    const plans = strategy.planNegative(ep);
    expect(plans).toHaveLength(1);
    expect(plans[0].kind).toBe('negative-validation');
    expect(plans[0].expectedStatus).toBe(404);
    expect(plans[0].mutation?.kind).toBe('missing-required');
    expect(plans[0].mutation?.path).toBe('id');
  });
});

// ---------------------------------------------------------------------------
// Non-JSON body skip
// ---------------------------------------------------------------------------
describe('SwaggerNegativeStrategy — non-JSON body', () => {
  it('skips negative-validation for multipart/form-data body', () => {
    const ep = userEndpoints.find((e) => e.operationId === 'createUser')!;
    const formEp: EndpointModel = {
      ...ep,
      method: 'POST',
      requestBody: { ...ep.requestBody!, contentType: 'multipart/form-data' },
    };
    const plans = strategy.planNegative(formEp);
    expect(plans).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Plan structure
// ---------------------------------------------------------------------------
describe('SwaggerNegativeStrategy — plan structure', () => {
  it('plan id is 64-char hex', () => {
    const ep = userEndpoints.find((e) => e.operationId === 'createUser')!;
    const plans = strategy.planNegative(ep);
    expect(plans[0].id).toMatch(/^[0-9a-f]{64}$/);
  });

  it('plan id is deterministic', () => {
    const ep = userEndpoints.find((e) => e.operationId === 'createUser')!;
    const id1 = strategy.planNegative(ep)[0].id;
    const id2 = strategy.planNegative(ep)[0].id;
    expect(id1).toBe(id2);
  });

  it('plan has @negative-validation tag', () => {
    const ep = userEndpoints.find((e) => e.operationId === 'createUser')!;
    const plans = strategy.planNegative(ep);
    expect(plans[0].tags).toContain('@negative-validation');
  });

  it('mutation constraint is attached', () => {
    const ep = userEndpoints.find((e) => e.operationId === 'createUser')!;
    const plans = strategy.planNegative(ep);
    expect(plans[0].mutation?.constraint).toBeDefined();
  });
});
