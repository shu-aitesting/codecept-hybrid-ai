import type { RestRequest } from './RestRequest';
import { schemaValidator } from './SchemaValidator';

export class RestResponse<T = unknown> {
  constructor(
    public readonly status: number,
    public readonly headers: Record<string, string>,
    public readonly body: T,
    public readonly durationMs: number,
    public readonly request?: RestRequest,
  ) {}

  private _context(): string {
    if (!this.request) return '';
    return `\nURL:  ${this.request.buildUrl()}\nCurl: ${this.request.toCurl()}`;
  }

  // Bounded snippet of the response body for inclusion in assertion error
  // messages. Without a cap, a 1000-item list response would flood the terminal
  // and CI logs; 2000 chars is enough to diagnose most failures.
  private _bodyStr(): string {
    const raw = typeof this.body === 'string' ? this.body : JSON.stringify(this.body, null, 2);
    return raw.length > 2000 ? raw.slice(0, 2000) + ' …(truncated)' : raw;
  }

  expectStatus(expected: number): this {
    if (this.status !== expected) {
      throw new Error(
        `[RestResponse] Expected HTTP ${expected}, got ${this.status}.` +
          this._context() +
          `\nBody: ${this._bodyStr()}`,
      );
    }
    return this;
  }

  expectHeader(name: string, expected: string): this {
    const actual = this.headers[name.toLowerCase()];
    if (actual !== expected) {
      throw new Error(
        `[RestResponse] Header "${name}": expected "${expected}", got "${actual ?? '(missing)'}".` +
          this._context(),
      );
    }
    return this;
  }

  expectJsonPath<V>(path: string, expected: V): this {
    const actual = this._getPath(path);
    if (actual !== expected) {
      throw new Error(
        `[RestResponse] Path "${path}": expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}.` +
          this._context(),
      );
    }
    return this;
  }

  expectJsonPathDefined(path: string): this {
    const actual = this._getPath(path);
    if (actual === undefined || actual === null) {
      throw new Error(
        `[RestResponse] Path "${path}" is ${String(actual)} — expected a defined, non-null value.` +
          this._context(),
      );
    }
    return this;
  }

  expectBodyContains(substring: string): this {
    const raw = typeof this.body === 'string' ? this.body : JSON.stringify(this.body);
    if (!raw.includes(substring)) {
      throw new Error(`[RestResponse] Body does not contain "${substring}".` + this._context());
    }
    return this;
  }

  expectSchema(schema: object): this {
    const result = schemaValidator.validate(schema, this.body);
    if (!result.valid) {
      throw new Error(
        `[RestResponse] Schema validation failed:\n${result.errors.join('\n')}` + this._context(),
      );
    }
    return this;
  }

  expectContentType(expected: string): this {
    const actual = this.headers['content-type'] ?? '';
    if (!actual.startsWith(expected)) {
      throw new Error(
        `[RestResponse] Content-Type: expected "${expected}", got "${actual || '(missing)'}".` +
          this._context(),
      );
    }
    return this;
  }

  json<U = T>(): U {
    return this.body as unknown as U;
  }

  // Traverse a dot-notation path (e.g. "user.address.city") through the response body.
  // Returns undefined whenever any segment is missing rather than throwing TypeError,
  // so the caller gets a meaningful assertion message instead of an opaque stack trace.
  private _getPath(path: string): unknown {
    return path.split('.').reduce<unknown>((node, key) => {
      if (node === null || node === undefined) return undefined;
      if (typeof node !== 'object') return undefined;
      return (node as Record<string, unknown>)[key];
    }, this.body);
  }
}
