import * as cheerio from 'cheerio';
import { Element } from 'domhandler';

export interface Candidate {
  type: 'css' | 'xpath';
  selector: string;
  score: number;
  reason: string;
  nodePath: string;
}

export interface ScorerOptions {
  /** Filter by selector type. Defaults to 'css'. */
  type?: 'css' | 'xpath';
  /** Maximum number of candidates to return. Defaults to 5. */
  topN?: number;
}

function esc(val: string) {
  return val.replace(/"/g, '\\"');
}

function cssEscapeId(id: string) {
  return id.replace(/[^a-zA-Z0-9_-]/g, (r) => `\\${r}`);
}

function cssEscapeClass(cls: string) {
  return cls.replace(/[^a-zA-Z0-9_-]/g, (r) => `\\${r}`);
}

function xpathEscape(s: string) {
  return s.replace(/"/g, '\\"');
}

function dedupeBySelector(arr: Candidate[]): Candidate[] {
  const seen = new Set<string>();
  return arr.filter((c) => {
    if (seen.has(c.selector)) return false;
    seen.add(c.selector);
    return true;
  });
}

function getNodePath(el: Element, $: cheerio.CheerioAPI): string {
  const parts: string[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let cur: any = el;
  while (cur && cur.type === 'tag') {
    const tag = (cur.tagName as string | undefined)?.toLowerCase() ?? 'node';
    const id = (cur.attribs as Record<string, string>)?.id
      ? `#${(cur.attribs as Record<string, string>).id}`
      : '';
    parts.unshift(`${tag}${id}`);
    cur = cur.parent as unknown;
  }
  void $; // cheerio passed for signature parity with callers
  return parts.join(' > ');
}

function scoreElement(
  $: cheerio.CheerioAPI,
  el: Element,
): Candidate[] {
  const $el = $(el);
  const tag = (el.tagName?.toLowerCase() as string | undefined) ?? '*';
  const attrs = (el.attribs ?? {}) as Record<string, string>;
  const nodePath = getNodePath(el, $);
  const candidates: Candidate[] = [];

  const tryAdd = (sel: string, reason: string, base = 0) => {
    if (!sel) return;
    const count = $(sel).length;
    const uniqueBoost = count === 1 ? 40 : Math.max(5 - Math.min(count, 5), 0);
    candidates.push({
      type: 'css',
      selector: sel,
      score: base + uniqueBoost,
      reason: `${reason} (matches: ${count})`,
      nodePath,
    });
  };

  // data-testid / data-test / data-qa
  for (const key of Object.keys(attrs)) {
    if (/^data-(test|qa|testid)/i.test(key)) {
      tryAdd(`[${key}="${esc(attrs[key])}"]`, `data attribute ${key}`, 80);
    }
  }

  // id
  if (attrs.id) tryAdd(`#${cssEscapeId(attrs.id)}`, 'id', 75);

  // name
  if (attrs.name) tryAdd(`[name="${esc(attrs.name)}"]`, 'name', 60);

  // semantic attrs: aria-label, role, placeholder, alt, type, title
  const semanticAttrs = ['aria-label', 'role', 'placeholder', 'alt', 'type', 'title'] as const;
  for (const sa of semanticAttrs) {
    if (attrs[sa]) tryAdd(`[${sa}="${esc(attrs[sa])}"]`, sa, 50);
  }

  // class chain (first 2 classes)
  if (attrs.class) {
    const classes = attrs.class.split(/\s+/).filter(Boolean).slice(0, 2);
    if (classes.length) {
      const classSel = classes.map((c) => `.${cssEscapeClass(c)}`).join('');
      tryAdd(`${tag}${classSel}`, 'class chain', 35);
    }
  }

  // text content (XPath)
  const text = $el.text().trim();
  if (text && text.length <= 80) {
    const textXPath = `.//${tag}[normalize-space(text())="${xpathEscape(text)}"]`;
    const count = $(tag).filter((_, e) => $(e).text().trim() === text).length;
    const uniqueBoost = count === 1 ? 50 : Math.max(5 - Math.min(count, 5), 0);
    candidates.push({
      type: 'xpath',
      selector: textXPath,
      score: 60 + uniqueBoost,
      reason: `text() exact (XPath, matches: ${count})`,
      nodePath,
    });
  }

  return dedupeBySelector(candidates).sort((a, b) => b.score - a.score);
}

/**
 * Score all interactable elements in `html` and return the top-N candidates
 * sorted by confidence. Deterministic scoring (no LLM): data-testid +80,
 * id +75, name +60, aria/semantic +50, class chain +35, text +60, uniqueness
 * boost up to +50.
 */
export function scoreElements(html: string, opts: ScorerOptions = {}): Candidate[] {
  const type = opts.type ?? 'css';
  const topN = opts.topN ?? 5;

  if (!html || !html.trim()) return [];

  const $ = cheerio.load(html);
  const all: Candidate[] = [];

  $('*').each((_, el) => {
    all.push(...scoreElement($, el as Element));
  });

  const filtered = all
    .filter((c) => c.type === type)
    .sort((a, b) => b.score - a.score);

  return dedupeBySelector(filtered).slice(0, topN);
}

/**
 * Score all interactable elements for a single element's HTML fragment.
 * Useful when you already have the element's outer HTML.
 */
export function scoreElementHtml(elementHtml: string, opts: ScorerOptions = {}): Candidate[] {
  return scoreElements(elementHtml, opts);
}
