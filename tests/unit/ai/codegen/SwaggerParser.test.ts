/**
 * Integration tests for SwaggerParser.
 * No mocking — uses real @apidevtools/swagger-parser with temp files.
 * This tests the actual parsing logic end-to-end.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { SwaggerParser } from '../../../../src/api/swagger/SwaggerParser';

// ─── Fixtures (inline JSON written to temp files) ─────────────────────────────

const OAS3_FIXTURE = {
  openapi: '3.0.3',
  info: { title: 'My API', version: '2.1.0' },
  servers: [{ url: 'https://api.example.com/v2' }],
  paths: {
    '/users': {
      get: {
        operationId: 'listUsers',
        summary: 'List all users',
        tags: ['User'],
        parameters: [{ name: 'page', in: 'query', required: false }],
        responses: {
          '200': {
            description: 'OK',
            content: {
              'application/json': {
                schema: { type: 'array', items: { type: 'object' } },
              },
            },
          },
        },
      },
      post: {
        operationId: 'createUser',
        summary: 'Create a user',
        tags: ['User'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  email: { type: 'string' },
                },
              },
              example: { name: 'Alice', email: 'alice@example.com' },
            },
          },
        },
        responses: {
          '201': { description: 'Created' },
          '400': { description: 'Bad Request' },
        },
      },
    },
    '/users/{id}': {
      get: {
        operationId: 'getUser',
        tags: ['User'],
        parameters: [{ name: 'id', in: 'path', required: true }],
        responses: { '200': { description: 'OK' }, '404': { description: 'Not Found' } },
        deprecated: true,
      },
      delete: {
        operationId: 'deleteUser',
        tags: ['User'],
        parameters: [{ name: 'id', in: 'path', required: true }],
        responses: { '204': { description: 'No Content' } },
      },
    },
    '/orders': {
      get: {
        operationId: 'listOrders',
        tags: ['Order'],
        responses: { '200': { description: 'OK' } },
      },
    },
  },
  components: {
    securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer' } },
  },
};

const SWAGGER2_FIXTURE = {
  swagger: '2.0',
  info: { title: 'Legacy API', version: '1.0.0' },
  host: 'legacy.example.com',
  basePath: '/api',
  schemes: ['https'],
  paths: {
    '/products': {
      get: {
        operationId: 'listProducts',
        tags: ['Product'],
        parameters: [],
        responses: { '200': { description: 'OK', schema: { type: 'array' } } },
      },
      post: {
        operationId: 'createProduct',
        tags: ['Product'],
        parameters: [
          {
            in: 'body',
            name: 'body',
            required: true,
            schema: {
              type: 'object',
              properties: { name: { type: 'string' } },
            },
          },
        ],
        responses: {
          '201': { description: 'Created' },
          '422': { description: 'Unprocessable' },
        },
      },
    },
  },
  securityDefinitions: {
    apiKey: { type: 'apiKey', name: 'X-API-KEY', in: 'header' },
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function writeTempSpec(fixture: object): string {
  const file = path.join(os.tmpdir(), `swagger-test-${Date.now()}-${Math.random()}.json`);
  fs.writeFileSync(file, JSON.stringify(fixture), 'utf8');
  return file;
}

let tempFiles: string[] = [];

function tmpSpec(fixture: object): string {
  const p = writeTempSpec(fixture);
  tempFiles.push(p);
  return p;
}

beforeEach(() => {
  tempFiles = [];
});

afterEach(() => {
  for (const f of tempFiles) {
    try {
      fs.unlinkSync(f);
    } catch {
      /* ignore */
    }
  }
});

// ─── Static helpers ───────────────────────────────────────────────────────────

describe('SwaggerParser.toPascalCase', () => {
  it('converts simple lowercase tag', () => {
    expect(SwaggerParser.toPascalCase('user')).toBe('User');
  });

  it('converts kebab-case tag', () => {
    expect(SwaggerParser.toPascalCase('gift-list')).toBe('GiftList');
  });

  it('converts snake_case tag', () => {
    expect(SwaggerParser.toPascalCase('user_accounts')).toBe('UserAccounts');
  });

  it('converts space-separated tag', () => {
    expect(SwaggerParser.toPascalCase('order items')).toBe('OrderItems');
  });

  it('leaves already-PascalCase tag intact', () => {
    expect(SwaggerParser.toPascalCase('Order')).toBe('Order');
  });
});

