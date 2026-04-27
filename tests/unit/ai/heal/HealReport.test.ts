import { describe, expect, it } from 'vitest';

import { aggregate, renderHtml } from '../../../../scripts/heal-report';
import { HealEvent } from '../../../../src/ai/heal/HealTelemetry';

const baseEvent: HealEvent = {
  timestamp: '2026-04-27T00:00:00Z',
  testFile: 't.test.ts',
  originalSelector: '#old',
  healedSelector: null,
  success: false,
  latencyMs: 100,
  costUsd: 0,
  sanitizedDomBytes: 1000,
  candidatesCount: 0,
};

describe('heal-report aggregator', () => {
  it('returns zero stats for empty input', () => {
    const agg = aggregate([]);
    expect(agg.total).toBe(0);
    expect(agg.successes).toBe(0);
    expect(agg.totalCostUsd).toBe(0);
    expect(agg.avgDomBytes).toBe(0);
  });

  it('counts per-provider successes and cost', () => {
    const agg = aggregate([
      { ...baseEvent, success: true, provider: 'anthropic', costUsd: 0.01 },
      { ...baseEvent, success: false, provider: 'anthropic', costUsd: 0.02 },
      { ...baseEvent, success: true, provider: 'cohere', costUsd: 0 },
    ]);
    expect(agg.total).toBe(3);
    expect(agg.successes).toBe(2);
    expect(agg.totalCostUsd).toBeCloseTo(0.03);
    expect(agg.perProvider.anthropic.count).toBe(2);
    expect(agg.perProvider.anthropic.success).toBe(1);
    expect(agg.perProvider.cohere.count).toBe(1);
  });

  it('lists top failing selectors', () => {
    const agg = aggregate([
      { ...baseEvent, originalSelector: '#a', success: false },
      { ...baseEvent, originalSelector: '#a', success: false },
      { ...baseEvent, originalSelector: '#b', success: false },
      { ...baseEvent, originalSelector: '#c', success: true },
    ]);
    expect(agg.topFailedSelectors[0].selector).toBe('#a');
    expect(agg.topFailedSelectors[0].count).toBe(2);
    expect(agg.topFailedSelectors.find((r) => r.selector === '#c')).toBeUndefined();
  });

  it('renders HTML containing key metrics', () => {
    const agg = aggregate([
      { ...baseEvent, success: true, provider: 'anthropic', costUsd: 0.01 },
      { ...baseEvent, success: false, provider: 'anthropic' },
    ]);
    const html = renderHtml(agg);
    expect(html).toContain('Self-Heal Report');
    expect(html).toContain('50.0%');
    expect(html).toContain('anthropic');
  });

  it('escapes HTML special chars in selector strings', () => {
    const html = renderHtml(
      aggregate([{ ...baseEvent, originalSelector: '<script>bad</script>', success: false }]),
    );
    expect(html).not.toContain('<script>bad');
    expect(html).toContain('&lt;script&gt;');
  });
});
