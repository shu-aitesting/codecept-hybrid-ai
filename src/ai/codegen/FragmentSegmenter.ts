import * as cheerio from 'cheerio';
import { Element } from 'domhandler';

export interface Segment {
  /** PascalCase name used as the class prefix, e.g. "Header", "HeroCarousel". */
  name: string;
  /** Semantic landmark type for the LLM context. */
  landmark: string;
  /** CSS selector that uniquely identifies the root element. */
  rootSelector: string;
}

// ─── helpers ────────────────────────────────────────────────────────────────

function toPascalCase(text: string): string {
  return text
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join('');
}

function deriveRootSelector($el: cheerio.Cheerio<Element>): string {
  const id = $el.attr('id');
  if (id) return `#${id}`;

  const testId = $el.attr('data-testid') ?? $el.attr('data-test');
  if (testId) return `[data-testid="${testId}"]`;

  const role = $el.attr('role');
  if (role) return `[role="${role}"]`;

  const tag = ($el[0] as Element).tagName?.toLowerCase();
  if (tag && ['header', 'nav', 'main', 'footer', 'aside', 'form'].includes(tag)) {
    return tag;
  }

  // First non-hashed class as fallback
  const cls = $el.attr('class') ?? '';
  const stableClass = cls.split(/\s+/).find((c) => c && !/__[A-Za-z0-9]{4,}$/.test(c));
  if (stableClass) return `.${stableClass}`;

  return tag ?? 'div';
}

function nameFromAriaOrHeading($el: cheerio.Cheerio<Element>, fallback: string): string {
  const label = $el.attr('aria-label');
  if (label) return toPascalCase(label);
  const heading = $el.find('h1,h2,h3,h4').first().text().trim();
  if (heading) return toPascalCase(heading);
  return fallback;
}

// ─── semantic landmark rules ─────────────────────────────────────────────────

interface LandmarkRule {
  selector: string;
  landmark: string;
  name: ($el: cheerio.Cheerio<Element>) => string;
}

const LANDMARK_RULES: LandmarkRule[] = [
  {
    selector: 'header:not(header header), [role="banner"]',
    landmark: 'banner',
    name: ($el) => nameFromAriaOrHeading($el, 'Header'),
  },
  {
    selector: 'nav, [role="navigation"]',
    landmark: 'navigation',
    name: ($el) => {
      const label = $el.attr('aria-label');
      return label ? toPascalCase(label) : 'Navigation';
    },
  },
  {
    selector: 'main, [role="main"]',
    landmark: 'main',
    name: ($el) => nameFromAriaOrHeading($el, 'MainContent'),
  },
  {
    selector: 'footer:not(footer footer), [role="contentinfo"]',
    landmark: 'contentinfo',
    name: ($el) => nameFromAriaOrHeading($el, 'Footer'),
  },
  {
    selector: 'aside, [role="complementary"]',
    landmark: 'complementary',
    name: ($el) => nameFromAriaOrHeading($el, 'Sidebar'),
  },
  {
    selector: 'form',
    landmark: 'form',
    name: ($el) => nameFromAriaOrHeading($el, 'Form') + 'Form',
  },
];

// ─── heuristic patterns for non-semantic pages ───────────────────────────────

interface HeuristicPattern {
  pattern: RegExp;
  landmark: string;
  nameSuffix: string;
}

const HEURISTIC_PATTERNS: HeuristicPattern[] = [
  { pattern: /\bhero\b|\bbanner\b/i, landmark: 'hero', nameSuffix: 'Hero' },
  { pattern: /\bcarousel\b|\bslider\b/i, landmark: 'carousel', nameSuffix: 'Carousel' },
  { pattern: /\bmodal\b|\bdialog\b/i, landmark: 'dialog', nameSuffix: 'Modal' },
  { pattern: /\bsearch\b/i, landmark: 'search', nameSuffix: 'Search' },
  { pattern: /\btabs?\b|\btab-panel\b/i, landmark: 'tabpanel', nameSuffix: 'Tabs' },
  { pattern: /\baccordion\b/i, landmark: 'accordion', nameSuffix: 'Accordion' },
  { pattern: /\bproduct[-_]?list\b/i, landmark: 'list', nameSuffix: 'ProductList' },
  { pattern: /\bpromo\b|\boffer\b/i, landmark: 'promo', nameSuffix: 'Promo' },
];

function matchHeuristic(el: Element): HeuristicPattern | null {
  const combined = [el.attribs?.id ?? '', el.attribs?.class ?? '', el.attribs?.['aria-label'] ?? '']
    .join(' ')
    .toLowerCase();

  return HEURISTIC_PATTERNS.find((h) => h.pattern.test(combined)) ?? null;
}

// ─── deduplication ───────────────────────────────────────────────────────────

/** Remove segments whose root element is an ancestor of another segment's root. */
function deduplicateNested(segments: Segment[], $: cheerio.CheerioAPI): Segment[] {
  return segments.filter(
    (seg, i) =>
      !segments.some((other, j) => {
        if (i === j) return false;
        return $(other.rootSelector).first().find(seg.rootSelector).length > 0;
      }),
  );
}

function ensureUniqueName(name: string, used: Set<string>): string {
  let candidate = name;
  let counter = 2;
  while (used.has(candidate)) {
    candidate = `${name}${counter}`;
    counter += 1;
  }
  used.add(candidate);
  return candidate;
}

// ─── public class ────────────────────────────────────────────────────────────

/**
 * Analyses a sanitized HTML snapshot and returns a list of logical UI
 * fragments the page is composed of. Uses semantic HTML landmarks first
 * (header/nav/main/footer/form) and falls back to class/id heuristics for
 * pages built entirely with divs.
 *
 * Results are deduplicated so nested matches don't produce redundant
 * fragments, and each segment gets a unique PascalCase name.
 */
export class FragmentSegmenter {
  segment(html: string): Segment[] {
    if (!html?.trim()) return [];
    const $ = cheerio.load(html);
    const raw: Segment[] = [];
    const usedNames = new Set<string>();

    // Pass 1: semantic landmarks
    for (const rule of LANDMARK_RULES) {
      $(rule.selector).each((_, el) => {
        const $el = $(el) as unknown as cheerio.Cheerio<Element>;
        const baseName = rule.name($el);
        const name = ensureUniqueName(baseName, usedNames);
        raw.push({ name, landmark: rule.landmark, rootSelector: deriveRootSelector($el) });
      });
    }

    // Pass 2: heuristic patterns on generic container elements
    $('div, section, article').each((_, el) => {
      const match = matchHeuristic(el as Element);
      if (!match) return;
      const $el = $(el) as unknown as cheerio.Cheerio<Element>;
      const name = ensureUniqueName(match.nameSuffix, usedNames);
      raw.push({ name, landmark: match.landmark, rootSelector: deriveRootSelector($el) });
    });

    if (raw.length === 0) return [];

    return deduplicateNested(raw, $);
  }
}
