import { CostMeter } from './CostMeter';
import { BudgetExceededError } from './types';

interface BudgetGuardOpts {
  costMeter?: CostMeter;
  /** USD/day cap. Defaults to env MAX_DAILY_BUDGET_USD or 5. */
  maxDailyUsd?: number;
}

/**
 * Hard daily budget cap. Reads cost ledger from CostMeter and aborts the
 * run when today's spend (plus the in-flight projected cost) would breach
 * the cap. Prevents runaway agent loops from ever producing a surprise bill.
 */
export class BudgetGuard {
  private readonly meter: CostMeter;
  private readonly cap: number;

  constructor(opts: BudgetGuardOpts = {}) {
    this.meter = opts.costMeter ?? new CostMeter();
    const envCap = Number(process.env.MAX_DAILY_BUDGET_USD);
    this.cap = opts.maxDailyUsd ?? (Number.isFinite(envCap) && envCap > 0 ? envCap : 5);
  }

  get capUsd(): number {
    return this.cap;
  }

  spentToday(): number {
    return this.meter.sumSince();
  }

  canSpend(estimatedUsd = 0): boolean {
    return this.spentToday() + estimatedUsd <= this.cap;
  }

  /** Throws if the projected spend would breach the cap. */
  assertCanSpend(estimatedUsd = 0): void {
    const spent = this.spentToday();
    if (spent + estimatedUsd > this.cap) {
      throw new BudgetExceededError(
        `Daily LLM budget exceeded: spent $${spent.toFixed(4)}, projected $${(spent + estimatedUsd).toFixed(4)}, cap $${this.cap.toFixed(2)}`,
        spent,
        this.cap,
      );
    }
  }
}
