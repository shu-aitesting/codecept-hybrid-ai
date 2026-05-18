import { describe, expect, it } from 'vitest';

import type { EndpointModel } from '../../../../src/ai/codegen/shared/EndpointModel';
import { DataContext } from '../../../../src/ai/data/DataContext';
import { DataFactory } from '../../../../src/ai/data/DataFactory';

function makeEndpoint(schema?: Record<string, unknown>): EndpointModel {
  return {
    operationId: 'createUser',
    method: 'POST',
    path: '/users',
    pathParams: [],
    queryParams: [],
    headerParams: {
      required: [],
      optional: [],
      ambient: { token: false, language: false, timezone: false },
    },
    requestBody: schema
      ? { contentType: 'application/json', schema, required: true, requiredPaths: [] }
      : undefined,
    responses: [],
    auth: { required: false, headerName: 'Token', prefix: '', scheme: 'none' },
    constraints: [],
    fieldExamples: {},
    bodyExamples: [],
    deprecated: false,
    source: 'swagger',
    tags: [],
  } as EndpointModel;
}

describe('DataFactory', () => {
  const factory = new DataFactory();

  it('1. basic object — generates all required fields', async () => {
    const ep = makeEndpoint({
      type: 'object',
      properties: { name: { type: 'string' }, age: { type: 'integer', minimum: 1, maximum: 120 } },
      required: ['name', 'age'],
    });
    const result = await factory.build(ep, { seed: 1 });
    expect(result).toMatchObject({ name: expect.any(String), age: expect.any(Number) });
    expect((result as Record<string, unknown>).age).toBeGreaterThanOrEqual(1);
    expect((result as Record<string, unknown>).age).toBeLessThanOrEqual(120);
  });

  it('2. enum — picks a value from the enum array', async () => {
    const ep = makeEndpoint({
      type: 'object',
      properties: { status: { type: 'string', enum: ['active', 'inactive', 'pending'] } },
      required: ['status'],
    });
    const result = (await factory.build(ep, { seed: 2 })) as Record<string, unknown>;
    expect(['active', 'inactive', 'pending']).toContain(result.status);
  });

  it('3. pattern — generated value matches regex', async () => {
    const ep = makeEndpoint({
      type: 'object',
      properties: { code: { type: 'string', pattern: '^[A-Z]{3}-\\d{3}$' } },
      required: ['code'],
    });
    const result = (await factory.build(ep, { seed: 3 })) as Record<string, unknown>;
    expect(typeof result.code).toBe('string');
    expect(result.code).toMatch(/^[A-Z]{3}-\d{3}$/);
  });

  it('4. example precedence — schema example overrides faker generation', async () => {
    const ep = makeEndpoint({
      type: 'object',
      properties: { email: { type: 'string', format: 'email', example: 'fixed@test.com' } },
      required: ['email'],
    });
    const result = (await factory.build(ep, { seed: 4 })) as Record<string, unknown>;
    expect(result.email).toBe('fixed@test.com');
  });

  it('5. mutation — missing-required deletes field', async () => {
    const ep = makeEndpoint({
      type: 'object',
      properties: { name: { type: 'string' }, email: { type: 'string', format: 'email' } },
      required: ['name', 'email'],
    });
    const result = (await factory.build(ep, {
      seed: 5,
      mutation: { path: 'email', kind: 'missing-required' },
    })) as Record<string, unknown>;
    expect(result.name).toBeDefined();
    expect('email' in result).toBe(false);
  });

  it('5b. mutation — invalid-pattern sets ###', async () => {
    const ep = makeEndpoint({
      type: 'object',
      properties: { email: { type: 'string', format: 'email' } },
      required: ['email'],
    });
    const result = (await factory.build(ep, {
      seed: 5,
      mutation: { path: 'email', kind: 'invalid-pattern' },
    })) as Record<string, unknown>;
    expect(result.email).toBe('###');
  });

  it('5c. mutation — over-length exceeds maxLength', async () => {
    const ep = makeEndpoint({
      type: 'object',
      properties: { slug: { type: 'string', maxLength: 10 } },
      required: ['slug'],
    });
    const result = (await factory.build(ep, {
      seed: 5,
      mutation: {
        path: 'slug',
        kind: 'over-length',
        constraint: { path: 'slug', type: 'string', required: true, maxLength: 10 },
      },
    })) as Record<string, unknown>;
    expect(typeof result.slug).toBe('string');
    expect((result.slug as string).length).toBeGreaterThan(10);
  });

  it('6. seed determinism — same seed produces deep-equal output across two runs', async () => {
    const ep = makeEndpoint({
      type: 'object',
      properties: {
        id: { type: 'integer', minimum: 1, maximum: 1000 },
        name: { type: 'string' },
        status: { type: 'string', enum: ['a', 'b', 'c'] },
      },
      required: ['id', 'name', 'status'],
    });
    const r1 = await factory.build(ep, { seed: 42 });
    const r2 = await factory.build(ep, { seed: 42 });
    expect(r1).toEqual(r2);
  });

  it('build returns undefined when endpoint has no requestBody', async () => {
    const ep = makeEndpoint();
    expect(await factory.build(ep)).toBeUndefined();
  });

  it('DataContext.resolve is applied to generated output', async () => {
    const ctx = new DataContext();
    ctx.capture('user.id', 99);
    const ep = makeEndpoint({
      type: 'object',
      properties: { ref: { type: 'string', example: '${user.id}' } },
      required: ['ref'],
    });
    const result = (await factory.build(ep, { seed: 7, ctx })) as Record<string, unknown>;
    expect(result.ref).toBe(99);
  });
});
