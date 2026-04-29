import { APIRequestContext, request } from 'playwright';

import { RestRequest } from './RestRequest';
import { RestResponse } from './RestResponse';

const DEBUG = process.env.LOG_LEVEL === 'debug';

function log(msg: string): void {
  if (DEBUG) console.log(`[RestClient] ${msg}`);
}

export interface RestClientOptions {
  onResponse?: (req: RestRequest, res: RestResponse) => void;
}

export class RestClient {
  private context?: APIRequestContext;

  constructor(private readonly opts: RestClientOptions = {}) {}

  async init(baseURL?: string): Promise<void> {
    this.context = await request.newContext({
      baseURL,
      // Allow self-signed certificates in dev/staging environments.
      ignoreHTTPSErrors: true,
    });
    log(`Initialized with baseURL="${baseURL ?? '(none)'}"`);
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
    const restRes = new RestResponse<T>(response.status(), headers, body, durationMs);
    this.opts.onResponse?.(req, restRes);
    return restRes;
  }
}
