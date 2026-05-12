/**
 * Ambient header configuration shared between the runtime REST client and
 * the codegen-time header classifier.
 *
 * Three headers are treated as "ambient" — they apply to every API request
 * and are injected once by `RestClient` via Playwright's `extraHTTPHeaders`,
 * NOT emitted in generated service code:
 *
 *   - Authorization: Bearer <token>   (from config.apiToken)
 *   - Accept-Language: <locale>       (from config.apiLanguage)
 *   - X-Timezone: <iana-zone>         (from config.apiTimezone)
 *
 * Aliases below cover the common synonyms found in cURL captures and Swagger
 * specs (e.g. `ln` for language, `tz` for timezone, `token` for Authorization).
 */

export type AmbientKind = 'token' | 'language' | 'timezone';

export const AMBIENT_TOKEN_ALIASES = [
  'authorization',
  'x-auth-token',
  'token',
  'auth-token',
  'x-token',
] as const;

export const AMBIENT_LANGUAGE_ALIASES = [
  'accept-language',
  'ln',
  'x-language',
  'lang',
  'x-lang',
] as const;

export const AMBIENT_TIMEZONE_ALIASES = [
  'x-timezone',
  'tz',
  'time-zone',
  'x-tz',
  'timezone',
] as const;

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

export interface AmbientConfigSlice {
  apiToken?: string;
  apiLanguage?: string;
  apiTimezone?: string;
}

/**
 * Build the canonical ambient-headers map for Playwright `extraHTTPHeaders`
 * from runtime config. Empty/undefined values are skipped so requests stay
 * clean when a slot isn't configured (e.g. unauthenticated APIs).
 */
export function buildAmbientHeaders(c: AmbientConfigSlice): Record<string, string> {
  const h: Record<string, string> = {};
  if (c.apiToken) h['Authorization'] = `Bearer ${c.apiToken}`;
  if (c.apiLanguage) h['Accept-Language'] = c.apiLanguage;
  if (c.apiTimezone) h['X-Timezone'] = c.apiTimezone;
  return h;
}
