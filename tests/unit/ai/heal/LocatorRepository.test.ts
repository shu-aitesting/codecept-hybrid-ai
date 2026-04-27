import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { LocatorRepository } from '../../../../src/ai/heal/LocatorRepository';

describe('LocatorRepository', () => {
  let dir: string;
  let dbPath: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'locator-repo-'));
    dbPath = path.join(dir, 'heal.db');
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('stores and retrieves a healed selector', () => {
    const repo = new LocatorRepository({ dbPath });
    repo.record('a.test.ts', '#old', '#new', true, 'anthropic');
    expect(repo.lookup('a.test.ts', '#old')).toBe('#new');
    repo.close();
  });

  it('does not return when fail count >= success count', () => {
    const repo = new LocatorRepository({ dbPath });
    repo.record('a.test.ts', '#old', '#new', false);
    expect(repo.lookup('a.test.ts', '#old')).toBeNull();
    repo.record('a.test.ts', '#old', '#new', true);
    // success=1 fail=1 → tie, not greater → still null
    expect(repo.lookup('a.test.ts', '#old')).toBeNull();
    repo.record('a.test.ts', '#old', '#new', true);
    expect(repo.lookup('a.test.ts', '#old')).toBe('#new');
    repo.close();
  });

  it('returns null for unknown selector', () => {
    const repo = new LocatorRepository({ dbPath });
    expect(repo.lookup('a.test.ts', 'nope')).toBeNull();
    repo.close();
  });

  it('decays entries older than max age', () => {
    let now = 1_000_000;
    const repo = new LocatorRepository({
      dbPath,
      maxAgeMs: 1000,
      now: () => now,
    });
    repo.record('a.test.ts', '#old', '#new', true);
    expect(repo.lookup('a.test.ts', '#old')).toBe('#new');
    now += 5000;
    expect(repo.lookup('a.test.ts', '#old')).toBeNull();
    const removed = repo.decay();
    expect(removed).toBe(1);
    repo.close();
  });

  it('upserts existing rows preserving counters', () => {
    const repo = new LocatorRepository({ dbPath });
    repo.record('a.test.ts', '#old', '#new1', true);
    repo.record('a.test.ts', '#old', '#new2', true);
    repo.record('a.test.ts', '#old', '#new2', false);
    const candidates = repo.topPromotionCandidates(0);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].successCount).toBe(2);
    expect(candidates[0].failCount).toBe(1);
    expect(candidates[0].healedSelector).toBe('#new2');
    repo.close();
  });

  it('returns promotion candidates sorted by success count', () => {
    const repo = new LocatorRepository({ dbPath });
    for (let i = 0; i < 11; i += 1) repo.record('big.test.ts', '#hi', '#promoted', true);
    for (let i = 0; i < 5; i += 1) repo.record('small.test.ts', '#low', '#new', true);
    const top = repo.topPromotionCandidates(10);
    expect(top).toHaveLength(1);
    expect(top[0].testFile).toBe('big.test.ts');
    repo.close();
  });

  it('respects test_file isolation (same selector, different file)', () => {
    const repo = new LocatorRepository({ dbPath });
    repo.record('a.test.ts', '#shared', '#a', true);
    repo.record('b.test.ts', '#shared', '#b', true);
    expect(repo.lookup('a.test.ts', '#shared')).toBe('#a');
    expect(repo.lookup('b.test.ts', '#shared')).toBe('#b');
    repo.close();
  });
});
