import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { GenerationCache } from '../../../../src/ai/codegen/GenerationCache';

let cache: GenerationCache;
let dbPath: string;

beforeEach(() => {
  dbPath = path.join(os.tmpdir(), `gen-cache-test-${Date.now()}-${Math.random()}.db`);
  cache = new GenerationCache({ dbPath, ttlDays: 1 });
});

afterEach(() => {
  cache.close();
});

describe('GenerationCache', () => {
  // ── Happy path ────────────────────────────────────────────────────────────

  it('stores and retrieves files by agent + hash', () => {
    cache.store('agent-a', 'hash1', { fragmentTs: 'code-a' });
    const result = cache.lookup('agent-a', 'hash1');
    expect(result).toEqual({ fragmentTs: 'code-a' });
  });

  it('returns null for unknown hash', () => {
    expect(cache.lookup('agent-a', 'no-such-hash')).toBeNull();
  });

  it('returns null for different agent with same hash', () => {
    cache.store('agent-a', 'hash1', { file: 'content' });
    expect(cache.lookup('agent-b', 'hash1')).toBeNull();
  });

  it('upserts: overwriting same key returns latest files', () => {
    cache.store('gen', 'h1', { file: 'v1' });
    cache.store('gen', 'h1', { file: 'v2' });
    expect(cache.lookup('gen', 'h1')).toEqual({ file: 'v2' });
  });

  // ── TTL / purge ───────────────────────────────────────────────────────────

  it('returns null after TTL expires', () => {
    // Create a cache with 0-day TTL (entries expire immediately)
    const shortCache = new GenerationCache({ dbPath, ttlDays: 0 });
    shortCache.store('gen', 'h2', { file: 'data' });
    // With ttlDays=0 the cutoff = Date.now() so the entry is already stale
    expect(shortCache.lookup('gen', 'h2')).toBeNull();
  });

  it('purgeStale removes expired entries and returns count', () => {
    // ttlDays=0 → everything is stale
    const shortCache = new GenerationCache({ dbPath, ttlDays: 0 });
    shortCache.store('gen', 'h3', { file: 'data' });
    shortCache.store('gen', 'h4', { file: 'data' });
    const removed = shortCache.purgeStale();
    expect(removed).toBeGreaterThanOrEqual(2);
  });

  it('purgeStale does not remove fresh entries', () => {
    cache.store('gen', 'h5', { file: 'fresh' });
    cache.purgeStale(); // ttlDays=1, entry is fresh
    expect(cache.lookup('gen', 'h5')).toEqual({ file: 'fresh' });
  });

  // ── hashInput ────────────────────────────────────────────────────────────

  it('hashInput produces a 64-char hex string', () => {
    const hash = GenerationCache.hashInput('some input string');
    expect(hash).toHaveLength(64);
    expect(/^[0-9a-f]+$/.test(hash)).toBe(true);
  });

  it('hashInput is deterministic', () => {
    const h1 = GenerationCache.hashInput('hello');
    const h2 = GenerationCache.hashInput('hello');
    expect(h1).toBe(h2);
  });

  it('hashInput differs for different inputs', () => {
    expect(GenerationCache.hashInput('a')).not.toBe(GenerationCache.hashInput('b'));
  });

  // ── countFor ─────────────────────────────────────────────────────────────

  it('countFor returns 0 when no entries', () => {
    expect(cache.countFor('no-agent')).toBe(0);
  });

  it('countFor counts only entries for the given agent', () => {
    cache.store('agent-x', 'h1', {});
    cache.store('agent-x', 'h2', {});
    cache.store('agent-y', 'h1', {});
    expect(cache.countFor('agent-x')).toBe(2);
    expect(cache.countFor('agent-y')).toBe(1);
  });

  // ── JSON robustness ───────────────────────────────────────────────────────

  it('handles multi-file output with nested content', () => {
    const files = {
      fragmentTs: 'export class LoginFragment {}',
      pageTs: 'export class LoginPage {}',
      testTs: 'Scenario("test", () => {})',
    };
    cache.store('html-to-fragment', 'hash99', files);
    expect(cache.lookup('html-to-fragment', 'hash99')).toEqual(files);
  });
});
