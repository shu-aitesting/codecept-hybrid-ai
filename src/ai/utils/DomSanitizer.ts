import * as cheerio from 'cheerio';

interface SanitizeOpts {
  keepText?: boolean;
  maxTextLength?: number;
  /** Override the default attribute allowlist. */
  keepAttrs?: string[];
  /** Drop classes beyond this count to tame Tailwind chains. */
  maxClassCount?: number;
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

/**
 * Tools that turn raw rendered HTML into a "signal-only skeleton" before
 * feeding it to an LLM. A 50KB React page typically shrinks to <8KB which
 * cuts both per-call cost and hallucination rate (the model focuses on
 * structure rather than ad scripts and class soup).
 */
export class DomSanitizer {
  sanitize(rawHtml: string, opts: SanitizeOpts = {}): string {
    if (!rawHtml) return '';
    const $ = cheerio.load(rawHtml, { xml: false });

    // Strip <head>, <noise tags>, comments.
    NOISE_TAGS.forEach((t) => $(t).remove());
    $('head').remove();
    // Cheerio "*" iterator includes comments via root(); walk DOM nodes.
    this.removeComments($);

    const keep = opts.keepAttrs ? new Set(opts.keepAttrs) : DEFAULT_KEEP_ATTRS;
    const maxClassCount = opts.maxClassCount ?? 4;
    const maxTextLen = opts.maxTextLength ?? 200;

    $('*').each((_, el) => {
      if (el.type !== 'tag') return;
      const $el = $(el);
      const attribs = { ...el.attribs };
      for (const [name] of Object.entries(attribs)) {
        const lower = name.toLowerCase();
        if (
          !keep.has(lower) ||
          lower.startsWith('on') ||
          lower.startsWith('data-gtm') ||
          lower.startsWith('data-ga') ||
          lower.startsWith('data-track') ||
          lower.startsWith('data-analytics') ||
          lower === '_gl' ||
          lower === 'fbclid'
        ) {
          if (!keep.has(lower)) {
            $el.removeAttr(name);
          }
          if (lower.startsWith('on')) {
            $el.removeAttr(name);
          }
        }
      }

      const cls = $el.attr('class');
      if (cls) {
        const classes = cls.split(/\s+/).filter(Boolean);
        if (classes.length > maxClassCount) {
          $el.attr('class', classes.slice(0, maxClassCount).join(' '));
        }
      }

      const src = $el.attr('src');
      if (src && src.startsWith('data:')) {
        const idx = src.indexOf(';base64,');
        if (idx !== -1) {
          $el.attr('src', `${src.slice(0, idx + 8)}...`);
        }
      }
    });

    // Truncate long text nodes.
    $('*')
      .contents()
      .each((_, node) => {
        if (node.type === 'text') {
          const text = (node.data ?? '').replace(/\s+/g, ' ').trim();
          if (text.length > maxTextLen) {
            node.data = `${text.slice(0, maxTextLen)}…`;
          } else {
            node.data = text;
          }
        }
      });

    let html = $.html();
    if (!opts.keepText) {
      html = html.replace(/[ \t]+/g, ' ').replace(/\n\s*\n/g, '\n').trim();
    }
    return html;
  }

  /**
   * Focused sanitize around an element matching `targetSelector`. Falls back
   * to whole-document sanitize if the target is not found.
   */
  sanitizeAround(
    rawHtml: string,
    targetSelector: string,
    opts: SanitizeAroundOpts = {},
  ): string {
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

    if (target.length === 0) {
      return this.sanitize(rawHtml, opts);
    }

    let scope = target.first();
    for (let i = 0; i < ancestors && scope.parent().length; i += 1) {
      scope = scope.parent();
    }
    const node = scope[0];
    if (!node || node.type !== 'tag') {
      return this.sanitize(rawHtml, opts);
    }

    // Trim distant siblings of the target's parent chain.
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
