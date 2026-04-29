import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { RestResponse } from '../../../../src/api/rest/RestResponse';

// ─── helpers ─────────────────────────────────────────────────────────────────

function makeResponse<T>(
  body: T,
  opts: { status?: number; headers?: Record<string, string>; durationMs?: number } = {},
): RestResponse<T> {
  return new RestResponse<T>(
    opts.status ?? 200,
    opts.headers ?? { 'content-type': 'application/json' },
    body,
    opts.durationMs ?? 100,
  );
}

// ─── expectMatchesSchema ─────────────────────────────────────────────────────

describe('RestResponse.expectMatchesSchema()', () => {
  const UserSchema = z.object({ id: z.number(), email: z.string().email() });

  it('passes when body matches schema', () => {
    const res = makeResponse({ id: 1, email: 'a@b.com' });
    expect(() => res.expectMatchesSchema(UserSchema)).not.toThrow();
  });

  it('returns this for chaining', () => {
    const res = makeResponse({ id: 1, email: 'a@b.com' });
    expect(res.expectMatchesSchema(UserSchema)).toBe(res);
  });

  it('throws with formatted issues when body fails schema', () => {
    const res = makeResponse({ id: 'not-a-number', email: 'invalid' });
    expect(() => res.expectMatchesSchema(UserSchema)).toThrow(/Body does not match schema/);
  });

  it('error message includes path of failing field', () => {
    const res = makeResponse({ id: 'bad', email: 'a@b.com' });
    try {
      res.expectMatchesSchema(UserSchema);
    } catch (e) {
      expect((e as Error).message).toMatch(/id:/);
    }
  });

  it('caps issues list at 10 with "more" suffix', () => {
    // schema with 12 required fields, all missing
    const shape: Record<string, z.ZodString> = {};
    for (let i = 0; i < 12; i++) shape[`f${i}`] = z.string();
    const big = z.object(shape);
    const res = makeResponse({});
    try {
      res.expectMatchesSchema(big);
    } catch (e) {
      expect((e as Error).message).toMatch(/and 2 more/);
    }
  });
});

// ─── expectMatchesArraySchema ────────────────────────────────────────────────

describe('RestResponse.expectMatchesArraySchema()', () => {
  const ItemSchema = z.object({ id: z.number() });

  it('passes when every item matches', () => {
    const res = makeResponse([{ id: 1 }, { id: 2 }]);
    expect(() => res.expectMatchesArraySchema(ItemSchema)).not.toThrow();
  });

  it('passes for empty array', () => {
    const res = makeResponse([]);
    expect(() => res.expectMatchesArraySchema(ItemSchema)).not.toThrow();
  });

  it('throws when body is not an array', () => {
    const res = makeResponse({ id: 1 });
    expect(() => res.expectMatchesArraySchema(ItemSchema)).toThrow(/Expected body to be an array/);
  });

  it('reports the failing index when an item is invalid', () => {
    const res = makeResponse([{ id: 1 }, { id: 'bad' }]);
    expect(() => res.expectMatchesArraySchema(ItemSchema)).toThrow(/Array item \[1\]/);
  });

  it('returns this for chaining', () => {
    const res = makeResponse([{ id: 1 }]);
    expect(res.expectMatchesArraySchema(ItemSchema)).toBe(res);
  });
});

// ─── parseWith ───────────────────────────────────────────────────────────────

describe('RestResponse.parseWith()', () => {
  const UserSchema = z.object({ id: z.number(), name: z.string() });

  it('returns parsed/typed data on success', () => {
    const res = makeResponse({ id: 1, name: 'Alice' });
    const user = res.parseWith(UserSchema);
    expect(user).toEqual({ id: 1, name: 'Alice' });
  });

  it('strips unknown fields by default (matches Zod parse semantics)', () => {
    const res = makeResponse({ id: 1, name: 'Alice', extra: 'noise' });
    const user = res.parseWith(UserSchema);
    expect(user).not.toHaveProperty('extra');
  });

  it('throws with formatted issues on schema mismatch', () => {
    const res = makeResponse({ id: 'no', name: 'A' });
    expect(() => res.parseWith(UserSchema)).toThrow(/parseWith failed/);
  });
});

// ─── expectResponseTime ──────────────────────────────────────────────────────

describe('RestResponse.expectResponseTime()', () => {
  it('passes when duration ≤ max', () => {
    const res = makeResponse({}, { durationMs: 100 });
    expect(() => res.expectResponseTime(200)).not.toThrow();
  });

  it('passes when duration === max (boundary)', () => {
    const res = makeResponse({}, { durationMs: 200 });
    expect(() => res.expectResponseTime(200)).not.toThrow();
  });

  it('throws when duration exceeds max', () => {
    const res = makeResponse({}, { durationMs: 500 });
    expect(() => res.expectResponseTime(200)).toThrow(/took 500ms.*≤ 200ms/);
  });

  it('returns this for chaining', () => {
    const res = makeResponse({}, { durationMs: 50 });
    expect(res.expectResponseTime(100)).toBe(res);
  });
});

// ─── expectContentType ───────────────────────────────────────────────────────

