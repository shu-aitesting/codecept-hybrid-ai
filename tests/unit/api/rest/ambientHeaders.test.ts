import { describe, expect, it } from 'vitest';

import {
  ambientKind,
  buildAmbientHeaders,
  isSkippedHeader,
} from '../../../../src/api/rest/ambientHeaders';

describe('buildAmbientHeaders', () => {
  it('returns empty object when no slots are set', () => {
    expect(buildAmbientHeaders({})).toEqual({});
  });

  it('emits Authorization Bearer when apiToken is set', () => {
    expect(buildAmbientHeaders({ apiToken: 'abc' })).toEqual({
      Authorization: 'Bearer abc',
    });
  });

  it('emits Accept-Language when apiLanguage is set', () => {
    expect(buildAmbientHeaders({ apiLanguage: 'en-US' })).toEqual({
      'Accept-Language': 'en-US',
    });
  });

  it('emits X-Timezone when apiTimezone is set', () => {
    expect(buildAmbientHeaders({ apiTimezone: 'Asia/Ho_Chi_Minh' })).toEqual({
      'X-Timezone': 'Asia/Ho_Chi_Minh',
    });
  });

  it('combines all three when all are set', () => {
    expect(buildAmbientHeaders({ apiToken: 'tok', apiLanguage: 'vi', apiTimezone: 'UTC' })).toEqual(
      {
        Authorization: 'Bearer tok',
        'Accept-Language': 'vi',
        'X-Timezone': 'UTC',
      },
    );
  });

  it('skips empty-string token (treats as not set)', () => {
    expect(buildAmbientHeaders({ apiToken: '', apiLanguage: 'en' })).toEqual({
      'Accept-Language': 'en',
    });
  });
});

describe('ambientKind', () => {
  it.each([
    ['authorization', 'token'],
    ['Authorization', 'token'],
    ['x-auth-token', 'token'],
    ['token', 'token'],
    ['x-token', 'token'],
    ['accept-language', 'language'],
    ['Accept-Language', 'language'],
    ['ln', 'language'],
    ['lang', 'language'],
    ['x-language', 'language'],
    ['x-timezone', 'timezone'],
    ['X-Timezone', 'timezone'],
    ['tz', 'timezone'],
    ['timezone', 'timezone'],
    ['time-zone', 'timezone'],
  ])('classifies %s as %s', (name, kind) => {
    expect(ambientKind(name)).toBe(kind);
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