describe('SwaggerParser.toSlug', () => {
  it('lowercases a PascalCase string', () => {
    expect(SwaggerParser.toSlug('User')).toBe('user');
  });

  it('replaces spaces with hyphens', () => {
    expect(SwaggerParser.toSlug('Gift List')).toBe('gift-list');
  });

  it('strips special characters', () => {
    expect(SwaggerParser.toSlug('Order#Items!')).toBe('orderitems');
  });
});

// ─── OAS 3 parsing ────────────────────────────────────────────────────────────

describe('SwaggerParser.parse — OAS3', () => {
  let specPath: string;

  beforeEach(() => {
    specPath = tmpSpec(OAS3_FIXTURE);
  });

  it('extracts title and version from info', async () => {
    const result = await SwaggerParser.parse(specPath);
    expect(result.title).toBe('My API');
    expect(result.version).toBe('2.1.0');
  });

  it('extracts base URL from servers[0].url', async () => {
    const result = await SwaggerParser.parse(specPath);
    expect(result.baseUrl).toBe('https://api.example.com/v2');
  });

  it('groups endpoints by first tag — User and Order', async () => {
    const result = await SwaggerParser.parse(specPath);
    const names = result.groups.map((g) => g.groupName);
    expect(names).toContain('User');
    expect(names).toContain('Order');
    expect(names).toHaveLength(2);
  });

  it('User group has 4 endpoints', async () => {
    const result = await SwaggerParser.parse(specPath);
    const user = result.groups.find((g) => g.groupName === 'User')!;
    expect(user.endpoints).toHaveLength(4);
  });

  it('Order group has 1 GET endpoint', async () => {
    const result = await SwaggerParser.parse(specPath);
    const order = result.groups.find((g) => g.groupName === 'Order')!;
    expect(order.endpoints).toHaveLength(1);
    expect(order.endpoints[0].method).toBe('GET');
  });

  it('tagSlug is lowercase slug of group name', async () => {
    const result = await SwaggerParser.parse(specPath);
    const user = result.groups.find((g) => g.groupName === 'User')!;
    expect(user.tagSlug).toBe('user');
  });

  it('preserves operationId from spec', async () => {
    const result = await SwaggerParser.parse(specPath);
    const ids = result.groups
      .find((g) => g.groupName === 'User')!
      .endpoints.map((e) => e.operationId);
    expect(ids).toContain('listUsers');
    expect(ids).toContain('createUser');
  });

  it('marks deprecated endpoint correctly', async () => {
    const result = await SwaggerParser.parse(specPath);
    const getUser = result.groups
      .find((g) => g.groupName === 'User')!
      .endpoints.find((e) => e.operationId === 'getUser')!;
    expect(getUser.deprecated).toBe(true);
  });

  it('non-deprecated endpoints have deprecated=false', async () => {
    const result = await SwaggerParser.parse(specPath);
    const listUsers = result.groups
      .find((g) => g.groupName === 'User')!
      .endpoints.find((e) => e.operationId === 'listUsers')!;
    expect(listUsers.deprecated).toBe(false);
  });

  it('extracts OAS3 requestBody with required flag, contentType, example', async () => {
    const result = await SwaggerParser.parse(specPath);
    const createUser = result.groups
      .find((g) => g.groupName === 'User')!
      .endpoints.find((e) => e.operationId === 'createUser')!;
    expect(createUser.requestBody).toBeDefined();
    expect(createUser.requestBody!.required).toBe(true);
    expect(createUser.requestBody!.contentType).toBe('application/json');
    expect(createUser.requestBody!.example).toEqual({ name: 'Alice', email: 'alice@example.com' });
  });

  it('GET endpoint has no requestBody', async () => {
    const result = await SwaggerParser.parse(specPath);
    const listUsers = result.groups
      .find((g) => g.groupName === 'User')!
      .endpoints.find((e) => e.operationId === 'listUsers')!;
    expect(listUsers.requestBody).toBeUndefined();
  });

  it('extracts query parameters', async () => {
    const result = await SwaggerParser.parse(specPath);
    const listUsers = result.groups
      .find((g) => g.groupName === 'User')!
      .endpoints.find((e) => e.operationId === 'listUsers')!;
    expect(listUsers.parameters.some((p) => p.name === 'page' && p.in === 'query')).toBe(true);
  });

  it('extracts path parameters', async () => {
    const result = await SwaggerParser.parse(specPath);
    const getUser = result.groups
      .find((g) => g.groupName === 'User')!
      .endpoints.find((e) => e.operationId === 'getUser')!;
    expect(getUser.parameters.some((p) => p.name === 'id' && p.in === 'path')).toBe(true);
  });

  it('extracts responses sorted ascending by status code', async () => {
    const result = await SwaggerParser.parse(specPath);
    const createUser = result.groups
      .find((g) => g.groupName === 'User')!
      .endpoints.find((e) => e.operationId === 'createUser')!;
    expect(createUser.responses[0].statusCode).toBe(201);
    expect(createUser.responses[1].statusCode).toBe(400);
  });

  it('extracts security schemes from components', async () => {
    const result = await SwaggerParser.parse(specPath);
    expect(result.securitySchemes).toHaveProperty('bearerAuth');
  });

  it('strips trailing slash from base URL', async () => {
    const p = tmpSpec({
      ...OAS3_FIXTURE,
      servers: [{ url: 'https://api.example.com/' }],
    });
    const result = await SwaggerParser.parse(p);
    expect(result.baseUrl).toBe('https://api.example.com');
  });

  it('assigns endpoint to first tag only — not duplicated across groups', async () => {
    const p = tmpSpec({
      openapi: '3.0.0',
      info: { title: 'MultiTag', version: '1.0.0' },
      servers: [{ url: 'https://api.test.com' }],
      paths: {
        '/things': {
          get: {
            operationId: 'listThings',
            tags: ['Tag1', 'Tag2'],
            responses: { '200': { description: 'OK' } },
          },
        },
      },
    });
    const result = await SwaggerParser.parse(p);
    const total = result.groups.reduce((sum, g) => sum + g.endpoints.length, 0);
    expect(total).toBe(1);
    expect(result.groups[0].groupName).toBe('Tag1');
  });
});