describe('RestResponse.expectContentType()', () => {
  it('passes when content-type contains string', () => {
    const res = makeResponse(
      {},
      { headers: { 'content-type': 'application/json; charset=utf-8' } },
    );
    expect(() => res.expectContentType('application/json')).not.toThrow();
  });

  it('passes when content-type matches regex', () => {
    const res = makeResponse({}, { headers: { 'content-type': 'application/vnd.api+json' } });
    expect(() => res.expectContentType(/json$/)).not.toThrow();
  });

  it('throws when content-type does not match', () => {
    const res = makeResponse({}, { headers: { 'content-type': 'text/html' } });
    expect(() => res.expectContentType('application/json')).toThrow(
      /text\/html.*application\/json/,
    );
  });

  it('throws cleanly when content-type header missing', () => {
    const res = makeResponse({}, { headers: {} });
    expect(() => res.expectContentType('application/json')).toThrow(/\(missing\)/);
  });

  it('returns this for chaining', () => {
    const res = makeResponse({});
    expect(res.expectContentType('application/json')).toBe(res);
  });
});

// ─── expectArrayLength ───────────────────────────────────────────────────────

describe('RestResponse.expectArrayLength()', () => {
  it('passes when array at root has correct length', () => {
    const res = makeResponse([1, 2, 3]);
    expect(() => res.expectArrayLength('', 3)).not.toThrow();
  });

  it('passes when nested array has correct length', () => {
    const res = makeResponse({ users: [{ id: 1 }, { id: 2 }] });
    expect(() => res.expectArrayLength('users', 2)).not.toThrow();
  });

  it('throws on length mismatch', () => {
    const res = makeResponse([1, 2]);
    expect(() => res.expectArrayLength('', 3)).toThrow(/length 2, expected 3/);
  });

  it('throws when path resolves to non-array', () => {
    const res = makeResponse({ users: 'not-an-array' });
    expect(() => res.expectArrayLength('users', 0)).toThrow(/Expected array at "users"/);
  });

  it('describes type as null when value is null', () => {
    const res = makeResponse({ users: null });
    expect(() => res.expectArrayLength('users', 0)).toThrow(/got null/);
  });
});

// ─── expectArrayLengthAtLeast / AtMost ───────────────────────────────────────

describe('RestResponse.expectArrayLengthAtLeast()', () => {
  it('passes when length >= n', () => {
    const res = makeResponse([1, 2, 3]);
    expect(() => res.expectArrayLengthAtLeast('', 2)).not.toThrow();
    expect(() => res.expectArrayLengthAtLeast('', 3)).not.toThrow();
  });

  it('throws when length < n', () => {
    const res = makeResponse([1]);
    expect(() => res.expectArrayLengthAtLeast('', 2)).toThrow(/expected ≥ 2/);
  });
});

describe('RestResponse.expectArrayLengthAtMost()', () => {
  it('passes when length <= n', () => {
    const res = makeResponse([1, 2]);
    expect(() => res.expectArrayLengthAtMost('', 3)).not.toThrow();
    expect(() => res.expectArrayLengthAtMost('', 2)).not.toThrow();
  });

  it('throws when length > n', () => {
    const res = makeResponse([1, 2, 3, 4]);
    expect(() => res.expectArrayLengthAtMost('', 3)).toThrow(/expected ≤ 3/);
  });
});

// ─── expectArrayContains ─────────────────────────────────────────────────────

describe('RestResponse.expectArrayContains()', () => {
  it('passes when at least one item matches', () => {
    const res = makeResponse([{ id: 1 }, { id: 2 }, { id: 3 }]);
    expect(() =>
      res.expectArrayContains<{ id: number }>('', (item) => item.id === 2),
    ).not.toThrow();
  });

  it('throws when no item matches', () => {
    const res = makeResponse([{ id: 1 }, { id: 2 }]);
    expect(() => res.expectArrayContains<{ id: number }>('', (item) => item.id === 99)).toThrow(
      /No item.*matched predicate/,
    );
  });

  it('error includes array length for context', () => {
    const res = makeResponse([1, 2, 3, 4, 5]);
    try {
      res.expectArrayContains<number>('', (n) => n > 100);
    } catch (e) {
      expect((e as Error).message).toMatch(/array length: 5/);
    }
  });
});

// ─── expectEvery ─────────────────────────────────────────────────────────────

describe('RestResponse.expectEvery()', () => {
  it('passes when all items match', () => {
    const res = makeResponse([2, 4, 6, 8]);
    expect(() => res.expectEvery<number>('', (n) => n % 2 === 0)).not.toThrow();
  });

  it('passes for empty array (vacuous truth)', () => {
    const res = makeResponse([]);
    expect(() => res.expectEvery<number>('', () => false)).not.toThrow();
  });

  it('throws on first failing item with index', () => {
    const res = makeResponse([2, 4, 5, 8]);
    expect(() => res.expectEvery<number>('', (n) => n % 2 === 0)).toThrow(/\[2\] at "".*failed/);
  });
});

// ─── chaining integration ────────────────────────────────────────────────────

describe('RestResponse — chained assertions', () => {
  it('all this-returning methods compose fluently', () => {
    const res = makeResponse(
      [
        { id: 1, email: 'a@b.com' },
        { id: 2, email: 'c@d.com' },
      ],
      { status: 200, headers: { 'content-type': 'application/json' }, durationMs: 50 },
    );
    const ItemSchema = z.object({ id: z.number(), email: z.string().email() });

    expect(() =>
      res
        .expectStatus(200)
        .expectContentType('application/json')
        .expectResponseTime(1000)
        .expectMatchesArraySchema(ItemSchema)
        .expectArrayLengthAtLeast('', 1)
        .expectArrayContains<{ id: number }>('', (item) => item.id === 2),
    ).not.toThrow();
  });
});
