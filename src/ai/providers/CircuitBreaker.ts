export type BreakerState = 'closed' | 'open' | 'half-open';

interface BreakerOpts {
  failureThreshold?: number;
  cooldownMs?: number;
  maxCooldownMs?: number;
  /** Optional clock injection for deterministic testing. */
  now?: () => number;
}

interface BreakerEntry {
  state: BreakerState;
  consecutiveFailures: number;
  openedAt: number;
  cooldownMs: number;
}

/**
 * Per-provider circuit breaker. After N consecutive failures the breaker
 * trips open for `cooldownMs`; the next request enters half-open mode and a
 * single trial call decides whether to close (success) or re-open with
 * extended cooldown (failure).
 *
 * Why singleton-per-key: every worker process should observe the same
 * breaker state so a misbehaving provider doesn't get re-hammered by parallel
 * test workers.
 */
export class CircuitBreaker {
  private static readonly registry = new Map<string, CircuitBreaker>();

  private entry: BreakerEntry;
  private readonly failureThreshold: number;
  private readonly initialCooldownMs: number;
  private readonly maxCooldownMs: number;
  private readonly now: () => number;

  constructor(public readonly key: string, opts: BreakerOpts = {}) {
    this.failureThreshold = opts.failureThreshold ?? 3;
    this.initialCooldownMs = opts.cooldownMs ?? 60_000;
    this.maxCooldownMs = opts.maxCooldownMs ?? 5 * 60_000;
    this.now = opts.now ?? Date.now;
    this.entry = {
      state: 'closed',
      consecutiveFailures: 0,
      openedAt: 0,
      cooldownMs: this.initialCooldownMs,
    };
  }

  static for(key: string, opts?: BreakerOpts): CircuitBreaker {
    let cb = this.registry.get(key);
    if (!cb) {
      cb = new CircuitBreaker(key, opts);
      this.registry.set(key, cb);
    }
    return cb;
  }

  static reset(): void {
    this.registry.clear();
  }

  /** Returns true if the breaker permits a call right now. */
  allow(): boolean {
    if (this.entry.state === 'closed') return true;
    if (this.entry.state === 'open') {
      const elapsed = this.now() - this.entry.openedAt;
      if (elapsed >= this.entry.cooldownMs) {
        this.entry.state = 'half-open';
        return true;
      }
      return false;
    }
    // half-open: only one probe is allowed; subsequent calls must wait for
    // the probe's success/failure to flip the state.
    return false;
  }

  recordSuccess(): void {
    this.entry.state = 'closed';
    this.entry.consecutiveFailures = 0;
    this.entry.openedAt = 0;
    this.entry.cooldownMs = this.initialCooldownMs;
  }

  recordFailure(): void {
    this.entry.consecutiveFailures += 1;
    if (this.entry.state === 'half-open') {
      // Probe failed → re-open with backoff (cap at maxCooldownMs).
      this.entry.cooldownMs = Math.min(this.entry.cooldownMs * 2, this.maxCooldownMs);
      this.entry.state = 'open';
      this.entry.openedAt = this.now();
      return;
    }
    if (this.entry.consecutiveFailures >= this.failureThreshold) {
      this.entry.state = 'open';
      this.entry.openedAt = this.now();
    }
  }

  state(): BreakerState {
    return this.entry.state;
  }

  snapshot(): Readonly<BreakerEntry> {
    return { ...this.entry };
  }
}
