import { describe, expect, it } from 'vitest';

import { CurlConverter } from '../../../../src/api/rest/CurlConverter';
import { RestMethod } from '../../../../src/api/rest/RestMethod';

// ─── basic parsing ────────────────────────────────────────────────────────────

describe('CurlConverter.fromCurl() — basic', () => {
  it('parses a minimal GET curl command', () => {
    const req = CurlConverter.fromCurl('curl https://api.example.com/users');
    expect(req.url).toBe('https://api.example.com/users');
    expect(req.method).toBe(RestMethod.GET);
  });

  it('defaults to GET when no -X flag', () => {
    const req = CurlConverter.fromCurl('curl "https://api.example.com/items"');
    expect(req.method).toBe(RestMethod.GET);
  });

  it('parses explicit -X POST', () => {
    const req = CurlConverter.fromCurl(
      `curl -X POST "https://api.example.com/users" -d '{"name":"Alice"}'`,
    );
    expect(req.method).toBe(RestMethod.POST);
  });

  it('parses -X DELETE', () => {
    const req = CurlConverter.fromCurl('curl -X DELETE "https://api.example.com/users/1"');
    expect(req.method).toBe(RestMethod.DELETE);
  });

  it('handles multiline curl with backslash continuations', () => {
    const curl = [
      'curl -X GET \\',
      '  "https://api.example.com/data" \\',
      '  -H "Accept: application/json"',
    ].join('\n');
    const req = CurlConverter.fromCurl(curl);
    expect(req.method).toBe(RestMethod.GET);
    expect(req.headers['accept']).toBe('application/json');
  });
});

// ─── query string parsing ─────────────────────────────────────────────────────

describe('CurlConverter.fromCurl() — query string → params', () => {
  it('extracts single query param from URL', () => {
    const req = CurlConverter.fromCurl('curl "https://api.example.com/users?role=admin"');
    expect(req.params).toEqual({ role: 'admin' });
    expect(req.url).toBe('https://api.example.com/users');
  });

  it('extracts multiple query params', () => {
    const req = CurlConverter.fromCurl('curl "https://api.example.com/users?page=2&limit=10"');
    expect(req.params).toEqual({ page: '2', limit: '10' });
  });

  it('URL-decodes query param keys and values', () => {
    const req = CurlConverter.fromCurl('curl "https://api.example.com/search?q=hello%20world"');
    expect(req.params['q']).toBe('hello world');
  });

  it('param with no value gets empty string', () => {
    const req = CurlConverter.fromCurl('curl "https://api.example.com/users?active"');
    expect(req.params['active']).toBe('');
  });

  it('URL without query string has empty params', () => {
    const req = CurlConverter.fromCurl('curl "https://api.example.com/users"');
    expect(req.params).toEqual({});
  });

  it('buildUrl() reconstructs query string from params', () => {
    const req = CurlConverter.fromCurl('curl "https://api.example.com/users?page=1&limit=5"');
    const built = req.buildUrl();
    expect(built).toContain('page=1');
    expect(built).toContain('limit=5');
  });
});

// ─── header parsing ───────────────────────────────────────────────────────────

describe('CurlConverter.fromCurl() — headers', () => {
  it('parses single -H header', () => {
    const req = CurlConverter.fromCurl(
      'curl -H "Content-Type: application/json" "https://api.example.com"',
    );
    expect(req.headers['content-type']).toBe('application/json');
  });

  it('parses multiple -H headers', () => {
    const curl = `curl -H "Content-Type: application/json" -H "Accept: application/json" "https://api.example.com"`;
    const req = CurlConverter.fromCurl(curl);
    expect(req.headers['content-type']).toBe('application/json');
    expect(req.headers['accept']).toBe('application/json');
  });

  it('lowercases header names', () => {
    const req = CurlConverter.fromCurl(
      'curl -H "X-Custom-Header: value" "https://api.example.com"',
    );
    expect(req.headers['x-custom-header']).toBe('value');
  });

  it('no headers → empty object', () => {
    const req = CurlConverter.fromCurl('curl "https://api.example.com"');
    expect(req.headers).toEqual({});
  });
});

// ─── body parsing ─────────────────────────────────────────────────────────────

describe('CurlConverter.fromCurl() — body', () => {
  it('parses -d JSON body', () => {
    const req = CurlConverter.fromCurl(
      `curl -X POST "https://api.example.com" -d '{"name":"Alice","age":30}'`,
    );
    expect(req.body).toEqual({ name: 'Alice', age: 30 });
  });

  it('parses --data-raw JSON body', () => {
    const req = CurlConverter.fromCurl(
      `curl -X POST "https://api.example.com" --data-raw '{"key":"val"}'`,
    );
    expect(req.body).toEqual({ key: 'val' });
  });

  it('keeps body as string when not valid JSON', () => {
    const req = CurlConverter.fromCurl(
      `curl -X POST "https://api.example.com" -d 'plain text body'`,
    );
    expect(req.body).toBe('plain text body');
  });

  it('no body → body is undefined', () => {
    const req = CurlConverter.fromCurl('curl "https://api.example.com"');
    expect(req.body).toBeUndefined();
  });
});

// ─── auth scheme detection ────────────────────────────────────────────────────

describe('CurlConverter.fromCurl() — authScheme detection', () => {
  it('detects Bearer token → authScheme "bearer"', () => {
    const req = CurlConverter.fromCurl(
      'curl -H "Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.abc.def" "https://api.example.com"',
    );
    expect(req.authScheme).toBe('bearer');
  });

  it('detects Basic auth → authScheme "basic"', () => {
    const req = CurlConverter.fromCurl(
      'curl -H "Authorization: Basic dXNlcjpwYXNz" "https://api.example.com"',
    );
    expect(req.authScheme).toBe('basic');
  });

  it('detects ApiKey-style header → authScheme "apikey"', () => {
    const req = CurlConverter.fromCurl(
      'curl -H "Authorization: ApiKey abc123" "https://api.example.com"',
    );
    expect(req.authScheme).toBe('apikey');
  });

  it('no Authorization header → authScheme null', () => {
    const req = CurlConverter.fromCurl('curl "https://api.example.com"');
    expect(req.authScheme).toBeNull();
  });

  it('authScheme is null when only x-api-key header (no Authorization)', () => {
    const req = CurlConverter.fromCurl('curl -H "x-api-key: my-secret" "https://api.example.com"');
    // x-api-key is not the Authorization header — authScheme reflects Authorization only
    expect(req.authScheme).toBeNull();
  });
});

// ─── roundtrip / toCurl ───────────────────────────────────────────────────────

describe('CurlConverter.toCurl()', () => {
  it('reconstructs a curl command from a RestRequest', () => {
    const req = CurlConverter.fromCurl(
      `curl -X POST "https://api.example.com/users" -H "Content-Type: application/json" -d '{"name":"Bob"}'`,
    );
    const curl = CurlConverter.toCurl(req);
    expect(curl).toContain('POST');
    expect(curl).toContain('api.example.com/users');
  });
});
