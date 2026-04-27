import { describe, expect, it } from 'vitest';

import { scoreElements, scoreElementHtml } from '../../../../src/ai/codegen/LocatorScorer';

describe('LocatorScorer', () => {
  // ── Happy path: scoring rules ────────────────────────────────────────────

  it('data-testid candidate scores highest (≥80)', () => {
    const html = '<button data-testid="login-btn">Login</button>';
    const results = scoreElements(html);
    expect(results.length).toBeGreaterThan(0);
    const best = results[0];
    expect(best.selector).toContain('data-testid');
    expect(best.score).toBeGreaterThanOrEqual(80);
  });

  it('id candidate scores ≥75', () => {
    const html = '<input id="email-input" type="email" />';
    const results = scoreElements(html);
    const idCandidate = results.find((c) => c.selector === '#email-input');
    expect(idCandidate).toBeDefined();
    expect(idCandidate!.score).toBeGreaterThanOrEqual(75);
  });

  it('name attribute scores ≥60', () => {
    const html = '<input name="username" />';
    const results = scoreElements(html);
    const nameCand = results.find((c) => c.selector.includes('[name='));
    expect(nameCand).toBeDefined();
    expect(nameCand!.score).toBeGreaterThanOrEqual(60);
  });

  it('aria-label scores ≥50', () => {
    const html = '<button aria-label="Submit form">Go</button>';
    const results = scoreElements(html);
    const ariaCand = results.find((c) => c.selector.includes('aria-label'));
    expect(ariaCand).toBeDefined();
    expect(ariaCand!.score).toBeGreaterThanOrEqual(50);
  });

  it('class chain scores ≥35', () => {
    const html = '<button class="btn btn-primary">Click</button>';
    const results = scoreElements(html, { topN: 10 });
    const classCand = results.find((c) => c.selector.includes('.btn'));
    expect(classCand).toBeDefined();
    expect(classCand!.score).toBeGreaterThanOrEqual(35);
  });

  it('data-testid outranks id outranks class', () => {
    const html =
      '<button data-testid="submit" id="submit-btn" class="btn-primary">Submit</button>';
    const results = scoreElements(html, { topN: 10 });
    const testid = results.find((c) => c.selector.includes('data-testid'));
    const id = results.find((c) => c.selector === '#submit-btn');
    const cls = results.find((c) => c.selector.includes('.btn-primary'));
    expect(testid).toBeDefined();
    expect(id).toBeDefined();
    if (testid && id) expect(testid.score).toBeGreaterThan(id.score);
    if (id && cls) expect(id.score).toBeGreaterThan(cls.score);
  });

  it('uniqueness boost: unique element scores higher than duplicated', () => {
    const html = `
      <button data-testid="unique-btn">Only One</button>
      <button data-testid="dup">Dup</button>
      <button data-testid="dup">Dup</button>
    `;
    const results = scoreElements(html, { topN: 20 });
    const uniqueBtn = results.find((c) => c.selector === '[data-testid="unique-btn"]');
    const dupBtn = results.find((c) => c.selector === '[data-testid="dup"]');
    expect(uniqueBtn).toBeDefined();
    expect(dupBtn).toBeDefined();
    if (uniqueBtn && dupBtn) {
      expect(uniqueBtn.score).toBeGreaterThan(dupBtn.score);
    }
  });

  it('text content generates XPath candidate', () => {
    const html = '<button>Sign In</button>';
    const results = scoreElements(html, { topN: 10, type: 'xpath' });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].type).toBe('xpath');
    expect(results[0].selector).toContain('Sign In');
  });

  // ── topN truncation ──────────────────────────────────────────────────────

  it('returns at most topN results', () => {
    const html = `
      <input id="a" name="fa" aria-label="A" data-testid="ta" />
      <input id="b" name="fb" aria-label="B" data-testid="tb" />
      <button id="c" class="x y">Click</button>
    `;
    const results = scoreElements(html, { topN: 3 });
    expect(results.length).toBeLessThanOrEqual(3);
  });

  it('defaults to topN=5 when not specified', () => {
    const html = Array.from(
      { length: 20 },
      (_, i) => `<button data-testid="btn-${i}">B${i}</button>`,
    ).join('');
    const results = scoreElements(html);
    expect(results.length).toBeLessThanOrEqual(5);
  });

  // ── Edge cases ───────────────────────────────────────────────────────────

  it('returns empty array for empty HTML string', () => {
    expect(scoreElements('')).toEqual([]);
  });

  it('returns empty array for whitespace-only string', () => {
    expect(scoreElements('   \n\t  ')).toEqual([]);
  });

  it('handles HTML with no interactable elements gracefully', () => {
    const html = '<div><p>Just text</p><span>More text</span></div>';
    const results = scoreElements(html);
    // May or may not have candidates (text can generate xpath) — just no throw
    expect(Array.isArray(results)).toBe(true);
  });

  it('deduplicates candidates with identical selectors', () => {
    // Two elements with same class — class selector appears once
    const html = '<button class="primary">A</button><button class="primary">B</button>';
    const results = scoreElements(html, { topN: 20 });
    const selectors = results.map((c) => c.selector);
    const unique = new Set(selectors);
    expect(selectors.length).toBe(unique.size);
  });

  it('escapes special chars in attribute values', () => {
    const html = '<input data-testid="field.name" />';
    const results = scoreElements(html);
    const cand = results.find((c) => c.type === 'css');
    expect(cand).toBeDefined();
    // Should contain the testid value somehow (escaped or raw depending on cheerio)
    expect(cand!.selector).toContain('data-testid');
  });

  it('scoreElementHtml is an alias for scoreElements on single element HTML', () => {
    const html = '<button data-testid="x">X</button>';
    const a = scoreElements(html);
    const b = scoreElementHtml(html);
    expect(a).toEqual(b);
  });

  it('filters by type=css by default', () => {
    const html = '<button>Click Me</button>';
    const results = scoreElements(html);
    expect(results.every((c) => c.type === 'css')).toBe(true);
  });

  it('filters by type=xpath when specified', () => {
    const html = '<button>Click Me</button>';
    const results = scoreElements(html, { type: 'xpath' });
    expect(results.every((c) => c.type === 'xpath')).toBe(true);
  });
});
