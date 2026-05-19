import { ambientKind, isSkippedHeader, AmbientKind } from '@api/rest/ambientHeaders';

/**
 * Header classifier shared by `CurlToApiAgent` and `SwaggerToApiAgent`.
 *
 * Sorts an arbitrary header map (from a parsed cURL command and/or a Swagger
 * `parameters[in:header]` list) into 4 tiers that the codegen prompt knows
 * how to render:
 *
 *   1. Skipped         — drop entirely (browser fingerprinting, transport)
 *   2. Ambient         — token / language / timezone, injected by RestClient
 *   3. Required params — Swagger required:true header → mandatory method arg
 *   4. Optional params — everything else → optional method arg with default
 */

export interface SwaggerHeaderInput {
  name: string;
  required: boolean;
  schema?: { type?: string };
  description?: string;
}

export interface RequiredHeaderParam {
  name: string;
  paramName: string;
  type: string;
  description?: string;
}

export interface OptionalHeaderParam {
  name: string;
  paramName: string;
  default: string;
  description?: string;
}

export interface HeaderClassification {
  skipped: Array<{ name: string; value: string }>;
  ambient: { token?: string; language?: string; timezone?: string };
  requiredParams: RequiredHeaderParam[];
  optionalParams: OptionalHeaderParam[];
}

export interface ClassifyOpts {
  /**
   * Swagger header parameters — provides the required/schema signal.
   * When absent (e.g. cURL-only), every non-ambient/non-skipped header
   * lands in `optionalParams` because cURL has no required hint.
   */
  swaggerHeaders?: SwaggerHeaderInput[];
  /**
   * Header names declared by `securitySchemes` (Bearer / apiKey-in-header).
   * Auto-classified as ambient `token` so they're not duplicated as method args.
   */
  securityHeaderNames?: string[];
  /**
   * Configured token header name (from `config.apiHeaderNames.token`, default `'Token'`).
   * Headers matching this name are also routed as ambient.token even if they are not
   * listed in `securityHeaderNames` and not in `AMBIENT_TOKEN_ALIASES`.
   */
  tokenHeaderName?: string;
}

function inferParamType(schema?: { type?: string }): string {
  switch (schema?.type) {
    case 'integer':
    case 'number':
      return 'number';
    case 'boolean':
      return 'boolean';
    default:
      return 'string';
  }
}

/**
 * Convert an HTTP header name to a valid TypeScript identifier in camelCase.
 * `X-Request-ID` → `xRequestId`, `Accept` → `accept`, `X-API-Key` → `xApiKey`.
 */
export function headerToParamName(name: string): string {
  const parts = name
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((p) => p.toLowerCase());
  if (parts.length === 0) return name;
  return parts.map((p, i) => (i === 0 ? p : p.charAt(0).toUpperCase() + p.slice(1))).join('');
}

export function classify(
  headers: Record<string, string>,
  opts: ClassifyOpts = {},
): HeaderClassification {
  const result: HeaderClassification = {
    skipped: [],
    ambient: {},
    requiredParams: [],
    optionalParams: [],
  };

  const securitySet = new Set((opts.securityHeaderNames ?? []).map((n) => n.toLowerCase()));
  const swaggerMap = new Map<string, SwaggerHeaderInput>();
  for (const h of opts.swaggerHeaders ?? []) swaggerMap.set(h.name.toLowerCase(), h);

  // Union of names from both inputs (case-preserving via first occurrence).
  const seen = new Map<string, string>();
  const remember = (name: string): void => {
    const lower = name.toLowerCase();
    if (!seen.has(lower)) seen.set(lower, name);
  };
  for (const k of Object.keys(headers)) remember(k);
  for (const h of opts.swaggerHeaders ?? []) remember(h.name);
  for (const n of opts.securityHeaderNames ?? []) remember(n);

  for (const name of seen.values()) {
    const value = headers[name] ?? '';
    if (isSkippedHeader(name)) {
      result.skipped.push({ name, value });
      continue;
    }
    if (securitySet.has(name.toLowerCase())) {
      if (!result.ambient.token) result.ambient.token = value || '<from-config>';
      continue;
    }
    // Also treat headers matching the configured token name as ambient, covering
    // non-standard names (e.g. X-Custom-Auth) not in AMBIENT_TOKEN_ALIASES.
    const configuredTokenName = (opts.tokenHeaderName ?? 'Token').toLowerCase();
    if (name.toLowerCase() === configuredTokenName) {
      if (!result.ambient.token) result.ambient.token = value || '<from-config>';
      continue;
    }
    const kind: AmbientKind | null = ambientKind(name);
    if (kind) {
      if (!result.ambient[kind]) result.ambient[kind] = value || '<from-config>';
      continue;
    }
    const swag = swaggerMap.get(name.toLowerCase());
    if (swag?.required) {
      result.requiredParams.push({
        name,
        paramName: headerToParamName(name),
        type: inferParamType(swag.schema),
        description: swag.description,
      });
    } else {
      result.optionalParams.push({
        name,
        paramName: headerToParamName(name),
        default: value,
        description: swag?.description,
      });
    }
  }

  return result;
}
