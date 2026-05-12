import { APIRequestContext, request } from 'playwright';

import { config } from '../../core/config/ConfigLoader';

import { buildAmbientHeaders } from './ambientHeaders';
import { RestRequest } from './RestRequest';
import { RestResponse } from './RestResponse';

const DEBUG = process.env.LOG_LEVEL === 'debug';

function log(msg: string): void {
  if (DEBUG) console.log(`[RestClient] ${msg}`);
}

export interface RestClientInitOpts {
  baseURL?: string;
  /**
   * Per-context default headers. Merged on top of the ambient headers
   * (Authorization/Accept-Language/X-Timezone) built from `config`.
   * Use this to add suite-wide custom headers without touching every service.
   */
  extraHTTPHeaders?: Record<string, string>;
}

export class RestClient {
  private context?: APIRequestContext;

  /**
   * Initialize the underlying Playwright APIRequestContext. Accepts either a
   * raw `baseURL` string (legacy form) or an options object. Ambient headers
   * derived from runtime config are merged in first; explicit
   * `extraHTTPHeaders` override them on a per-key basis.
   */
  async init(opts?: string | RestClientInitOpts): Promise<void> {
    const normalized: RestClientInitOpts =
      typeof opts === 'string' ? { baseURL: opts } : (opts ?? { baseURL: undefined });

    const headers: Record<string, string> = {
      ...buildAmbientHeaders(config),
      ...normalized.extraHTTPHeaders,
    };

    this.context = await request.newContext({
      baseURL: normalized.baseURL,
      extraHTTPHeaders: Object.keys(headers).length > 0 ? headers : undefined,
      // Allow self-signed certificates in dev/staging environments.
      ignoreHTTPSErrors: true,
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
      // Non-JSON responses (plain text, HTML error pages) are kept as strings.
      body = (await response.text()) as unknown as T;
    }

    log(`← ${response.status()} (${durationMs}ms)`);
    return new RestResponse<T>(response.status(), headers, body, durationMs);
  }
}
