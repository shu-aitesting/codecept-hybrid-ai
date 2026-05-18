import * as fs from 'node:fs';
import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

import { curlToModel, inferLooseSchema } from '../../../../../src/api/curl/CurlEndpointAdapter';
import { CurlConverter } from '../../../../../src/api/rest/CurlConverter';

const FIXTURES = path.resolve(__dirname, '../../../../api/_fixtures/sample-curls');

function readFixture(name: string): string {
  return fs.readFileSync(path.join(FIXTURES, name), 'utf-8');
}

describe('curlToModel', () => {
  describe('get-no-auth.txt — GET /ping no auth', () => {
    it('produces model with no auth', () => {
      const req = CurlConverter.fromCurl(readFixture('get-no-auth.txt'));
      const model = curlToModel(req, { serviceName: 'Ping' });

      expect(model.source).toBe('curl');
      expect(model.method).toBe('GET');
      expect(model.path).toBe('/ping');
      expect(model.operationId).toBe('getPing');
      expect(model.auth.required).toBe(false);
      expect(model.auth.scheme).toBe('none');
    });

    it('ambient flags all false when no ambient headers', () => {
      const req = CurlConverter.fromCurl(readFixture('get-no-auth.txt'));
      const model = curlToModel(req, { serviceName: 'Ping' });

      expect(model.headerParams.ambient.token).toBe(false);
      expect(model.headerParams.ambient.language).toBe(false);
      expect(model.headerParams.ambient.timezone).toBe(false);
    });

    it('no requestBody for GET', () => {
      const req = CurlConverter.fromCurl(readFixture('get-no-auth.txt'));
      const model = curlToModel(req, { serviceName: 'Ping' });
      expect(model.requestBody).toBeUndefined();
    });

    it('no pathParams for /ping', () => {
      const req = CurlConverter.fromCurl(readFixture('get-no-auth.txt'));
      const model = curlToModel(req, { serviceName: 'Ping' });
      expect(model.pathParams).toHaveLength(0);
    });
  });

  describe('get-with-token.txt — GET /users with Token + Lng + Tz', () => {
    it('auth detected: required true, scheme apiKey', () => {
      const req = CurlConverter.fromCurl(readFixture('get-with-token.txt'));
      const model = curlToModel(req, { serviceName: 'User' });

      expect(model.auth.required).toBe(true);
      expect(model.auth.headerName).toBe('Token');
      expect(model.auth.prefix).toBe('');
      expect(model.auth.scheme).toBe('apiKey');
    });

    it('ambient flags: token+language+timezone all true', () => {
      const req = CurlConverter.fromCurl(readFixture('get-with-token.txt'));
      const model = curlToModel(req, { serviceName: 'User' });

      expect(model.headerParams.ambient.token).toBe(true);
      expect(model.headerParams.ambient.language).toBe(true);
      expect(model.headerParams.ambient.timezone).toBe(true);
    });

    it('headerOverrides captures original Lng and Tz names', () => {
      const req = CurlConverter.fromCurl(readFixture('get-with-token.txt'));
      const model = curlToModel(req, { serviceName: 'User' });

      expect(model.headerOverrides?.language).toBe('Lng');
      expect(model.headerOverrides?.timezone).toBe('Tz');
    });

    it('path is /users, no path params', () => {
      const req = CurlConverter.fromCurl(readFixture('get-with-token.txt'));
      const model = curlToModel(req, { serviceName: 'User' });

      expect(model.path).toBe('/users');
      expect(model.pathParams).toHaveLength(0);
    });
  });

  describe('post-with-body.txt — POST /users with JSON body', () => {
    it('method POST, path /users', () => {
      const req = CurlConverter.fromCurl(readFixture('post-with-body.txt'));
      const model = curlToModel(req, { serviceName: 'User' });

      expect(model.method).toBe('POST');
      expect(model.path).toBe('/users');
    });

    it('requestBody inferred with JSON schema', () => {
      const req = CurlConverter.fromCurl(readFixture('post-with-body.txt'));
      const model = curlToModel(req, { serviceName: 'User' });

      expect(model.requestBody).toBeDefined();
      expect(model.requestBody!.contentType).toBe('application/json');
      const schema = model.requestBody!.schema as Record<string, unknown>;
      expect(schema['type']).toBe('object');
      const props = schema['properties'] as Record<string, Record<string, unknown>>;
      expect(props['name']['type']).toBe('string');
      expect(props['email']['type']).toBe('string');
    });

    it('requiredPaths are top-level non-null keys from body', () => {
      const req = CurlConverter.fromCurl(readFixture('post-with-body.txt'));
      const model = curlToModel(req, { serviceName: 'User' });

      expect(model.requestBody!.requiredPaths).toContain('name');
      expect(model.requestBody!.requiredPaths).toContain('email');
      expect(model.requestBody!.requiredPaths).toContain('role');
    });

    it('auth detected from Token header', () => {
      const req = CurlConverter.fromCurl(readFixture('post-with-body.txt'));
      const model = curlToModel(req, { serviceName: 'User' });

      expect(model.auth.required).toBe(true);
      expect(model.auth.headerName).toBe('Token');
    });
  });

  describe('path tokenization', () => {
    it('numeric segment replaced with {id}', () => {
      const req = CurlConverter.fromCurl('curl -X GET "https://api.example.com/users/123"');
      const model = curlToModel(req, { serviceName: 'User' });

      expect(model.path).toBe('/users/{id}');
      expect(model.pathParams).toHaveLength(1);
      expect(model.pathParams[0].name).toBe('id');
      expect(model.pathParams[0].in).toBe('path');
      expect(model.pathParams[0].required).toBe(true);
    });

    it('UUID segment replaced with {id}', () => {
      const req = CurlConverter.fromCurl(
        'curl -X DELETE "https://api.example.com/items/550e8400-e29b-41d4-a716-446655440000"',
      );
      const model = curlToModel(req, { serviceName: 'Item' });

      expect(model.path).toBe('/items/{id}');
      expect(model.pathParams).toHaveLength(1);
    });

    it('pathTemplate overrides auto-tokenization', () => {
      const req = CurlConverter.fromCurl('curl -X GET "https://api.example.com/users/123"');
      const model = curlToModel(req, { serviceName: 'User', pathTemplate: '/users/{userId}' });

      expect(model.path).toBe('/users/{userId}');
      expect(model.pathParams[0].name).toBe('userId');
    });

    it('non-numeric segments not replaced', () => {
      const req = CurlConverter.fromCurl('curl -X GET "https://api.example.com/health/status"');
      const model = curlToModel(req, { serviceName: 'Health' });

      expect(model.path).toBe('/health/status');
      expect(model.pathParams).toHaveLength(0);
    });
  });

  describe('withResponse option', () => {
    it('populates responses when withResponse provided', () => {
      const req = CurlConverter.fromCurl(readFixture('post-with-body.txt'));
      const responseBody = JSON.parse(readFixture('post-with-response.json'));
      const model = curlToModel(req, {
        serviceName: 'User',
        withResponse: responseBody,
        expectedStatus: 201,
      });

      expect(model.responses).toHaveLength(1);
      expect(model.responses[0].statusCode).toBe(201);
      const schema = model.responses[0].schema as Record<string, unknown>;
      expect(schema['type']).toBe('object');
      const props = schema['properties'] as Record<string, Record<string, unknown>>;
      expect(props['id']['type']).toBe('integer');
    });

    it('empty responses when withResponse not provided', () => {
      const req = CurlConverter.fromCurl(readFixture('get-no-auth.txt'));
      const model = curlToModel(req, { serviceName: 'Ping' });
      expect(model.responses).toHaveLength(0);
    });
  });

  describe('source and tags', () => {
    it('source is always curl', () => {
      const req = CurlConverter.fromCurl(readFixture('get-no-auth.txt'));
      const model = curlToModel(req, { serviceName: 'Ping' });
      expect(model.source).toBe('curl');
    });

    it('tags = [serviceName]', () => {
      const req = CurlConverter.fromCurl(readFixture('get-with-token.txt'));
      const model = curlToModel(req, { serviceName: 'UserService' });
      expect(model.tags).toEqual(['UserService']);
    });
  });
});

