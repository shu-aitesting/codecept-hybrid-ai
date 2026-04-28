import * as cheerio from 'cheerio';
import { AnyNode } from 'domhandler';

interface SanitizeOpts {
  keepText?: boolean;
  maxTextLength?: number;
  /** Override the default attribute allowlist. */
  keepAttrs?: string[];
  /** Drop classes beyond this count to tame Tailwind chains. */
  maxClassCount?: number;
  /**
   * Strip CSS-Modules hash suffixes from class names (e.g. `cta_root__CXED3`
   * → `cta_root`). Use when sending DOM to an LLM so the model sees semantic
   * names rather than build-time hashes. Do NOT use when scoring locators —
   * the stripped names won't match the live page.
   */
  normalizeHashedClasses?: boolean;
}

interface SanitizeAroundOpts extends SanitizeOpts {
  ancestorLevels?: number;
  siblingsRadius?: number;
}

const DEFAULT_KEEP_ATTRS = new Set([
  'id',
  'class',
  'name',
  'type',
  'role',
  'placeholder',
  'alt',
  'title',
  'value',
  'href',
  'src',
  'data-testid',
  'data-test',
  'data-cy',
  'data-qa',
  'aria-label',
  'aria-labelledby',
  'for',
]);

const NOISE_TAGS = ['script', 'style', 'noscript', 'svg', 'canvas', 'iframe', 'link', 'meta'];

const NOISE_ATTR_PREFIXES = ['on', 'data-gtm', 'data-ga', 'data-track', 'data-analytics'];
const NOISE_ATTRS = new Set(['_gl', 'fbclid']);

// ─── per-element helpers ────────────────────────────────────────────────────

function isNoiseAttr(lower: string): boolean {
  return NOISE_ATTRS.has(lower) || NOISE_ATTR_PREFIXES.some((p) => lower.startsWith(p));
}

function stripNoiseAttrs(
  $el: cheerio.Cheerio<AnyNode>,
  attribs: Record<string, string>,
  keep: Set<string>,
): void {
  for (const name of Object.keys(attribs)) {
    const lower = name.toLowerCase();
    if (!keep.has(lower) || isNoiseAttr(lower)) {
      $el.removeAttr(name);
    }
  }
}

function trimClasses(
  $el: cheerio.Cheerio<AnyNode>,
  maxClassCount: number,
  normalizeHashed: boolean,
): void {
  const cls = $el.attr('class');
  if (!cls) return;
  let classes = cls.split(/\s+/).filter(Boolean);
  if (normalizeHashed) {
    classes = classes.map((c) => c.replace(/__[A-Za-z0-9]{4,}$/, ''));
  }
  $el.attr('class', classes.slice(0, maxClassCount).join(' '));
}

function truncateBase64Src($el: cheerio.Cheerio<AnyNode>): void {
  const src = $el.attr('src');
  if (!src?.startsWith('data:')) return;
  const idx = src.indexOf(';base64,');
  if (idx !== -1) {
    $el.attr('src', `${src.slice(0, idx + 8)}...`);
  }
}

function processElement(
  $el: cheerio.Cheerio<AnyNode>,
  el: AnyNode,
  keep: Set<string>,
  maxClassCount: number,
  normalizeHashed: boolean,
): void {
  if (el.type !== 'tag') return;
  const attribs = { ...el.attribs } as Record<string, string>;
  stripNoiseAttrs($el, attribs, keep);
  trimClasses($el, maxClassCount, normalizeHashed);
  truncateBase64Src($el);
}

// ─── DomSanitizer ───────────────────────────────────────────────────────────

/**
 * Turns raw rendered HTML into a "signal-only skeleton" before feeding it to
 * an LLM. A 50 KB React page typically shrinks to <8 KB — cutting cost and
 * hallucination rate (the model focuses on structure instead of ad scripts
 * and class soup).
 */
export class DomSanitizer {
  sanitize(rawHtml: string, opts: SanitizeOpts = {}): string {
    if (!rawHtml) return '';
    const $ = cheerio.load(rawHtml, { xml: false });

    NOISE_TAGS.forEach((t) => $(t).remove());
    $('head').remove();
    this.removeComments($);

    const keep = opts.keepAttrs ? new Set(opts.keepAttrs) : DEFAULT_KEEP_ATTRS;
    const maxClassCount = opts.maxClassCount ?? 4;
    const maxTextLen = opts.maxTextLength ?? 200;
    const normalizeHashed = opts.normalizeHashedClasses ?? false;

    $('*').each((_, el) => processElement($(el), el, keep, maxClassCount, normalizeHashed));

    $('*')
      .contents()
      .each((_, node) => {
        if (node.type === 'text') {
          const text = (node.data ?? '').replaceAll(/\s+/g, ' ').trim();
          node.data = text.length > maxTextLen ? `${text.slice(0, maxTextLen)}…` : text;
        }
      });

    let html = $.html();
    if (!opts.keepText) {
      html = html
        .replaceAll(/[ \t]+/g, ' ')
        .replaceAll(/\n\s*\n/g, '\n')
        .trim();
    }
    return html;
  }

  /**
   * Focused sanitize around an element matching `targetSelector`. Falls back
   * to whole-document sanitize if the target is not found.
   */
  sanitizeAround(rawHtml: string, targetSelector: string, opts: SanitizeAroundOpts = {}): string {
    if (!rawHtml) return '';
    const ancestors = opts.ancestorLevels ?? 3;
    const siblings = opts.siblingsRadius ?? 2;
    const $ = cheerio.load(rawHtml);
    let target: ReturnType<typeof $>;
    try {
      target = $(targetSelector);
    } catch {
      target = $();
    }

    if (target.length === 0) return this.sanitize(rawHtml, opts);

    let scope = target.first();
    for (let i = 0; i < ancestors && scope.parent().length; i += 1) {
      scope = scope.parent();
    }
    const node = scope[0];
    if (node?.type !== 'tag') return this.sanitize(rawHtml, opts);

    const directParent = target.first().parent();
    directParent.children().each((idx, sib) => {
      const targetIdx = directParent.children().index(target.first());
      if (Math.abs(idx - targetIdx) > siblings && !$(sib).is(target.first())) {
        $(sib).remove();
      }
    });

    return this.sanitize($.html(scope), opts);
  }

  estimateTokens(html: string): number {
    return Math.ceil((html?.length ?? 0) / 4);
  }

  private removeComments($: cheerio.CheerioAPI): void {
    const walk = (nodes: ReturnType<typeof $>) => {
      nodes.contents().each((_, node) => {
        if (node.type === 'comment') {
          $(node).remove();
        } else if (node.type === 'tag') {
          walk($(node));
        }
      });
    };
    walk($.root());
  }
}
