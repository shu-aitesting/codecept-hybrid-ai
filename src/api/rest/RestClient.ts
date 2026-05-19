import { APIRequestContext, request } from 'playwright';

import { config } from '../../core/config/ConfigLoader';
import { Logger } from '../../core/logger/Logger';

import { tryAllureAttach } from './allureAttach';
import {
  AmbientHeaderOverrides,
  AmbientKind,
  buildAmbientHeaders,
  resolveAmbientName,
} from './ambientHeaders';
import { RestRequest } from './RestRequest';
import { RestResponse } from './RestResponse';

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

  async init(opts?: string | RestClientInitOpts): Promise<void> {
    const normalized: RestClientInitOpts =
      typeof opts === 'string' ? { baseURL: opts } : (opts ?? { baseURL: undefined });

    const ambient = buildAmbientHeaders(config, normalized.headerOverrides);

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

    Logger.debug('[RestClient] Initialized', {
      baseURL: normalized.baseURL ?? '(none)',
      ambientHeaders: Object.keys(headers),
    });
  }

  async dispose(): Promise<void> {
    await this.context?.dispose();
    this.context = undefined;
    Logger.debug('[RestClient] Context disposed');
  }

  async send<T = unknown>(req: RestRequest): Promise<RestResponse<T>> {
    if (!this.context) {
      await this.init();
    }
    const ctx = this.context!;

    const start = Date.now();

    const response = await ctx.fetch(req.buildUrl(), {
      method: req.method,
      headers: req.headers,
      data: req.body as Record<string, unknown> | string | undefined,
      timeout: req.timeout,
    });

    const durationMs = Date.now() - start;
    const responseHeaders = response.headers();

    let body: T;
    try {
      body = (await response.json()) as T;
    } catch {
      body = (await response.text()) as unknown as T;
    }

    // Single consolidated log block per API call — makes retries easy to spot.
    // `toCurl()` is multi-line (joined with " \\\n  "), so each continuation
    // line must be prefixed with the box border or it visually escapes the box.
    const bodyStr = typeof body === 'string' ? body : JSON.stringify(body, null, 2);
    const bodyPreview = bodyStr.slice(0, 500);
    const curlLines = req
      .toCurl()
      .split('\n')
      .map((line, i) => (i === 0 ? `│  cURL   : ${line}` : `│           ${line.trimStart()}`));

    console.log(
      [
        ``,
        `┌─ API Call ─────────────────────────────────────────────`,
        `│  ${req.method} ${req.buildUrl()}`,
        `│  Status : ${response.status()} (${durationMs}ms)`,
        `│  Headers: ${JSON.stringify(req.headers)}`,
        req.body != null ? `│  Body   : ${JSON.stringify(req.body)}` : null,
        ...curlLines,
        `├─ Response ──────────────────────────────────────────────`,
        `│  Content-Type: ${responseHeaders['content-type'] ?? '(none)'}`,
        `│  Body: ${bodyPreview}${bodyStr.length > 500 ? ' …(truncated)' : ''}`,
        `└─────────────────────────────────────────────────────────`,
        ``,
      ]
        .filter((l) => l !== null)
        .join('\n'),
    );

    const restResponse = new RestResponse<T>(
      response.status(),
      responseHeaders,
      body,
      durationMs,
      req,
    );

    tryAllureAttach(req, restResponse as RestResponse<unknown>);

    return restResponse;
  }
}
