import * as path from 'node:path';

import { describe, expect, it, beforeAll } from 'vitest';

import { EndpointModel } from '../../../../../src/ai/codegen/shared/EndpointModel';
import { swaggerToModel } from '../../../../../src/api/swagger/SwaggerEndpointAdapter';
import { SwaggerParser } from '../../../../../src/api/swagger/SwaggerParser';

const FIXTURE = path.resolve(__dirname, '../../../../api/_fixtures/system-health.yaml');
const DEFAULT_CONFIG = {
  apiHeaderNames: { token: 'Token', tokenPrefix: '', language: 'Lng', timezone: 'Tz' },
};

let pingModels: EndpointModel[];
let userModels: EndpointModel[];
let allSchemes: Record<string, unknown>;
let globalSecurity: Array<Record<string, string[]>> | undefined;

beforeAll(async () => {
  const parsed = await SwaggerParser.parse(FIXTURE);
  allSchemes = parsed.securitySchemes;
  globalSecurity = parsed.globalSecurity;

  const pingGroup = parsed.groups.find((g) => g.tagSlug === 'ping')!;
  const userGroup = parsed.groups.find((g) => g.tagSlug === 'user')!;

  pingModels = swaggerToModel(pingGroup, allSchemes, globalSecurity, DEFAULT_CONFIG);
  userModels = swaggerToModel(userGroup, allSchemes, globalSecurity, DEFAULT_CONFIG);
});

describe('swaggerToModel — system-health.yaml', () => {
  it('produces 1 endpoint model for Ping group', () => {
    expect(pingModels).toHaveLength(1);
  });

  it('produces 5 endpoint models for User group', () => {
    expect(userModels).toHaveLength(5);
  });

  it('GET /ping — source is swagger, method correct', () => {
    const ep = pingModels[0];
    expect(ep.source).toBe('swagger');
    expect(ep.method).toBe('GET');
    expect(ep.path).toBe('/ping');
    expect(ep.operationId).toBe('getPing');
  });

  it('GET /ping — security:[] override → auth.required false, scheme none', () => {
    const ep = pingModels[0];
    expect(ep.auth.required).toBe(false);
    expect(ep.auth.scheme).toBe('none');
  });

  it('GET /ping — ambient.token false (no-auth endpoint)', () => {
    const ep = pingModels[0];
    expect(ep.headerParams.ambient.token).toBe(false);
  });

  it('GET /users — auth required via global TokenAuth scheme', () => {
    const ep = userModels.find((e) => e.operationId === 'getUsers')!;
    expect(ep.auth.required).toBe(true);
    expect(ep.auth.headerName).toBe('Token');
    expect(ep.auth.scheme).toBe('apiKey');
  });

  it('GET /users — ambient.token true (global security applies)', () => {
    const ep = userModels.find((e) => e.operationId === 'getUsers')!;
    expect(ep.headerParams.ambient.token).toBe(true);
  });

  it('GET /users — query params extracted with constraints', () => {
    const ep = userModels.find((e) => e.operationId === 'getUsers')!;
    expect(ep.queryParams).toHaveLength(2);
    const limit = ep.queryParams.find((p) => p.name === 'limit')!;
    expect(limit.required).toBe(false);
    expect(limit.constraints[0].max).toBe(100);
    expect(limit.constraints[0].min).toBe(1);
    expect(limit.constraints[0].default).toBe(20);
  });

  it('GET /users/{id} — path param extracted with min constraint', () => {
    const ep = userModels.find((e) => e.operationId === 'getUserById')!;
    expect(ep.pathParams).toHaveLength(1);
    const idParam = ep.pathParams[0];
    expect(idParam.name).toBe('id');
    expect(idParam.required).toBe(true);
    expect(idParam.constraints[0].min).toBe(1);
  });

  it('POST /users — requestBody populated with required paths', () => {
    const ep = userModels.find((e) => e.operationId === 'createUser')!;
    expect(ep.requestBody).toBeDefined();
    expect(ep.requestBody!.required).toBe(true);
    expect(ep.requestBody!.contentType).toBe('application/json');
    expect(ep.requestBody!.requiredPaths).toContain('name');
    expect(ep.requestBody!.requiredPaths).toContain('email');
  });

  it('POST /users — body constraints include name and email fields', () => {
    const ep = userModels.find((e) => e.operationId === 'createUser')!;
    const nameConstraint = ep.constraints.find((c) => c.path === 'name');
    const emailConstraint = ep.constraints.find((c) => c.path === 'email');
    expect(nameConstraint).toBeDefined();
    expect(nameConstraint!.minLength).toBe(2);
    expect(nameConstraint!.maxLength).toBe(100);
    expect(emailConstraint).toBeDefined();
    expect(emailConstraint!.format).toBe('email');
    expect(emailConstraint!.pattern).toBeDefined();
  });

  it('POST /users — Lng header param classified as ambient.language', () => {
    const ep = userModels.find((e) => e.operationId === 'createUser')!;
    expect(ep.headerParams.ambient.language).toBe(true);
    // Lng is ambient so NOT in requiredParams
    expect(ep.headerParams.required.map((p) => p.name)).not.toContain('Lng');
  });

  it('POST /users — fieldExamples populated from body schema', () => {
    const ep = userModels.find((e) => e.operationId === 'createUser')!;
    expect(ep.fieldExamples['name']).toBe('John Doe');
    expect(ep.fieldExamples['email']).toBe('john@example.com');
  });

  it('POST /users — bodyExamples populated from requestBody.example (PR-2.12)', () => {
    const ep = userModels.find((e) => e.operationId === 'createUser')!;
    expect(ep.bodyExamples.length).toBeGreaterThan(0);
    const ex = ep.bodyExamples[0] as Record<string, unknown>;
    expect(ex['name']).toBe('Jane Doe');
    expect(ex['email']).toBe('jane@example.com');
  });

  it('POST /users — 201 response has schema', () => {
    const ep = userModels.find((e) => e.operationId === 'createUser')!;
    const resp201 = ep.responses.find((r) => r.statusCode === 201);
    expect(resp201).toBeDefined();
    expect(resp201!.schema).toBeDefined();
    expect(resp201!.contentType).toBe('application/json');
  });

  it('DELETE /users/{id} — 204 response has no schema or contentType', () => {
    const ep = userModels.find((e) => e.operationId === 'deleteUser')!;
    const resp204 = ep.responses.find((r) => r.statusCode === 204);
    expect(resp204).toBeDefined();
    expect(resp204!.schema).toBeUndefined();
    expect(resp204!.contentType).toBeUndefined();
  });

  it('all models have source: swagger and correct tags', () => {
    for (const ep of [...pingModels, ...userModels]) {
      expect(ep.source).toBe('swagger');
      expect(ep.tags.length).toBeGreaterThan(0);
    }
  });

  it('endpoint without x-depends-on has xDependsOn undefined', () => {
    const ep = pingModels[0];
    expect(ep.xDependsOn).toBeUndefined();
  });
});
