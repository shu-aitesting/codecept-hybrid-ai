import { describe, expect, it } from 'vitest';

import { classify, headerToParamName } from '../../../../src/ai/codegen/headerClassifier';

describe('headerToParamName', () => {
  it('lowercases a single word', () => {
    expect(headerToParamName('Accept')).toBe('accept');
  });

  it('camelCases hyphen-separated', () => {
    expect(headerToParamName('X-Request-ID')).toBe('xRequestId');
  });

  it('camelCases mixed-case header', () => {
    expect(headerToParamName('X-API-Key')).toBe('xApiKey');
  });

  it('handles underscore separators', () => {
    expect(headerToParamName('X_Tenant_Id')).toBe('xTenantId');
  });

  it('returns single segment unchanged in lowercase', () => {
    expect(headerToParamName('Authorization')).toBe('authorization');
  });
});

describe('classify — Skipped tier', () => {
  it('drops sec-ch-ua headers', () => {
    const c = classify({
      'sec-ch-ua': '"Chrome"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"macOS"',
    });
    expect(c.skipped.map((h) => h.name)).toEqual(
      expect.arrayContaining(['sec-ch-ua', 'sec-ch-ua-mobile', 'sec-ch-ua-platform']),
    );
    expect(c.requiredParams).toHaveLength(0);
    expect(c.optionalParams).toHaveLength(0);
  });

  it('drops user-agent and priority', () => {
    const c = classify({ 'user-agent': 'Mozilla', priority: 'u=1' });
    expect(c.skipped).toHaveLength(2);
  });

  it('drops sec-fetch-* family', () => {
    const c = classify({
      'sec-fetch-mode': 'cors',
      'sec-fetch-site': 'same-origin',
      'sec-fetch-dest': 'empty',
    });
    expect(c.skipped).toHaveLength(3);
  });

  it('drops cookie / referer / origin / host', () => {
    const c = classify({
      cookie: 'a=b',
      referer: 'https://x',
      origin: 'https://x',
      host: 'x.com',
    });
    expect(c.skipped).toHaveLength(4);
  });
});

describe('classify — Ambient tier', () => {
  it('routes Authorization to ambient.token', () => {
    const c = classify({ Authorization: 'Bearer abc' });
    expect(c.ambient.token).toBe('Bearer abc');
    expect(c.requiredParams).toHaveLength(0);
    expect(c.optionalParams).toHaveLength(0);
  });

  it('routes lowercase token alias to ambient.token', () => {
    const c = classify({ token: 'xyz' });
    expect(c.ambient.token).toBe('xyz');
  });

  it('routes x-auth-token alias to ambient.token', () => {
    const c = classify({ 'x-auth-token': 'tok' });
    expect(c.ambient.token).toBe('tok');
  });

  it('routes Accept-Language to ambient.language', () => {
    const c = classify({ 'Accept-Language': 'en-US' });
    expect(c.ambient.language).toBe('en-US');
  });

  it('routes ln alias to ambient.language', () => {
    const c = classify({ ln: 'vi' });
    expect(c.ambient.language).toBe('vi');
  });

  it('routes X-Timezone to ambient.timezone', () => {
    const c = classify({ 'X-Timezone': 'UTC' });
    expect(c.ambient.timezone).toBe('UTC');
  });

  it('routes tz alias to ambient.timezone', () => {
    const c = classify({ tz: 'Asia/Ho_Chi_Minh' });
    expect(c.ambient.timezone).toBe('Asia/Ho_Chi_Minh');
  });

  it('matching is case-insensitive', () => {
    const c = classify({ AUTHORIZATION: 'Bearer X', LN: 'kk', TZ: 'UTC' });
    expect(c.ambient.token).toBe('Bearer X');
    expect(c.ambient.language).toBe('kk');
    expect(c.ambient.timezone).toBe('UTC');
  });
});