describe('inferLooseSchema', () => {
  it('string → {type:string}', () => {
    expect(inferLooseSchema('hello')).toEqual({ type: 'string' });
  });

  it('integer → {type:integer}', () => {
    expect(inferLooseSchema(42)).toEqual({ type: 'integer' });
  });

  it('float → {type:number}', () => {
    expect(inferLooseSchema(3.14)).toEqual({ type: 'number' });
  });

  it('boolean → {type:boolean}', () => {
    expect(inferLooseSchema(true)).toEqual({ type: 'boolean' });
  });

  it('null → {type:null}', () => {
    expect(inferLooseSchema(null)).toEqual({ type: 'null' });
  });

  it('array with items → {type:array, items:...}', () => {
    expect(inferLooseSchema([1, 2])).toEqual({ type: 'array', items: { type: 'integer' } });
  });

  it('empty array → {type:array}', () => {
    expect(inferLooseSchema([])).toEqual({ type: 'array' });
  });

  it('object → {type:object, properties:{...}}', () => {
    const result = inferLooseSchema({ name: 'John', age: 30 }) as Record<string, unknown>;
    expect(result['type']).toBe('object');
    const props = result['properties'] as Record<string, Record<string, unknown>>;
    expect(props['name']['type']).toBe('string');
    expect(props['age']['type']).toBe('integer');
  });
});
