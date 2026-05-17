/**
 * Ambient header configuration shared between the runtime REST client and
 * the codegen-time header classifier.
 *
 * Three headers are treated as "ambient" — they apply to every API request
 * and are injected once by `RestClient` via Playwright's `extraHTTPHeaders`,
 * NOT emitted in generated service code:
 *
 *   - Token: <raw-token>              (from config.apiToken, default name 'Token')
 *   - Lng: <locale>                   (from config.apiLanguage, default name 'Lng')
 *   - Tz: <iana-zone>                 (from config.apiTimezone, default name 'Tz')
 *
 * Default names match the ecosystem majority (raw token, no Bearer prefix).
 * Override via env: API_HEADER_TOKEN / API_HEADER_TOKEN_PREFIX / API_HEADER_LANGUAGE / API_HEADER_TIMEZONE
 * Or switch to standard Bearer: API_HEADER_TOKEN=Authorization API_HEADER_TOKEN_PREFIX="Bearer "
 *
 * Precedence (per-kind, deterministic):
 *   overrides arg > config.apiHeaderNames > AMBIENT_DEFAULTS
 */
export type AmbientKind = 'token' | 'language' | 'timezone';

export const AMBIENT_TOKEN_ALIASES = [
  'token',
  'authorization',
  'x-auth-token',
  'auth-token',
  'x-token',
  'x-api-key',
  'api-key',
] as const;

export const AMBIENT_LANGUAGE_ALIASES = [
  'lng',
  'lang',
  'language',
  'accept-language',
  'x-language',
  'x-lang',
  'ln',
] as const;

export const AMBIENT_TIMEZONE_ALIASES = [
  'tz',
  'timezone',
  'time-zone',
  'x-timezone',
  'x-tz',
] as const;

/** Canonical defaults when no env config or per-test overrides are provided. */
export const AMBIENT_DEFAULTS = {
  token: 'Token',
  tokenPrefix: '',
  language: 'Lng',
  timezone: 'Tz',
} as const;

/**
 * Headers that should never propagate from cURL/Swagger into generated code.
 * Browser fingerprinting + transport-layer headers managed by Playwright.
 */
export const HEADER_SKIP_PATTERNS: RegExp[] = [
  /^sec-ch-ua/i,
  /^sec-fetch-/i,
  /^user-agent$/i,
  /^priority$/i,
  /^referer$/i,
  /^origin$/i,
  /^cookie$/i,
  /^content-length$/i,
  /^host$/i,
  /^connection$/i,
  /^accept-encoding$/i,
];

export function isSkippedHeader(name: string): boolean {
  return HEADER_SKIP_PATTERNS.some((re) => re.test(name));
}

export function ambientKind(name: string): AmbientKind | null {
  const lower = name.trim().toLowerCase();
  if ((AMBIENT_TOKEN_ALIASES as readonly string[]).includes(lower)) return 'token';
  if ((AMBIENT_LANGUAGE_ALIASES as readonly string[]).includes(lower)) return 'language';
  if ((AMBIENT_TIMEZONE_ALIASES as readonly string[]).includes(lower)) return 'timezone';
  return null;
}

export interface AmbientHeaderOverrides {
  token?: string;
  tokenPrefix?: string;
  language?: string;
  timezone?: string;
}

export interface AmbientConfigSlice {
  apiToken?: string;
  apiLanguage?: string;
  apiTimezone?: string;
  apiHeaderNames?: {
    token?: string;
    tokenPrefix?: string;
    language?: string;
    timezone?: string;
  };
}

/**
 * Resolve the final header name for a given ambient kind using precedence:
 *   overrides > config.apiHeaderNames > AMBIENT_DEFAULTS
 */
export function resolveAmbientName(
  kind: AmbientKind,
  c: AmbientConfigSlice,
  overrides?: AmbientHeaderOverrides,
): string {
  if (kind === 'token') {
    return overrides?.token ?? c.apiHeaderNames?.token ?? AMBIENT_DEFAULTS.token;
  }
  if (kind === 'language') {
    return overrides?.language ?? c.apiHeaderNames?.language ?? AMBIENT_DEFAULTS.language;
  }
  return overrides?.timezone ?? c.apiHeaderNames?.timezone ?? AMBIENT_DEFAULTS.timezone;
}

/**
 * Build the canonical ambient-headers map for Playwright `extraHTTPHeaders`.
 * Empty/undefined config values are skipped so requests stay clean when a
 * slot isn't configured (e.g. unauthenticated APIs, no language header needed).
 *
 * @param c         Runtime config slice (apiToken, apiLanguage, apiTimezone, apiHeaderNames)
 * @param overrides Per-test header name/prefix overrides
 */
export function buildAmbientHeaders(
  c: AmbientConfigSlice,
  overrides?: AmbientHeaderOverrides,
): Record<string, string> {
  const h: Record<string, string> = {};

  if (c.apiToken) {
    const name = resolveAmbientName('token', c, overrides);
    const prefix =
      overrides?.tokenPrefix ?? c.apiHeaderNames?.tokenPrefix ?? AMBIENT_DEFAULTS.tokenPrefix;
    h[name] = `${prefix}${c.apiToken}`;
  }

  if (c.apiLanguage) {
    h[resolveAmbientName('language', c, overrides)] = c.apiLanguage;
  }

  if (c.apiTimezone) {
    h[resolveAmbientName('timezone', c, overrides)] = c.apiTimezone;
  }

  return h;
}