describe('classify — Required tier (Swagger)', () => {
  it('emits requiredParams for required:true Swagger headers', () => {
    const c = classify(
      {},
      {
        swaggerHeaders: [{ name: 'X-Request-ID', required: true, schema: { type: 'string' } }],
      },
    );
    expect(c.requiredParams).toHaveLength(1);
    expect(c.requiredParams[0]).toMatchObject({
      name: 'X-Request-ID',
      paramName: 'xRequestId',
      type: 'string',
    });
  });

  it('infers number type from integer schema', () => {
    const c = classify(
      {},
      {
        swaggerHeaders: [{ name: 'X-Tenant-Id', required: true, schema: { type: 'integer' } }],
      },
    );
    expect(c.requiredParams[0].type).toBe('number');
  });

  it('infers boolean type from boolean schema', () => {
    const c = classify(
      {},
      {
        swaggerHeaders: [{ name: 'X-Debug', required: true, schema: { type: 'boolean' } }],
      },
    );
    expect(c.requiredParams[0].type).toBe('boolean');
  });

  it('falls back to string when schema type is missing', () => {
    const c = classify({}, { swaggerHeaders: [{ name: 'X-Foo', required: true }] });
    expect(c.requiredParams[0].type).toBe('string');
  });
});

describe('classify — Optional tier', () => {
  it('treats non-ambient cURL headers as optional with parsed default', () => {
    const c = classify({ 'X-Custom': 'foo' });
    expect(c.optionalParams).toHaveLength(1);
    expect(c.optionalParams[0]).toMatchObject({
      name: 'X-Custom',
      paramName: 'xCustom',
      default: 'foo',
    });
  });

  it('treats Swagger required:false header as optional', () => {
    const c = classify(
      {},
      {
        swaggerHeaders: [{ name: 'X-Trace', required: false, schema: { type: 'string' } }],
      },
    );
    expect(c.optionalParams).toHaveLength(1);
    expect(c.optionalParams[0].name).toBe('X-Trace');
  });

  it('Accept stays in optional tier (it is not ambient)', () => {
    const c = classify({ Accept: 'application/json' });
    expect(c.optionalParams.find((p) => p.name === 'Accept')).toBeDefined();
  });
});

describe('classify — security schemes', () => {
  it('routes a security-scheme header into ambient.token', () => {
    const c = classify({}, { securityHeaderNames: ['Authorization'] });
    expect(c.ambient.token).toBe('<from-config>');
  });

  it('apiKey-in-header security scheme also lands as ambient', () => {
    const c = classify({}, { securityHeaderNames: ['X-API-KEY'] });
    expect(c.ambient.token).toBe('<from-config>');
  });

  it('does not duplicate ambient when both header value and security exist', () => {
    const c = classify(
      { Authorization: 'Bearer real' },
      { securityHeaderNames: ['Authorization'] },
    );
    expect(c.ambient.token).toBe('Bearer real');
  });
});

describe('classify — combined', () => {
  it('handles a realistic mixed cURL header dump', () => {
    const c = classify(
      {
        Authorization: 'Bearer abc',
        'Accept-Language': 'en-US,en;q=0.9',
        'X-Timezone': 'UTC',
        Accept: 'application/json',
        'X-Request-ID': 'r-123',
        'sec-ch-ua': '"Chrome"',
        'user-agent': 'Mozilla',
      },
      {
        swaggerHeaders: [{ name: 'X-Request-ID', required: true, schema: { type: 'string' } }],
      },
    );
    expect(c.skipped.map((s) => s.name)).toEqual(
      expect.arrayContaining(['sec-ch-ua', 'user-agent']),
    );
    expect(c.ambient).toEqual({
      token: 'Bearer abc',
      language: 'en-US,en;q=0.9',
      timezone: 'UTC',
    });
    expect(c.requiredParams.map((p) => p.name)).toEqual(['X-Request-ID']);
    expect(c.optionalParams.map((p) => p.name)).toEqual(['Accept']);
  });
});