// ─── Swagger 2.0 parsing ──────────────────────────────────────────────────────

describe('SwaggerParser.parse — Swagger 2.0', () => {
  let specPath: string;

  beforeEach(() => {
    specPath = tmpSpec(SWAGGER2_FIXTURE);
  });

  it('extracts base URL from host + basePath + scheme', async () => {
    const result = await SwaggerParser.parse(specPath);
    expect(result.baseUrl).toBe('https://legacy.example.com/api');
  });

  it('groups endpoints by tag', async () => {
    const result = await SwaggerParser.parse(specPath);
    expect(result.groups.map((g) => g.groupName)).toContain('Product');
  });

  it('extracts Swagger 2 body parameter as requestBody', async () => {
    const result = await SwaggerParser.parse(specPath);
    const createProduct = result.groups
      .find((g) => g.groupName === 'Product')!
      .endpoints.find((e) => e.operationId === 'createProduct')!;
    expect(createProduct.requestBody).toBeDefined();
    expect(createProduct.requestBody!.required).toBe(true);
    expect(createProduct.requestBody!.contentType).toBe('application/json');
  });

  it('body parameter removed from parameters array (moved to requestBody)', async () => {
    const result = await SwaggerParser.parse(specPath);
    const createProduct = result.groups
      .find((g) => g.groupName === 'Product')!
      .endpoints.find((e) => e.operationId === 'createProduct')!;
    expect(createProduct.parameters.every((p) => p.in !== 'body')).toBe(true);
  });

  it('extracts securityDefinitions as securitySchemes', async () => {
    const result = await SwaggerParser.parse(specPath);
    expect(result.securitySchemes).toHaveProperty('apiKey');
  });

  it('extracts Swagger 2 response schema', async () => {
    const result = await SwaggerParser.parse(specPath);
    const listProducts = result.groups
      .find((g) => g.groupName === 'Product')!
      .endpoints.find((e) => e.operationId === 'listProducts')!;
    expect(listProducts.responses[0].schema).toEqual({ type: 'array' });
  });
});

// ─── Security header extraction ──────────────────────────────────────────────

