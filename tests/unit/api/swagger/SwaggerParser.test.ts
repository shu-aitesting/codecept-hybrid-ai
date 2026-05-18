import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

import { SwaggerParser } from '../../../../src/api/swagger/SwaggerParser';

const FIXTURE = path.resolve(__dirname, '../../../api/_fixtures/system-health.yaml');

describe('SwaggerParser.parse — system-health.yaml', () => {
  it('parses without error and returns expected metadata', async () => {
    const result = await SwaggerParser.parse(FIXTURE);
    expect(result.title).toBe('System Health API');
    expect(result.version).toBe('1.0.0');
    expect(result.baseUrl).toBe('https://api.example.com');
  });

  it('extracts globalSecurity from spec root', async () => {
    const result = await SwaggerParser.parse(FIXTURE);
    expect(Array.isArray(result.globalSecurity)).toBe(true);
    expect(result.globalSecurity).toHaveLength(1);
    expect(result.globalSecurity![0]).toHaveProperty('TokenAuth');
  });

  it('extracts securitySchemes — TokenAuth apiKey in header', async () => {
    const result = await SwaggerParser.parse(FIXTURE);
    const scheme = result.securitySchemes['TokenAuth'] as Record<string, unknown>;
    expect(scheme['type']).toBe('apiKey');
    expect(scheme['in']).toBe('header');
    expect(scheme['name']).toBe('Token');
  });

  it('produces 2 groups: Ping and User', async () => {
    const result = await SwaggerParser.parse(FIXTURE);
    const groupNames = result.groups.map((g) => g.groupName).sort();
    expect(groupNames).toEqual(['Ping', 'User']);
  });

  it('Ping group has 1 endpoint: GET /ping', async () => {
    const result = await SwaggerParser.parse(FIXTURE);
    const ping = result.groups.find((g) => g.tagSlug === 'ping')!;
    expect(ping.endpoints).toHaveLength(1);
    const ep = ping.endpoints[0];
    expect(ep.method).toBe('GET');
    expect(ep.path).toBe('/ping');
    expect(ep.operationId).toBe('getPing');
  });

  it('GET /ping has security: [] (no-auth override)', async () => {
    const result = await SwaggerParser.parse(FIXTURE);
    const ping = result.groups.find((g) => g.tagSlug === 'ping')!;
    const ep = ping.endpoints[0];
    expect(ep.security).toEqual([]);
  });

  it('User group has 5 endpoints', async () => {
    const result = await SwaggerParser.parse(FIXTURE);
    const user = result.groups.find((g) => g.tagSlug === 'user')!;
    expect(user.endpoints).toHaveLength(5);
  });

  it('POST /users has required requestBody with schema constraints', async () => {
    const result = await SwaggerParser.parse(FIXTURE);
    const user = result.groups.find((g) => g.tagSlug === 'user')!;
    const post = user.endpoints.find((e) => e.operationId === 'createUser')!;

    expect(post.requestBody).toBeDefined();
    expect(post.requestBody!.required).toBe(true);
    expect(post.requestBody!.contentType).toBe('application/json');

    const schema = post.requestBody!.schema as Record<string, Record<string, unknown>>;
    expect(schema['required']).toContain('name');
    expect(schema['required']).toContain('email');
  });

  it('POST /users requestBody has contents map (2.3)', async () => {
    const result = await SwaggerParser.parse(FIXTURE);
    const user = result.groups.find((g) => g.tagSlug === 'user')!;
    const post = user.endpoints.find((e) => e.operationId === 'createUser')!;

    expect(post.requestBody!.contents).toBeDefined();
    expect(post.requestBody!.contents).toHaveProperty('application/json');
    expect(post.requestBody!.contents['application/json'].schema).toBeDefined();
  });

  it('POST /users requestBody has examples[] from shorthand example (2.12)', async () => {
    const result = await SwaggerParser.parse(FIXTURE);
    const user = result.groups.find((g) => g.tagSlug === 'user')!;
    const post = user.endpoints.find((e) => e.operationId === 'createUser')!;

    expect(Array.isArray(post.requestBody!.examples)).toBe(true);
    expect(post.requestBody!.examples!.length).toBeGreaterThan(0);
    const ex = post.requestBody!.examples![0] as Record<string, unknown>;
    expect(ex['name']).toBe('Jane Doe');
    expect(ex['email']).toBe('jane@example.com');
  });

  it('POST /users has Lng header parameter (required)', async () => {
    const result = await SwaggerParser.parse(FIXTURE);
    const user = result.groups.find((g) => g.tagSlug === 'user')!;
    const post = user.endpoints.find((e) => e.operationId === 'createUser')!;

    const lngParam = post.parameters.find((p) => p.name === 'Lng' && p.in === 'header');
    expect(lngParam).toBeDefined();
    expect(lngParam!.required).toBe(true);
  });

  it('GET /users query params carry minimum/maximum/default (2.2)', async () => {
    const result = await SwaggerParser.parse(FIXTURE);
    const user = result.groups.find((g) => g.tagSlug === 'user')!;
    const getUsers = user.endpoints.find((e) => e.operationId === 'getUsers')!;

    const limitParam = getUsers.parameters.find((p) => p.name === 'limit');
    expect(limitParam).toBeDefined();
    expect(limitParam!.minimum).toBe(1);
    expect(limitParam!.maximum).toBe(100);
    expect(limitParam!.default).toBe(20);
  });

  it('GET /users/{id} path param carries minimum (2.2)', async () => {
    const result = await SwaggerParser.parse(FIXTURE);
    const user = result.groups.find((g) => g.tagSlug === 'user')!;
    const getById = user.endpoints.find((e) => e.operationId === 'getUserById')!;

    const idParam = getById.parameters.find((p) => p.name === 'id' && p.in === 'path');
    expect(idParam).toBeDefined();
    expect(idParam!.minimum).toBe(1);
    expect(idParam!.required).toBe(true);
  });

  it('GET /ping 200 response has schema', async () => {
    const result = await SwaggerParser.parse(FIXTURE);
    const ping = result.groups.find((g) => g.tagSlug === 'ping')!;
    const ep = ping.endpoints[0];
    const resp200 = ep.responses.find((r) => r.statusCode === 200);
    expect(resp200).toBeDefined();
    expect(resp200!.schema).toBeDefined();
  });

  it('DELETE /users/{id} has 204 response with no schema', async () => {
    const result = await SwaggerParser.parse(FIXTURE);
    const user = result.groups.find((g) => g.tagSlug === 'user')!;
    const del = user.endpoints.find((e) => e.operationId === 'deleteUser')!;
    const resp204 = del.responses.find((r) => r.statusCode === 204);
    expect(resp204).toBeDefined();
    expect(resp204!.schema).toBeUndefined();
  });

  it('extractSecurityHeaderNames returns Token from apiKey scheme', async () => {
    const result = await SwaggerParser.parse(FIXTURE);
    const names = SwaggerParser.extractSecurityHeaderNames(result.securitySchemes);
    expect(names).toContain('Token');
  });

  it('non-existent file throws friendly error', async () => {
    await expect(SwaggerParser.parse('/no/such/file.yaml')).rejects.toThrow(
      'Swagger spec not found',
    );
  });
});
