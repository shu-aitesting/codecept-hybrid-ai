import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { RateLimitTracker } from '../../../../src/ai/providers/RateLimitTracker';

describe('RateLimitTracker', () => {
  let dir: string;
  let file: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rate-limit-'));
    file = path.join(dir, 'rate.json');
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('allows calls when no quota configured for provider', () => {
    const t = new RateLimitTracker({ filePath: file });
    expect(t.canCall('unknown-provider', 1000)).toBe(true);
  });

  it('records calls and tokens', () => {
    const t = new RateLimitTracker({
      filePath: file,
      quotas: { cohere: { maxCalls: 100, windowMs: 1_000_000 } },
    });
    t.record('cohere', 50);
    const snap = t.snapshot('cohere')!;
    expect(snap.calls).toBe(1);
    expect(snap.tokens).toBe(50);
  });

  it('blocks calls within safety margin of quota', () => {
    const t = new RateLimitTracker({
      filePath: file,
      quotas: { cohere: { maxCalls: 10, windowMs: 1_000_000 } },
      safetyMargin: 0.1,
    });
    for (let i = 0; i < 9; i += 1) t.record('cohere', 0);
    // Limit = 10 * 0.9 = 9 calls allowed; the 10th call should be blocked.
    expect(t.canCall('cohere')).toBe(false);
  });

  it('blocks token-based quotas', () => {
    const t = new RateLimitTracker({
      filePath: file,
      quotas: { huggingface: { maxTokens: 1000, windowMs: 1_000_000 } },
      safetyMargin: 0,
    });
    t.record('huggingface', 950);
    expect(t.canCall('huggingface', 100)).toBe(false);
    expect(t.canCall('huggingface', 30)).toBe(true);
  });

  it('resets the window after windowMs has elapsed', () => {
    let now = 1000;
    const t = new RateLimitTracker({
      filePath: file,
      quotas: { cohere: { maxCalls: 1, windowMs: 1000 } },
      safetyMargin: 0,
      now: () => now,
    });
    t.record('cohere', 0);
    expect(t.canCall('cohere')).toBe(false);
    now += 2000; // past window
    expect(t.canCall('cohere')).toBe(true);
  });

  it('survives a corrupt JSON file', () => {
    fs.writeFileSync(file, '{ bad json');
    const t = new RateLimitTracker({
      filePath: file,
      quotas: { cohere: { maxCalls: 10, windowMs: 1_000_000 } },
    });
    expect(t.canCall('cohere')).toBe(true);
  });
});