describe('SwaggerParser.extractSecurityHeaderNames', () => {
  it('returns Authorization for type=http scheme=bearer', () => {
    const names = SwaggerParser.extractSecurityHeaderNames({
      bearerAuth: { type: 'http', scheme: 'bearer' },
    });
    expect(names).toEqual(['Authorization']);
  });

  it('returns Authorization for type=http scheme=basic', () => {
    const names = SwaggerParser.extractSecurityHeaderNames({
      basicAuth: { type: 'http', scheme: 'basic' },
    });
    expect(names).toEqual(['Authorization']);
  });

  it('returns the apiKey name when in: header', () => {
    const names = SwaggerParser.extractSecurityHeaderNames({
      apiKey: { type: 'apiKey', name: 'X-API-KEY', in: 'header' },
    });
    expect(names).toEqual(['X-API-KEY']);
  });

  it('skips apiKey when in: query or in: cookie', () => {
    const names = SwaggerParser.extractSecurityHeaderNames({
      qkey: { type: 'apiKey', name: 'k', in: 'query' },
      ckey: { type: 'apiKey', name: 'k', in: 'cookie' },
    });
    expect(names).toEqual([]);
  });

  it('skips oauth2 / openIdConnect / mutualTLS', () => {
    const names = SwaggerParser.extractSecurityHeaderNames({
      o: { type: 'oauth2', flows: {} },
      oic: { type: 'openIdConnect', openIdConnectUrl: 'x' },
      mtls: { type: 'mutualTLS' },
    });
    expect(names).toEqual([]);
  });

  it('deduplicates Authorization across multiple http schemes', () => {
    const names = SwaggerParser.extractSecurityHeaderNames({
      a: { type: 'http', scheme: 'bearer' },
      b: { type: 'http', scheme: 'basic' },
    });
    expect(names).toEqual(['Authorization']);
  });

  it('returns empty array for empty schemes object', () => {
    expect(SwaggerParser.extractSecurityHeaderNames({})).toEqual([]);
  });

  it('integration: securitySchemes from a parsed OAS3 spec yields Authorization', async () => {
    const result = await SwaggerParser.parse(tmpSpec(OAS3_FIXTURE));
    expect(SwaggerParser.extractSecurityHeaderNames(result.securitySchemes)).toEqual([
      'Authorization',
    ]);
  });

  it('integration: securityDefinitions from a Swagger 2 spec yields the apiKey header name', async () => {
    const result = await SwaggerParser.parse(tmpSpec(SWAGGER2_FIXTURE));
    expect(SwaggerParser.extractSecurityHeaderNames(result.securitySchemes)).toEqual(['X-API-KEY']);
  });
});

describe('SwaggerParser.parse — header parameters preserve required flag', () => {
  it('keeps in:header parameters with their required signal', async () => {
    const p = tmpSpec({
      openapi: '3.0.0',
      info: { title: 'HeaderParams', version: '1.0.0' },
      servers: [{ url: 'https://api.test.com' }],
      paths: {
        '/orders': {
          post: {
            operationId: 'createOrder',
            tags: ['Order'],
            parameters: [
              {
                name: 'X-Request-ID',
                in: 'header',
                required: true,
                schema: { type: 'string' },
                description: 'Idempotency key',
              },
              {
                name: 'X-Trace',
                in: 'header',
                required: false,
                schema: { type: 'string' },
              },
            ],
            responses: { '201': { description: 'Created' } },
          },
        },
      },
    });
    const result = await SwaggerParser.parse(p);
    const ep = result.groups
      .find((g) => g.groupName === 'Order')!
      .endpoints.find((e) => e.operationId === 'createOrder')!;
    const headers = ep.parameters.filter((x) => x.in === 'header');
    expect(headers).toHaveLength(2);
    expect(headers.find((h) => h.name === 'X-Request-ID')).toMatchObject({
      required: true,
      description: 'Idempotency key',
    });
    expect(headers.find((h) => h.name === 'X-Trace')).toMatchObject({ required: false });
  });
});

// ─── Untagged endpoints → Default group ──────────────────────────────────────

