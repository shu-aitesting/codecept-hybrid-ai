import { describe, expect, it } from 'vitest';

import { resolveEndpointAuth } from '../../../../src/api/swagger/SwaggerSecurity';

const FALLBACK = { token: 'Token', tokenPrefix: '' };

const SCHEMES = {
  BearerAuth: { type: 'http', scheme: 'bearer' },
  BasicAuth: { type: 'http', scheme: 'basic' },
  ApiKeyHeader: { type: 'apiKey', in: 'header', name: 'X-API-Key' },
  ApiKeyCookie: { type: 'apiKey', in: 'cookie', name: 'session' },
  OAuth2: { type: 'oauth2', flows: {} },
  OIDCAuth: { type: 'openIdConnect', openIdConnectUrl: 'https://example.com/.well-known' },
};

describe('resolveEndpointAuth', () => {
  it('http bearer → Authorization Bearer', () => {
    const auth = resolveEndpointAuth([{ BearerAuth: [] }], undefined, SCHEMES, FALLBACK);
    expect(auth).toMatchObject({
      required: true,
      headerName: 'Authorization',
      prefix: 'Bearer ',
      scheme: 'http-bearer',
    });
  });

  it('http basic → Authorization Basic', () => {
    const auth = resolveEndpointAuth([{ BasicAuth: [] }], undefined, SCHEMES, FALLBACK);
    expect(auth).toMatchObject({
      required: true,
      headerName: 'Authorization',
      prefix: 'Basic ',
      scheme: 'http-basic',
    });
  });

  it('apiKey in header → uses scheme name as header', () => {
    const auth = resolveEndpointAuth([{ ApiKeyHeader: [] }], undefined, SCHEMES, FALLBACK);
    expect(auth).toMatchObject({
      required: true,
      headerName: 'X-API-Key',
      prefix: '',
      scheme: 'apiKey',
    });
  });

  it('apiKey in cookie → required:false (not a header credential)', () => {
    const auth = resolveEndpointAuth([{ ApiKeyCookie: [] }], undefined, SCHEMES, FALLBACK);
    expect(auth.required).toBe(false);
    expect(auth.scheme).toBe('none');
  });

  it('op security [] override → no auth (scheme: none)', () => {
    const auth = resolveEndpointAuth([], [{ BearerAuth: [] }], SCHEMES, FALLBACK);
    expect(auth.required).toBe(false);
    expect(auth.scheme).toBe('none');
  });

  it('oauth2 → required:true, scheme: oauth2', () => {
    const auth = resolveEndpointAuth([{ OAuth2: [] }], undefined, SCHEMES, FALLBACK);
    expect(auth).toMatchObject({
      required: true,
      scheme: 'oauth2',
    });
  });

  it('openIdConnect → required:true, scheme: openIdConnect', () => {
    const auth = resolveEndpointAuth([{ OIDCAuth: [] }], undefined, SCHEMES, FALLBACK);
    expect(auth).toMatchObject({
      required: true,
      scheme: 'openIdConnect',
    });
  });

  it('no op security — inherits global security', () => {
    const auth = resolveEndpointAuth(undefined, [{ ApiKeyHeader: [] }], SCHEMES, FALLBACK);
    expect(auth).toMatchObject({ required: true, headerName: 'X-API-Key', scheme: 'apiKey' });
  });

  it('no op security and no global security → required:false with fallback name', () => {
    const auth = resolveEndpointAuth(undefined, undefined, SCHEMES, FALLBACK);
    expect(auth.required).toBe(false);
    expect(auth.headerName).toBe('Token');
  });

  it('scheme name not found in schemes → uses fallback', () => {
    const auth = resolveEndpointAuth([{ Unknown: [] }], undefined, SCHEMES, FALLBACK);
    expect(auth.required).toBe(true);
    expect(auth.headerName).toBe('Token');
    expect(auth.scheme).toBe('apiKey');
  });

  it('op security takes precedence over global security', () => {
    const auth = resolveEndpointAuth(
      [{ ApiKeyHeader: [] }],
      [{ BearerAuth: [] }],
      SCHEMES,
      FALLBACK,
    );
    expect(auth.headerName).toBe('X-API-Key');
  });
});
