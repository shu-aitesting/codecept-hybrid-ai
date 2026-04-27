import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { BudgetGuard } from '../../../../src/ai/providers/BudgetGuard';
import { CostMeter } from '../../../../src/ai/providers/CostMeter';
import { BudgetExceededError } from '../../../../src/ai/providers/types';

describe('CostMeter', () => {
  let dir: string;
  let file: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cost-meter-'));
    file = path.join(dir, 'cost.jsonl');
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('appends a JSONL line per call', () => {
    const meter = new CostMeter({ filePath: file });
    meter.log(
      { text: '', usage: { inputTokens: 100, outputTokens: 200 }, provider: 'anthropic', model: 'haiku', latencyMs: 50 },
      0.001,
      { task: 'heal', testFile: 't.test.ts' },
    );
    meter.log(
      { text: '', usage: { inputTokens: 50, outputTokens: 60, cachedTokens: 10 }, provider: 'cohere', model: 'cmd', latencyMs: 30 },
      0,
      { task: 'data-gen' },
    );
    const lines = fs.readFileSync(file, 'utf8').trim().split('\n');
    expect(lines).toHaveLength(2);
    const first = JSON.parse(lines[0]);
    expect(first.provider).toBe('anthropic');
    expect(first.costUsd).toBe(0.001);
    expect(first.testFile).toBe('t.test.ts');
  });

  it('skips corrupt lines on aggregation', () => {
    fs.writeFileSync(file, '{"timestamp":"2026-04-27T00:00:00Z","costUsd":0.5}\nGARBAGE\n');
    const meter = new CostMeter({ filePath: file, now: () => new Date('2026-04-27T01:00:00Z') });
    expect(meter.sumSince(new Date('2026-04-27T00:00:00Z'))).toBe(0.5);
  });

  it('returns 0 when no log file exists', () => {
    const meter = new CostMeter({ filePath: path.join(dir, 'nope.jsonl') });
    expect(meter.sumSince()).toBe(0);
    expect(meter.readAll()).toEqual([]);
  });
});

describe('BudgetGuard', () => {
  let dir: string;
  let file: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'budget-guard-'));
    file = path.join(dir, 'cost.jsonl');
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('allows spend below the cap', () => {
    const meter = new CostMeter({ filePath: file });
    const guard = new BudgetGuard({ costMeter: meter, maxDailyUsd: 1 });
    expect(guard.canSpend(0.5)).toBe(true);
    guard.assertCanSpend(0.5);
  });

  it('throws BudgetExceededError when projected spend exceeds cap', () => {
    const today = new Date().toISOString();
    fs.writeFileSync(
      file,
      `${JSON.stringify({ timestamp: today, costUsd: 0.95 })}\n`,
    );
    const meter = new CostMeter({ filePath: file });
    const guard = new BudgetGuard({ costMeter: meter, maxDailyUsd: 1 });
    expect(() => guard.assertCanSpend(0.1)).toThrow(BudgetExceededError);
  });

  it('uses MAX_DAILY_BUDGET_USD env var when no override', () => {
    const original = process.env.MAX_DAILY_BUDGET_USD;
    process.env.MAX_DAILY_BUDGET_USD = '0.5';
    try {
      const meter = new CostMeter({ filePath: file });
      const guard = new BudgetGuard({ costMeter: meter });
      expect(guard.capUsd).toBe(0.5);
    } finally {
      if (original === undefined) delete process.env.MAX_DAILY_BUDGET_USD;
      else process.env.MAX_DAILY_BUDGET_USD = original;
    }
  });

  it('falls back to default cap on invalid env value', () => {
    const original = process.env.MAX_DAILY_BUDGET_USD;
    process.env.MAX_DAILY_BUDGET_USD = 'not-a-number';
    try {
      const meter = new CostMeter({ filePath: file });
      const guard = new BudgetGuard({ costMeter: meter });
      expect(guard.capUsd).toBe(5);
    } finally {
      if (original === undefined) delete process.env.MAX_DAILY_BUDGET_USD;
      else process.env.MAX_DAILY_BUDGET_USD = original;
    }
  });
});