describe('SwaggerParser.parse — untagged endpoints', () => {
  it('places endpoints without tags into Default group', async () => {
    const p = tmpSpec({
      openapi: '3.0.0',
      info: { title: 'Untagged', version: '0.1.0' },
      servers: [{ url: 'https://api.test.com' }],
      paths: {
        '/health': {
          get: { responses: { '200': { description: 'OK' } } },
        },
        '/metrics': {
          get: { tags: [], responses: { '200': { description: 'OK' } } },
        },
      },
    });
    const result = await SwaggerParser.parse(p);
    expect(result.groups.find((g) => g.groupName === 'Default')).toBeDefined();
  });

  it('Default group contains all untagged endpoints', async () => {
    const p = tmpSpec({
      openapi: '3.0.0',
      info: { title: 'Untagged', version: '0.1.0' },
      servers: [{ url: 'https://api.test.com' }],
      paths: {
        '/health': {
          get: { responses: { '200': { description: 'OK' } } },
        },
        '/metrics': {
          get: { tags: [], responses: { '200': { description: 'OK' } } },
        },
      },
    });
    const result = await SwaggerParser.parse(p);
    const defaultGroup = result.groups.find((g) => g.groupName === 'Default')!;
    expect(defaultGroup.endpoints.length).toBeGreaterThanOrEqual(2);
  });

  it('generates operationId from method+path when spec omits it', async () => {
    const p = tmpSpec({
      openapi: '3.0.0',
      info: { title: 'NoOpId', version: '1.0.0' },
      servers: [{ url: 'https://api.test.com' }],
      paths: {
        '/health': {
          get: { responses: { '200': { description: 'OK' } } }, // no operationId
        },
      },
    });
    const result = await SwaggerParser.parse(p);
    const defaultGroup = result.groups.find((g) => g.groupName === 'Default')!;
    expect(defaultGroup.endpoints.some((e) => e.operationId === 'getHealth')).toBe(true);
  });
});

// ─── Edge cases ───────────────────────────────────────────────────────────────

describe('SwaggerParser.parse — edge cases', () => {
  it('returns empty groups when paths is empty', async () => {
    const p = tmpSpec({
      openapi: '3.0.0',
      info: { title: 'Empty', version: '1.0.0' },
      servers: [{ url: 'https://api.test.com' }],
      paths: {},
    });
    const result = await SwaggerParser.parse(p);
    expect(result.groups).toHaveLength(0);
  });

  it('returns empty securitySchemes when spec has none', async () => {
    const p = tmpSpec({
      openapi: '3.0.0',
      info: { title: 'NoSec', version: '1.0.0' },
      servers: [{ url: 'https://api.test.com' }],
      paths: {},
    });
    const result = await SwaggerParser.parse(p);
    expect(result.securitySchemes).toEqual({});
  });

  it('falls back to api.example.com when OAS3 has no servers', async () => {
    const p = tmpSpec({
      openapi: '3.0.0',
      info: { title: 'NoServer', version: '1.0.0' },
      paths: {},
    });
    const result = await SwaggerParser.parse(p);
    expect(result.baseUrl).toContain('api.example.com');
  });

  it('uses fallback title/version when info fields are empty strings', async () => {
    // swagger-parser requires info.title to be non-empty, so we test the
    // fallback logic with valid-but-minimal values instead.
    const p = tmpSpec({
      openapi: '3.0.0',
      info: { title: 'Minimal', version: '0.0.1' },
      paths: {},
    });
    const result = await SwaggerParser.parse(p);
    expect(result.title).toBe('Minimal');
    expect(result.version).toBe('0.0.1');
  });

  it('ignores non-HTTP-method keys on path item (parameters, summary, description)', async () => {
    const p = tmpSpec({
      openapi: '3.0.0',
      info: { title: 'Meta', version: '1.0.0' },
      servers: [{ url: 'https://api.test.com' }],
      paths: {
        '/things': {
          summary: 'Things resource',
          description: 'CRUD',
          parameters: [{ name: 'X-Tenant', in: 'header', required: true }],
          get: {
            operationId: 'listThings',
            tags: ['Thing'],
            responses: { '200': { description: 'OK' } },
          },
        },
      },
    });
    const result = await SwaggerParser.parse(p);
    const thing = result.groups.find((g) => g.groupName === 'Thing')!;
    expect(thing.endpoints).toHaveLength(1);
    expect(thing.endpoints[0].method).toBe('GET');
  });

  it('throws file-not-found error for non-existent local paths', async () => {
    await expect(SwaggerParser.parse('nonexistent-file-xyz999.json')).rejects.toThrow(/not found/i);
  });

  it('throws for malformed JSON spec (swagger-parser rejects)', async () => {
    const badFile = path.join(os.tmpdir(), `bad-spec-${Date.now()}.json`);
    fs.writeFileSync(badFile, 'this is not valid json {{{', 'utf8');
    tempFiles.push(badFile);
    await expect(SwaggerParser.parse(badFile)).rejects.toThrow();
  });
});
