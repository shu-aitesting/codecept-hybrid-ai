import type { z } from 'zod';

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

  // ─── Schema validation (Zod) ────────────────────────────────────────────────

  /**
   * Validate response body against a Zod schema. Throws with a flattened
   * diagnostic listing the first 10 issues if the body is not a match.
   * Use when you only need to assert (no typed return). For typed access,
   * use parseWith() after the chain ends.
   */
  expectMatchesSchema(schema: z.ZodTypeAny): this {
    const result = schema.safeParse(this.body);
    if (!result.success) {
      throw new Error(
        `[RestResponse] Body does not match schema:\n${this._formatZodIssues(result.error.issues)}`,
      );
    }
    return this;
  }

  /**
   * Validate that body is an array AND every item matches the given item
   * schema. For object-with-list responses, drill in first via parseWith
   * or assert the wrapping schema with expectMatchesSchema.
   */
  expectMatchesArraySchema(itemSchema: z.ZodTypeAny): this {
    if (!Array.isArray(this.body)) {
      throw new Error(
        `[RestResponse] Expected body to be an array, got ${this._describeType(this.body)}`,
      );
    }
    for (let i = 0; i < this.body.length; i++) {
      const result = itemSchema.safeParse(this.body[i]);
      if (!result.success) {
        throw new Error(
          `[RestResponse] Array item [${i}] does not match schema:\n${this._formatZodIssues(result.error.issues)}`,
        );
      }
    }
    return this;
  }

  /**
   * Terminal: validate the body and return the parsed/typed value. Use this
   * instead of json<U>() when you want runtime + compile-time type safety
   * in a single step.
   */
  parseWith<U>(schema: z.ZodType<U>): U {
    const result = schema.safeParse(this.body);
    if (!result.success) {
      throw new Error(
        `[RestResponse] parseWith failed:\n${this._formatZodIssues(result.error.issues)}`,
      );
    }
    return result.data;
  }

  // ─── Performance SLA ────────────────────────────────────────────────────────

  expectResponseTime(maxMs: number): this {
    if (this.durationMs > maxMs) {
      throw new Error(`[RestResponse] Response took ${this.durationMs}ms, expected ≤ ${maxMs}ms`);
    }
    return this;
  }

  // ─── Content type ───────────────────────────────────────────────────────────

  expectContentType(mime: string | RegExp): this {
    const actual = this.headers['content-type'] ?? '';
    const matches = typeof mime === 'string' ? actual.includes(mime) : mime.test(actual);
    if (!matches) {
      const expectedDescr = typeof mime === 'string' ? `"${mime}"` : mime.toString();
      const actualDescr = actual || '(missing)';
      throw new Error(
        `[RestResponse] Content-Type "${actualDescr}" does not match ${expectedDescr}`,
      );
    }
    return this;
  }

  // ─── Array / collection assertions ──────────────────────────────────────────

  expectArrayLength(path: string, n: number): this {
    const arr = this._getArrayAt(path);
    if (arr.length !== n) {
      throw new Error(`[RestResponse] Array at "${path}" has length ${arr.length}, expected ${n}`);
    }
    return this;
  }

  expectArrayLengthAtLeast(path: string, n: number): this {
    const arr = this._getArrayAt(path);
    if (arr.length < n) {
      throw new Error(
        `[RestResponse] Array at "${path}" has length ${arr.length}, expected ≥ ${n}`,
      );
    }
    return this;
  }

  expectArrayLengthAtMost(path: string, n: number): this {
    const arr = this._getArrayAt(path);
    if (arr.length > n) {
      throw new Error(
        `[RestResponse] Array at "${path}" has length ${arr.length}, expected ≤ ${n}`,
      );
    }
    return this;
  }

  expectArrayContains<U>(path: string, predicate: (item: U) => boolean): this {
    const arr = this._getArrayAt(path);
    const found = (arr as U[]).some(predicate);
    if (!found) {
      throw new Error(
        `[RestResponse] No item at "${path}" matched predicate (array length: ${arr.length})`,
      );
    }
    return this;
  }

  expectEvery<U>(path: string, predicate: (item: U) => boolean): this {
    const arr = this._getArrayAt(path);
    const failingIdx = (arr as U[]).findIndex((item) => !predicate(item));
    if (failingIdx !== -1) {
      throw new Error(`[RestResponse] Item [${failingIdx}] at "${path}" failed predicate`);
    }
    return this;
  }

  // ─── internal helpers ───────────────────────────────────────────────────────

  // Traverse a dot-notation path (e.g. "user.address.city") through the response body.
  // Returns undefined whenever any segment is missing rather than throwing TypeError,
  // so the caller gets a meaningful assertion message instead of an opaque stack trace.
  private _getPath(path: string): unknown {
    if (path === '' || path === '$') return this.body;
    return path.split('.').reduce<unknown>((node, key) => {
      if (node === null || node === undefined) return undefined;
      if (typeof node !== 'object') return undefined;
      return (node as Record<string, unknown>)[key];
    }, this.body);
  }

  private _getArrayAt(path: string): unknown[] {
    const value = this._getPath(path);
    if (!Array.isArray(value)) {
      throw new Error(
        `[RestResponse] Expected array at "${path}", got ${this._describeType(value)}`,
      );
    }
    return value;
  }

  private _describeType(value: unknown): string {
    if (value === null) return 'null';
    if (Array.isArray(value)) return 'array';
    return typeof value;
  }

  private _formatZodIssues(issues: z.ZodIssue[]): string {
    const cap = 10;
    const head = issues.slice(0, cap).map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join('.') : '(root)';
      return `  - ${path}: ${issue.message}`;
    });
    if (issues.length > cap) {
      head.push(`  ... and ${issues.length - cap} more`);
    }
    return head.join('\n');
  }
}
