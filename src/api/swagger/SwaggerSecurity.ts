export interface ResolvedAuth {
  required: boolean;
  headerName: string;
  prefix: string;
  scheme: 'apiKey' | 'http-bearer' | 'http-basic' | 'oauth2' | 'openIdConnect' | 'none';
}

/**
 * Resolve the effective auth for a single endpoint.
 *
 * Precedence:
 *   opSecurity (explicit per-operation, including []) > globalSecurity > fallback
 *
 * apiKey cookies/queries are excluded — they don't produce request headers
 * and downstream negative-auth tests don't apply to them.
 */
export function resolveEndpointAuth(
  opSecurity: Array<Record<string, string[]>> | undefined | null,
  globalSecurity: Array<Record<string, string[]>> | undefined,
  schemes: Record<string, unknown>,
  fallback: { token: string; tokenPrefix: string },
): ResolvedAuth {
  // Explicit empty array → endpoint overrides to "no auth"
  if (Array.isArray(opSecurity) && opSecurity.length === 0) {
    return { required: false, headerName: '', prefix: '', scheme: 'none' };
  }

  const effectiveSecurity = opSecurity ?? globalSecurity;

  if (!effectiveSecurity || effectiveSecurity.length === 0) {
    return {
      required: false,
      headerName: fallback.token,
      prefix: fallback.tokenPrefix,
      scheme: 'none',
    };
  }

  const firstRequirement = effectiveSecurity[0];
  const schemeName = Object.keys(firstRequirement ?? {})[0];

  if (!schemeName) {
    return {
      required: false,
      headerName: fallback.token,
      prefix: fallback.tokenPrefix,
      scheme: 'none',
    };
  }

  const schemeObj = schemes[schemeName] as Record<string, unknown> | undefined;

  if (!schemeObj) {
    // Scheme referenced but not defined — best-effort with fallback
    return {
      required: true,
      headerName: fallback.token,
      prefix: fallback.tokenPrefix,
      scheme: 'apiKey',
    };
  }

  const schemeType = typeof schemeObj['type'] === 'string' ? schemeObj['type'] : '';

  if (schemeType === 'apiKey') {
    if (schemeObj['in'] !== 'header') {
      // apiKey in cookie or query — not a header credential, skip negative-auth
      return { required: false, headerName: '', prefix: '', scheme: 'none' };
    }
    const headerName = typeof schemeObj['name'] === 'string' ? schemeObj['name'] : fallback.token;
    return { required: true, headerName, prefix: '', scheme: 'apiKey' };
  }

  if (schemeType === 'http') {
    const httpScheme =
      typeof schemeObj['scheme'] === 'string' ? schemeObj['scheme'].toLowerCase() : '';
    if (httpScheme === 'bearer') {
      return {
        required: true,
        headerName: 'Authorization',
        prefix: 'Bearer ',
        scheme: 'http-bearer',
      };
    }
    if (httpScheme === 'basic') {
      return {
        required: true,
        headerName: 'Authorization',
        prefix: 'Basic ',
        scheme: 'http-basic',
      };
    }
  }

  if (schemeType === 'oauth2') {
    return {
      required: true,
      headerName: 'Authorization',
      prefix: 'Bearer ',
      scheme: 'oauth2',
    };
  }

  if (schemeType === 'openIdConnect') {
    return {
      required: true,
      headerName: 'Authorization',
      prefix: 'Bearer ',
      scheme: 'openIdConnect',
    };
  }

  return {
    required: true,
    headerName: fallback.token,
    prefix: fallback.tokenPrefix,
    scheme: 'apiKey',
  };
}
