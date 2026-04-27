import * as fs from 'node:fs';
import * as path from 'node:path';

import { ChatResult, TaskProfile } from './types';

export interface CostEntry {
  timestamp: string;
  provider: string;
  model: string;
  task: TaskProfile | string;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  costUsd: number;
  testFile?: string;
  agentName?: string;
  latencyMs: number;
}

interface CostMeterOpts {
  filePath?: string;
  now?: () => Date;
}

/**
 * Append-only JSONL log of every LLM call. JSONL is chosen because it is
 * lock-free for parallel workers (atomic O_APPEND writes) and trivial to
 * stream-parse for the dashboard.
 */
export class CostMeter {
  private readonly filePath: string;
  private readonly now: () => Date;

  constructor(opts: CostMeterOpts = {}) {
    this.filePath =
      opts.filePath ?? path.join(process.cwd(), 'output', 'llm-cost.jsonl');
    this.now = opts.now ?? (() => new Date());
  }

  log(
    result: ChatResult,
    cost: number,
    meta: { task: TaskProfile | string; testFile?: string; agentName?: string },
  ): CostEntry {
    const entry: CostEntry = {
      timestamp: this.now().toISOString(),
      provider: result.provider,
      model: result.model,
      task: meta.task,
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      cachedTokens: result.usage.cachedTokens ?? 0,
      costUsd: Number(cost.toFixed(6)),
      testFile: meta.testFile,
      agentName: meta.agentName,
      latencyMs: result.latencyMs,
    };
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.appendFileSync(this.filePath, `${JSON.stringify(entry)}\n`);
    return entry;
  }

  /** Aggregate cost since `since`. Defaults to the start of "today" UTC. */
  sumSince(since?: Date): number {
    const cutoff = since ?? new Date(new Date().toISOString().slice(0, 10));
    if (!fs.existsSync(this.filePath)) return 0;
    let total = 0;
    const data = fs.readFileSync(this.filePath, 'utf8');
    for (const line of data.split('\n')) {
      if (!line) continue;
      try {
        const entry = JSON.parse(line) as CostEntry;
        if (new Date(entry.timestamp) >= cutoff) total += entry.costUsd;
      } catch {
        // Skip corrupt lines — better than aborting the whole guard.
      }
    }
    return Number(total.toFixed(6));
  }

  readAll(): CostEntry[] {
    if (!fs.existsSync(this.filePath)) return [];
    const out: CostEntry[] = [];
    for (const line of fs.readFileSync(this.filePath, 'utf8').split('\n')) {
      if (!line) continue;
      try {
        out.push(JSON.parse(line));
      } catch {
        // Skip corrupt lines.
      }
    }
    return out;
  }
}
