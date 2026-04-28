import * as cheerio from 'cheerio';
import { Element } from 'domhandler';

export interface Candidate {
  type: 'css' | 'xpath';
  selector: string;
  score: number;
  reason: string;
  nodePath: string;
  /** False when the selector depends on hashed CSS-Module class names that
   *  will break after any CSS rebuild (e.g. `cta_root__CXED3`). */
  stable: boolean;
}

export interface ScorerOptions {
  /** Filter by selector type. Defaults to 'css'. */
  type?: 'css' | 'xpath';
  /** Maximum number of candidates to return. Defaults to 5. */
  topN?: number;
}

// ─── helpers ────────────────────────────────────────────────────────────────

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

/** CSS Modules hash suffix pattern: `word__XXXX` (4+ alphanumeric after `__`). */
function isHashedCssModuleClass(cls: string): boolean {
  return /__[A-Za-z0-9]{4,}$/.test(cls);
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
  void $;
  return parts.join(' > ');
}

// ─── core scorer ────────────────────────────────────────────────────────────

type TryAdd = (sel: string, reason: string, base: number, stable: boolean) => void;

function addDataAttrs(attrs: Record<string, string>, tryAdd: TryAdd): void {
  for (const key of Object.keys(attrs)) {
    if (/^data-(test|qa|testid)/i.test(key)) {
      tryAdd(`[${key}="${esc(attrs[key])}"]`, `data attribute ${key}`, 80, true);
    }
  }
}

function addSemanticAttrs(attrs: Record<string, string>, tryAdd: TryAdd): void {
  const semanticAttrs = ['aria-label', 'role', 'placeholder', 'alt', 'type', 'title'] as const;
  for (const sa of semanticAttrs) {
    if (attrs[sa]) tryAdd(`[${sa}="${esc(attrs[sa])}"]`, sa, 50, true);
  }
}

function addClassCandidates(tag: string, attrs: Record<string, string>, tryAdd: TryAdd): void {
  if (!attrs.class) return;
  const allClasses = attrs.class.split(/\s+/).filter(Boolean);
  const stableClasses = allClasses.filter((c) => !isHashedCssModuleClass(c));
  const hashedClasses = allClasses.filter((c) => isHashedCssModuleClass(c));
  if (stableClasses.length) {
    const sel = stableClasses
      .slice(0, 2)
      .map((c) => `.${cssEscapeClass(c)}`)
      .join('');
    tryAdd(`${tag}${sel}`, 'stable class chain', 35, true);
  } else if (hashedClasses.length) {
    const sel = hashedClasses
      .slice(0, 2)
      .map((c) => `.${cssEscapeClass(c)}`)
      .join('');
    tryAdd(`${tag}${sel}`, 'hashed CSS-module class (unstable)', 10, false);
  }
}

function addTextXPath(
  $: cheerio.CheerioAPI,
  $el: cheerio.Cheerio<Element>,
  tag: string,
  nodePath: string,
  candidates: Candidate[],
): void {
  const text = $el.text().trim();
  if (!text || text.length > 80) return;
  const textXPath = `.//${tag}[normalize-space(text())="${xpathEscape(text)}"]`;
  const count = $(tag).filter((_, e) => $(e).text().trim() === text).length;
  const uniqueBoost = count === 1 ? 50 : Math.max(5 - Math.min(count, 5), 0);
  candidates.push({
    type: 'xpath',
    selector: textXPath,
    score: 60 + uniqueBoost,
    reason: `text() exact (XPath, matches: ${count})`,
    nodePath,
    stable: true,
  });
}

/**
 * Score a single element against the full-page `$` (for accurate uniqueness
 * counts). Returns candidates sorted best-first.
 */
export function scoreElementInContext(
  $: cheerio.CheerioAPI,
  el: Element,
  opts: ScorerOptions = {},
): Candidate[] {
  const topN = opts.topN ?? 5;
  const type = opts.type ?? 'css';
  const $el = $(el);
  const tag = (el.tagName?.toLowerCase() as string | undefined) ?? '*';
  const attrs = (el.attribs ?? {}) as Record<string, string>;
  const nodePath = getNodePath(el, $);
  const candidates: Candidate[] = [];

  const tryAdd: TryAdd = (sel, reason, base, stable) => {
    if (!sel) return;
    const count = $(sel).length;
    const uniqueBoost = count === 1 ? 40 : Math.max(5 - Math.min(count, 5), 0);
    candidates.push({
      type: 'css',
      selector: sel,
      score: base + uniqueBoost,
      reason: `${reason} (matches: ${count})`,
      nodePath,
      stable,
    });
  };

  addDataAttrs(attrs, tryAdd);
  if (attrs.id) tryAdd(`#${cssEscapeId(attrs.id)}`, 'id', 75, true);
  if (attrs.name) tryAdd(`[name="${esc(attrs.name)}"]`, 'name', 60, true);
  addSemanticAttrs(attrs, tryAdd);
  addClassCandidates(tag, attrs, tryAdd);
  addTextXPath($, $el, tag, nodePath, candidates);

  const deduped = dedupeBySelector(candidates).filter((c) => type !== 'css' || c.type === 'css');
  return [...deduped].sort((a: Candidate, b: Candidate) => b.score - a.score).slice(0, topN);
}

// ─── public API ─────────────────────────────────────────────────────────────

/**
 * Score all interactable elements in `html` and return the top-N candidates
 * sorted by confidence. Scoring: data-testid +80, id +75, name +60,
 * aria/semantic +50, stable class +35, hashed class +10, uniqueness up to +50.
 */
export function scoreElements(html: string, opts: ScorerOptions = {}): Candidate[] {
  if (!html?.trim()) return [];
  const $ = cheerio.load(html);
  const all: Candidate[] = [];
  $('*').each((_, el) => {
    all.push(...scoreElementInContext($, el as Element, opts));
  });
  const sorted = [...all].sort((a: Candidate, b: Candidate) => b.score - a.score);
  return dedupeBySelector(sorted).slice(0, opts.topN ?? 5);
}

/**
 * Score all interactable elements for a single element's HTML fragment.
 * Useful when you already have the element's outer HTML.
 */
export function scoreElementHtml(elementHtml: string, opts: ScorerOptions = {}): Candidate[] {
  return scoreElements(elementHtml, opts);
}
