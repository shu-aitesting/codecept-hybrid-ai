#!/usr/bin/env ts-node
/**
 * Aggregate llm-cost.jsonl entries where agentName is set (codegen events)
 * and print a per-agent summary: total cost, call count, avg retries.
 */
import * as path from 'node:path';

import { CostMeter } from '../src/ai/providers/CostMeter';

interface AgentStats {
  calls: number;
  totalCostUsd: number;
  totalInputTokens: number;
  totalOutputTokens: number;
}

function run(): void {
  const meter = new CostMeter({
    filePath: path.join(process.cwd(), 'output', 'llm-cost.jsonl'),
  });
  const all = meter.readAll();
  const codegenEntries = all.filter((e) => !!e.agentName);

  if (codegenEntries.length === 0) {
    console.log('No codegen entries found in output/llm-cost.jsonl');
    console.log('Run `npm run gen:page`, `npm run gen:api`, or `npm run gen:scenario` first.');
    return;
  }

  const byAgent = new Map<string, AgentStats>();
  for (const entry of codegenEntries) {
    const name = entry.agentName!;
    if (!byAgent.has(name)) {
      byAgent.set(name, { calls: 0, totalCostUsd: 0, totalInputTokens: 0, totalOutputTokens: 0 });
    }
    const stats = byAgent.get(name)!;
    stats.calls += 1;
    stats.totalCostUsd += entry.costUsd;
    stats.totalInputTokens += entry.inputTokens;
    stats.totalOutputTokens += entry.outputTokens;
  }

  const totalCost = codegenEntries.reduce((s, e) => s + e.costUsd, 0);

  console.log('\n=== AI Codegen Report ===\n');
  console.log(`Total entries : ${codegenEntries.length}`);
  console.log(`Total cost    : $${totalCost.toFixed(4)}\n`);
  console.log('Per-agent breakdown:');
  console.log('─'.repeat(70));
  console.log(
    `${'Agent'.padEnd(25)} ${'Calls'.padStart(6)} ${'Cost USD'.padStart(10)} ${'Avg In Tokens'.padStart(14)} ${'Avg Out Tokens'.padStart(15)}`,
  );
  console.log('─'.repeat(70));

  for (const [name, stats] of [...byAgent.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const avgIn = (stats.totalInputTokens / stats.calls).toFixed(0);
    const avgOut = (stats.totalOutputTokens / stats.calls).toFixed(0);
    console.log(
      `${name.padEnd(25)} ${String(stats.calls).padStart(6)} ${('$' + stats.totalCostUsd.toFixed(4)).padStart(10)} ${avgIn.padStart(14)} ${avgOut.padStart(15)}`,
    );
  }
  console.log('─'.repeat(70));
  console.log();
}

run();
