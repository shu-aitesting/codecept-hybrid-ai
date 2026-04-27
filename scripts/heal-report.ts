/* eslint-disable no-console */
import * as fs from 'node:fs';
import * as path from 'node:path';

import { HealEvent, HealTelemetry } from '../src/ai/heal/HealTelemetry';

interface Aggregated {
  total: number;
  successes: number;
  totalCostUsd: number;
  avgDomBytes: number;
  perProvider: Record<string, { count: number; success: number; cost: number }>;
  topFailedSelectors: Array<{ selector: string; count: number }>;
}

function aggregate(events: HealEvent[]): Aggregated {
  const total = events.length;
  const successes = events.filter((e) => e.success).length;
  const totalCostUsd = events.reduce((s, e) => s + (e.costUsd || 0), 0);
  const avgDomBytes = total
    ? events.reduce((s, e) => s + (e.sanitizedDomBytes || 0), 0) / total
    : 0;
  const perProvider: Aggregated['perProvider'] = {};
  for (const e of events) {
    const key = e.provider ?? 'none';
    perProvider[key] = perProvider[key] ?? { count: 0, success: 0, cost: 0 };
    perProvider[key].count += 1;
    if (e.success) perProvider[key].success += 1;
    perProvider[key].cost += e.costUsd || 0;
  }
  const failTally = new Map<string, number>();
  for (const e of events) {
    if (!e.success) failTally.set(e.originalSelector, (failTally.get(e.originalSelector) ?? 0) + 1);
  }
  const topFailedSelectors = [...failTally.entries()]
    .map(([selector, count]) => ({ selector, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
  return { total, successes, totalCostUsd, avgDomBytes, perProvider, topFailedSelectors };
}

function renderHtml(agg: Aggregated): string {
  const successRate = agg.total ? ((agg.successes / agg.total) * 100).toFixed(1) : '0.0';
  const providers = Object.entries(agg.perProvider)
    .map(
      ([k, v]) =>
        `<tr><td>${k}</td><td>${v.count}</td><td>${v.success}</td><td>$${v.cost.toFixed(4)}</td></tr>`,
    )
    .join('');
  const topFail = agg.topFailedSelectors
    .map((r) => `<tr><td><code>${escapeHtml(r.selector)}</code></td><td>${r.count}</td></tr>`)
    .join('');
  return `<!doctype html>
<html><head><meta charset="utf-8"/><title>Heal Report</title>
<style>body{font-family:system-ui,sans-serif;max-width:880px;margin:2em auto;padding:0 1em}
table{border-collapse:collapse;width:100%;margin:1em 0}td,th{border:1px solid #ddd;padding:.5em;text-align:left}
.kpi{display:inline-block;margin-right:1.5em;padding:.6em 1em;background:#f3f3f3;border-radius:.5em}
code{background:#f0f0f0;padding:0 .3em;border-radius:.2em}</style></head>
<body><h1>Self-Heal Report</h1>
<div class="kpi"><b>Total:</b> ${agg.total}</div>
<div class="kpi"><b>Success rate:</b> ${successRate}%</div>
<div class="kpi"><b>Total cost:</b> $${agg.totalCostUsd.toFixed(4)}</div>
<div class="kpi"><b>Avg sanitized DOM:</b> ${(agg.avgDomBytes / 1024).toFixed(1)} KB</div>
<h2>Per provider</h2>
<table><tr><th>Provider</th><th>Calls</th><th>Successes</th><th>Cost</th></tr>${providers || '<tr><td colspan="4">No data</td></tr>'}</table>
<h2>Top failing selectors</h2>
<table><tr><th>Selector</th><th>Failures</th></tr>${topFail || '<tr><td colspan="2">None</td></tr>'}</table>
</body></html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function main(): void {
  const telemetry = new HealTelemetry();
  const events = telemetry.readAll();
  const agg = aggregate(events);
  const outFile = path.join(process.cwd(), 'output', 'heal-report.html');
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, renderHtml(agg));
  console.log(JSON.stringify(agg, null, 2));
  console.log(`HTML report: ${outFile}`);
}

if (require.main === module) {
  main();
}

export { aggregate, renderHtml };
