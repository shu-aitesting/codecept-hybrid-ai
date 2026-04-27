import * as fs from 'node:fs';
import * as path from 'node:path';

interface ProviderQuota {
  /** Free-tier max calls in the rolling window. */
  maxCalls?: number;
  /** Free-tier max tokens in the rolling window. */
  maxTokens?: number;
  /** Window size in ms (default = 1 day). */
  windowMs?: number;
}

interface UsageRecord {
  calls: number;
  tokens: number;
  windowStart: number;
}

/** Default free-tier quotas (best-effort, conservative). */
const DEFAULT_QUOTAS: Record<string, ProviderQuota> = {
  cohere: { maxCalls: 1000, windowMs: 30 * 24 * 60 * 60 * 1000 },
  huggingface: { maxTokens: 30_000, windowMs: 24 * 60 * 60 * 1000 },
};

interface RateLimitTrackerOpts {
  filePath?: string;
  quotas?: Record<string, ProviderQuota>;
  /**
   * If a provider is within this fraction of its quota, `canCall` returns false
   * to leave headroom for retries. Default 10%.
   */
  safetyMargin?: number;
  now?: () => number;
}

/**
 * Tracks per-provider call counts in a JSON file under output/. Free-tier
 * APIs (Cohere, HuggingFace) silently 429 once exceeded — by tracking
 * proactively we route around them before they fail.
 */
export class RateLimitTracker {
  private readonly filePath: string;
  private readonly quotas: Record<string, ProviderQuota>;
  private readonly safetyMargin: number;
  private readonly now: () => number;

  constructor(opts: RateLimitTrackerOpts = {}) {
    this.filePath =
      opts.filePath ?? path.join(process.cwd(), 'output', '.rate-limits.json');
    this.quotas = { ...DEFAULT_QUOTAS, ...(opts.quotas ?? {}) };
    this.safetyMargin = opts.safetyMargin ?? 0.1;
    this.now = opts.now ?? Date.now;
  }

  canCall(provider: string, estimatedTokens = 0): boolean {
    const quota = this.quotas[provider];
    if (!quota) return true;
    const usage = this.read(provider, quota);
    if (quota.maxCalls) {
      const limit = quota.maxCalls * (1 - this.safetyMargin);
      if (usage.calls + 1 > limit) return false;
    }
    if (quota.maxTokens) {
      const limit = quota.maxTokens * (1 - this.safetyMargin);
      if (usage.tokens + estimatedTokens > limit) return false;
    }
    return true;
  }

  record(provider: string, tokens: number): void {
    const quota = this.quotas[provider];
    if (!quota) return;
    const all = this.readAll();
    const usage = this.normalize(all[provider], quota);
    usage.calls += 1;
    usage.tokens += tokens;
    all[provider] = usage;
    this.writeAll(all);
  }

  snapshot(provider: string): UsageRecord | null {
    const quota = this.quotas[provider];
    if (!quota) return null;
    return this.read(provider, quota);
  }

  private read(provider: string, quota: ProviderQuota): UsageRecord {
    return this.normalize(this.readAll()[provider], quota);
  }

  private normalize(record: UsageRecord | undefined, quota: ProviderQuota): UsageRecord {
    const window = quota.windowMs ?? 24 * 60 * 60 * 1000;
    const now = this.now();
    if (!record || now - record.windowStart >= window) {
      return { calls: 0, tokens: 0, windowStart: now };
    }
    return { ...record };
  }

  private readAll(): Record<string, UsageRecord> {
    try {
      if (!fs.existsSync(this.filePath)) return {};
      return JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
    } catch {
      return {};
    }
  }

  private writeAll(data: Record<string, UsageRecord>): void {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2));
  }
}
