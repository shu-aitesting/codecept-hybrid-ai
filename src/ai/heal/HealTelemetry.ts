import * as fs from 'node:fs';
import * as path from 'node:path';

export interface HealEvent {
  timestamp: string;
  testFile: string;
  originalSelector: string;
  healedSelector: string | null;
  success: boolean;
  provider?: string;
  latencyMs: number;
  costUsd: number;
  sanitizedDomBytes: number;
  candidatesCount: number;
  reason?: string;
}

interface TelemetryOpts {
  filePath?: string;
  now?: () => Date;
}

/**
 * Append-only JSONL stream of every heal attempt. Aggregated by
 * scripts/heal-report.ts to surface heal rate, cost, and DOM-size reduction.
 */
export class HealTelemetry {
  private readonly filePath: string;
  private readonly now: () => Date;

  constructor(opts: TelemetryOpts = {}) {
    this.filePath =
      opts.filePath ?? path.join(process.cwd(), 'output', 'heal-events.jsonl');
    this.now = opts.now ?? (() => new Date());
  }

  append(event: Omit<HealEvent, 'timestamp'>): HealEvent {
    const fullEvent: HealEvent = { timestamp: this.now().toISOString(), ...event };
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.appendFileSync(this.filePath, `${JSON.stringify(fullEvent)}\n`);
    return fullEvent;
  }

  readAll(): HealEvent[] {
    if (!fs.existsSync(this.filePath)) return [];
    const data = fs.readFileSync(this.filePath, 'utf8');
    const out: HealEvent[] = [];
    for (const line of data.split('\n')) {
      if (!line) continue;
      try {
        out.push(JSON.parse(line));
      } catch {
        // Skip corrupt rows.
      }
    }
    return out;
  }
}
