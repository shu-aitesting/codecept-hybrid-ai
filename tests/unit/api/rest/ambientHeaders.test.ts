import { describe, expect, it } from 'vitest';

import {
  AMBIENT_DEFAULTS,
  ambientKind,
  buildAmbientHeaders,
  isSkippedHeader,
  resolveAmbientName,
} from '../../../../src/api/rest/ambientHeaders';

describe('buildAmbientHeaders', () => {
  it('returns empty object when no slots are set', () => {
    expect(buildAmbientHeaders({})).toEqual({});
  });

  it('skips empty-string token (treats as not set)', () => {
    expect(buildAmbientHeaders({ apiToken: '', apiLanguage: 'en' })).toEqual({
      Lng: 'en',
    });
  });

  // Case A — default ecosystem (Token raw, no Bearer)
  it('emits Token/Lng/Tz raw when all slots set and no overrides', () => {
    expect(
      buildAmbientHeaders({ apiToken: 'x', apiLanguage: 'vi', apiTimezone: 'Asia/HCM' }),
    ).toEqual({ Token: 'x', Lng: 'vi', Tz: 'Asia/HCM' });
  });

  it('emits Token raw (no prefix) by default', () => {
    expect(buildAmbientHeaders({ apiToken: 'abc' })).toEqual({ Token: 'abc' });
  });

  it('emits Lng when apiLanguage is set', () => {
    expect(buildAmbientHeaders({ apiLanguage: 'en-US' })).toEqual({ Lng: 'en-US' });
  });

  it('emits Tz when apiTimezone is set', () => {
    expect(buildAmbientHeaders({ apiTimezone: 'Asia/Ho_Chi_Minh' })).toEqual({
      Tz: 'Asia/Ho_Chi_Minh',
    });
  });

  // Case B — env override to HTTP standard Bearer
  it('emits Authorization Bearer when config.apiHeaderNames overrides token name+prefix', () => {
    expect(
      buildAmbientHeaders({
        apiToken: 'x',
        apiHeaderNames: { token: 'Authorization', tokenPrefix: 'Bearer ' },
      }),
    ).toEqual({ Authorization: 'Bearer x' });
  });

  // Case C — per-test override via overrides arg (Swagger apiKey scheme name X-API-Key)
  it('emits X-API-Key raw when overrides.token is set', () => {
    expect(buildAmbientHeaders({ apiToken: 'x' }, { token: 'X-API-Key', tokenPrefix: '' })).toEqual(
      { 'X-API-Key': 'x' },
    );
  });

  it('overrides arg takes precedence over config.apiHeaderNames', () => {
    expect(
      buildAmbientHeaders(
        { apiToken: 'x', apiHeaderNames: { token: 'Authorization', tokenPrefix: 'Bearer ' } },
        { token: 'X-API-Key', tokenPrefix: '' },
      ),
    ).toEqual({ 'X-API-Key': 'x' });
  });

  it('overrides arg can change language header name', () => {
    expect(buildAmbientHeaders({ apiLanguage: 'vi' }, { language: 'Accept-Language' })).toEqual({
      'Accept-Language': 'vi',
    });
  });
});

describe('AMBIENT_DEFAULTS', () => {
  it('has expected canonical defaults', () => {
    expect(AMBIENT_DEFAULTS.token).toBe('Token');
    expect(AMBIENT_DEFAULTS.tokenPrefix).toBe('');
    expect(AMBIENT_DEFAULTS.language).toBe('Lng');
    expect(AMBIENT_DEFAULTS.timezone).toBe('Tz');
  });
});

describe('resolveAmbientName', () => {
  it('returns AMBIENT_DEFAULTS when no config or overrides', () => {
    expect(resolveAmbientName('token', {})).toBe('Token');
    expect(resolveAmbientName('language', {})).toBe('Lng');
    expect(resolveAmbientName('timezone', {})).toBe('Tz');
  });

  it('config.apiHeaderNames takes precedence over defaults', () => {
    expect(resolveAmbientName('token', { apiHeaderNames: { token: 'Authorization' } })).toBe(
      'Authorization',
    );
  });

  it('overrides arg takes precedence over config.apiHeaderNames', () => {
    expect(
      resolveAmbientName(
        'token',
        { apiHeaderNames: { token: 'Authorization' } },
        { token: 'X-API-Key' },
      ),
    ).toBe('X-API-Key');
  });
});

describe('ambientKind', () => {
  it.each([
    // token aliases
    ['authorization', 'token'],
    ['Authorization', 'token'],
    ['x-auth-token', 'token'],
    ['token', 'token'],
    ['x-token', 'token'],
    ['x-api-key', 'token'],
    ['api-key', 'token'],
    // language aliases — including new lng + language
    ['lng', 'language'],
    ['language', 'language'],
    ['accept-language', 'language'],
    ['Accept-Language', 'language'],
    ['ln', 'language'],
    ['lang', 'language'],
    ['x-language', 'language'],
    // timezone aliases
    ['x-timezone', 'timezone'],
    ['X-Timezone', 'timezone'],
    ['tz', 'timezone'],
    ['timezone', 'timezone'],
    ['time-zone', 'timezone'],
  ])('classifies %s as %s', (name, kind) => {
    expect(ambientKind(name)).toBe(kind);
  });

  it('ambientKind("Lng") returns "language" (critical alias check)', () => {
    expect(ambientKind('Lng')).toBe('language');
  });

  it('returns null for non-ambient headers', () => {
    expect(ambientKind('Accept')).toBeNull();
    expect(ambientKind('X-Request-ID')).toBeNull();
    expect(ambientKind('Content-Type')).toBeNull();
  });

  it('trims whitespace before matching', () => {
    expect(ambientKind('  authorization  ')).toBe('token');
  });
});

describe('isSkippedHeader', () => {
  it.each([
    'sec-ch-ua',
    'sec-ch-ua-mobile',
    'sec-ch-ua-platform',
    'sec-fetch-mode',
    'sec-fetch-site',
    'user-agent',
    'priority',
    'referer',
    'origin',
    'cookie',
    'host',
    'content-length',
    'connection',
    'accept-encoding',
  ])('skips %s', (name) => {
    expect(isSkippedHeader(name)).toBe(true);
  });

  it('does not skip Authorization or Accept', () => {
    expect(isSkippedHeader('Authorization')).toBe(false);
    expect(isSkippedHeader('Accept')).toBe(false);
    expect(isSkippedHeader('Content-Type')).toBe(false);
  });

  it('skip matching is case-insensitive', () => {
    expect(isSkippedHeader('USER-AGENT')).toBe(true);
    expect(isSkippedHeader('Sec-Ch-Ua')).toBe(true);
  });
});
