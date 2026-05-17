import { APIRequestContext, request } from 'playwright';

import { config } from '../../core/config/ConfigLoader';

import {
  AmbientHeaderOverrides,
  AmbientKind,
  buildAmbientHeaders,
  resolveAmbientName,
} from './ambientHeaders';
import { RestRequest } from './RestRequest';
import { RestResponse } from './RestResponse';

const DEBUG = process.env.LOG_LEVEL === 'debug';

function log(msg: string): void {
  if (DEBUG) console.log(`[RestClient] ${msg}`);
}

export interface RestClientInitOpts {
  baseURL?: string;
  /**
   * Per-context default headers merged on top of ambient headers.
   * Use for suite-wide custom headers without touching every service.
   */
  extraHTTPHeaders?: Record<string, string>;
  /**
   * Ambient header kinds to suppress — useful in negative-auth test scenarios.
   * The resolved header name (after precedence chain) is removed from the context.
   */
  skipAmbient?: AmbientKind[];
  /**
   * Override the resolved header names/prefix for ambient slots at the per-test level.
   * Precedence: headerOverrides > config.apiHeaderNames > AMBIENT_DEFAULTS
   */
  headerOverrides?: AmbientHeaderOverrides;
  /**
   * Context-level failOnStatusCode for Playwright (default: false so 4xx/5xx
   * responses are returned as RestResponse instead of throwing).
   */
  failOnStatusCode?: boolean;
}

export class RestClient {
  private context?: APIRequestContext;

  /**
   * Initialize the underlying Playwright APIRequestContext. Accepts either a
   * raw `baseURL` string (legacy form) or an options object.
   */
  async init(opts?: string | RestClientInitOpts): Promise<void> {
    const normalized: RestClientInitOpts =
      typeof opts === 'string' ? { baseURL: opts } : (opts ?? { baseURL: undefined });

    const ambient = buildAmbientHeaders(config, normalized.headerOverrides);

    // Remove ambient entries for suppressed kinds — name resolved via same precedence.
    if (normalized.skipAmbient) {
      for (const kind of normalized.skipAmbient) {
        const resolvedKey = resolveAmbientName(kind, config, normalized.headerOverrides);
        delete ambient[resolvedKey];
      }
    }

    const headers: Record<string, string> = {
      ...ambient,
      ...normalized.extraHTTPHeaders,
    };

    this.context = await request.newContext({
      baseURL: normalized.baseURL,
      extraHTTPHeaders: Object.keys(headers).length > 0 ? headers : undefined,
      ignoreHTTPSErrors: true,
      failOnStatusCode: normalized.failOnStatusCode ?? false,
    });

    log(
      `Initialized baseURL="${normalized.baseURL ?? '(none)'}" ` +
        `ambientHeaders=[${Object.keys(headers).join(', ') || 'none'}]`,
    );
  }

  async dispose(): Promise<void> {
    await this.context?.dispose();
    this.context = undefined;
    log('Context disposed');
  }

  async send<T = unknown>(req: RestRequest): Promise<RestResponse<T>> {
    if (!this.context) {
      await this.init();
    }
    const ctx = this.context!;

    log(`→ ${req.method} ${req.buildUrl()}`);
    const start = Date.now();

    const response = await ctx.fetch(req.buildUrl(), {
      method: req.method,
      headers: req.headers,
      data: req.body as Record<string, unknown> | string | undefined,
      timeout: req.timeout,
    });

    const durationMs = Date.now() - start;
    const headers = response.headers();

    let body: T;
    try {
      body = (await response.json()) as T;
    } catch {
      body = (await response.text()) as unknown as T;
    }

    log(`← ${response.status()} (${durationMs}ms)`);
    return new RestResponse<T>(response.status(), headers, body, durationMs);
  }
}
