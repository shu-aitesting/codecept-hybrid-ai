export class RestResponse<T = unknown> {
  constructor(
    public readonly status: number,
    public readonly headers: Record<string, string>,
    public readonly body: T,
    public readonly durationMs: number,
  ) {}

  expectStatus(expected: number): this {
    if (this.status !== expected) {
      const snippet = JSON.stringify(this.body, null, 2).slice(0, 500);
      throw new Error(
        `[RestResponse] Expected HTTP ${expected}, got ${this.status}.\nBody: ${snippet}`,
      );
    }
    return this;
  }

  expectHeader(name: string, expected: string): this {
    const actual = this.headers[name.toLowerCase()];
    if (actual !== expected) {
      throw new Error(
        `[RestResponse] Header "${name}": expected "${expected}", got "${actual ?? '(missing)'}"`,
      );
    }
    return this;
  }

  expectJsonPath<V>(path: string, expected: V): this {
    const actual = this._getPath(path);
    if (actual !== expected) {
      throw new Error(
        `[RestResponse] Path "${path}": expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
      );
    }
    return this;
  }

  expectJsonPathDefined(path: string): this {
    const actual = this._getPath(path);
    if (actual === undefined || actual === null) {
      throw new Error(
        `[RestResponse] Path "${path}" is ${String(actual)} — expected a defined, non-null value`,
      );
    }
    return this;
  }

  expectBodyContains(substring: string): this {
    const raw = typeof this.body === 'string' ? this.body : JSON.stringify(this.body);
    if (!raw.includes(substring)) {
      throw new Error(`[RestResponse] Body does not contain "${substring}"`);
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
