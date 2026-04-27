import { afterEach, describe, expect, it } from 'vitest';

import { CircuitBreaker } from '../../../../src/ai/providers/CircuitBreaker';

describe('CircuitBreaker', () => {
  afterEach(() => CircuitBreaker.reset());

  it('starts closed and allows calls', () => {
    const cb = new CircuitBreaker('p1');
    expect(cb.state()).toBe('closed');
    expect(cb.allow()).toBe(true);
  });

  it('opens after threshold consecutive failures and rejects further calls', () => {
    const now = 0;
    const cb = new CircuitBreaker('p1', { failureThreshold: 3, cooldownMs: 1000, now: () => now });
    cb.recordFailure();
    cb.recordFailure();
    cb.recordFailure();
    expect(cb.state()).toBe('open');
    expect(cb.allow()).toBe(false);
  });

  it('moves to half-open after cooldown and closes on success', () => {
    let now = 0;
    const cb = new CircuitBreaker('p2', { failureThreshold: 2, cooldownMs: 1000, now: () => now });
    cb.recordFailure();
    cb.recordFailure();
    expect(cb.state()).toBe('open');
    now = 1500;
    expect(cb.allow()).toBe(true);
    expect(cb.state()).toBe('half-open');
    cb.recordSuccess();
    expect(cb.state()).toBe('closed');
  });

  it('extends cooldown when half-open probe fails', () => {
    let now = 0;
    const cb = new CircuitBreaker('p3', {
      failureThreshold: 1,
      cooldownMs: 1000,
      maxCooldownMs: 8000,
      now: () => now,
    });
    cb.recordFailure();
    expect(cb.state()).toBe('open');
    now = 2000;
    expect(cb.allow()).toBe(true); // half-open
    cb.recordFailure();
    expect(cb.state()).toBe('open');
    // Cooldown should be doubled (2000 ms) — still open at now+1500
    now = 3500;
    expect(cb.allow()).toBe(false);
    now = 5000;
    expect(cb.allow()).toBe(true);
  });

  it('caps cooldown at maxCooldownMs', () => {
    let now = 0;
    const cb = new CircuitBreaker('p4', {
      failureThreshold: 1,
      cooldownMs: 1000,
      maxCooldownMs: 2000,
      now: () => now,
    });
    cb.recordFailure();
    for (let i = 0; i < 5; i += 1) {
      now += 10_000;
      cb.allow();
      cb.recordFailure();
    }
    const snap = cb.snapshot();
    expect(snap.cooldownMs).toBeLessThanOrEqual(2000);
  });

  it('singleton-per-key returns same instance', () => {
    const a = CircuitBreaker.for('shared');
    const b = CircuitBreaker.for('shared');
    expect(a).toBe(b);
  });

  it('resets consecutive failures on a success', () => {
    const cb = new CircuitBreaker('p5', { failureThreshold: 3 });
    cb.recordFailure();
    cb.recordFailure();
    cb.recordSuccess();
    cb.recordFailure();
    cb.recordFailure();
    expect(cb.state()).toBe('closed'); // 2 fails after reset → still below threshold
  });
});
