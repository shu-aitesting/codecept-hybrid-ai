import { describe, expect, it } from 'vitest';

import { DomSanitizer } from '../../../../src/ai/utils/DomSanitizer';

const sanitizer = new DomSanitizer();

describe('DomSanitizer.sanitize', () => {
  it('strips script, style, svg, iframe, link, meta', () => {
    const html = `
      <html><head><meta charset="utf-8"><link rel="stylesheet" href="x"></head>
      <body>
        <style>.a{color:red}</style>
        <script>alert(1)</script>
        <svg><circle/></svg>
        <iframe src="x"></iframe>
        <button data-testid="ok">Hi</button>
      </body></html>`;
    const result = sanitizer.sanitize(html);
    expect(result).not.toContain('<script');
    expect(result).not.toContain('<style');
    expect(result).not.toContain('<svg');
    expect(result).not.toContain('<iframe');
    expect(result).not.toContain('<meta');
    expect(result).toContain('data-testid="ok"');
  });

  it('drops noise attrs and keeps allowlisted attrs', () => {
    const html =
      '<button id="b" data-testid="x" data-gtm-event="click" onclick="bad()" style="color:red" aria-label="go">Go</button>';
    const result = sanitizer.sanitize(html);
    expect(result).toContain('id="b"');
    expect(result).toContain('data-testid="x"');
    expect(result).toContain('aria-label="go"');
    expect(result).not.toContain('data-gtm');
    expect(result).not.toContain('onclick');
    expect(result).not.toContain('style=');
  });

  it('trims long Tailwind class chains to first 4 classes', () => {
    const html =
      '<button class="px-4 py-2 ml-3 mr-2 mt-1 bg-blue-500 hover:bg-blue-600 text-white">x</button>';
    const result = sanitizer.sanitize(html);
    expect(result).toContain('class="px-4 py-2 ml-3 mr-2"');
    expect(result).not.toContain('hover:bg-blue-600');
  });

  it('truncates base64 src values', () => {
    const long = 'A'.repeat(500);
    const html = `<img src="data:image/png;base64,${long}">`;
    const result = sanitizer.sanitize(html);
    expect(result).toContain('data:image/png;base64,...');
    expect(result.length).toBeLessThan(html.length / 2);
  });

  it('truncates long text nodes', () => {
    const html = `<div>${'lorem ipsum '.repeat(40)}</div>`;
    const result = sanitizer.sanitize(html, { maxTextLength: 80 });
    expect(result).toMatch(/…/);
  });

  it('removes HTML comments', () => {
    const html = '<div><!-- secret --><span>visible</span></div>';
    const result = sanitizer.sanitize(html);
    expect(result).not.toContain('secret');
    expect(result).toContain('visible');
  });

  it('returns empty string for empty input', () => {
    expect(sanitizer.sanitize('')).toBe('');
  });

  it('reduces a 30KB+ React-style page below 8KB', () => {
    const styleNoise = '<style>.a{color:red}</style>'.repeat(50);
    const scriptNoise = '<script>window.__x=' + 'x'.repeat(500) + '</script>'.repeat(20);
    const tailwind =
      '<div class="px-4 py-2 ml-3 mr-2 mt-1 bg-blue-500 hover:bg-blue-600 text-white">' +
      'a'.repeat(2000) +
      '</div>';
    const big = '<html><body>' + styleNoise + scriptNoise + tailwind.repeat(20) + '</body></html>';
    expect(big.length).toBeGreaterThan(30_000);
    const result = sanitizer.sanitize(big, { maxTextLength: 100 });
    expect(result.length).toBeLessThan(8000);
  });

  it('estimateTokens returns ~length/4', () => {
    expect(sanitizer.estimateTokens('a'.repeat(40))).toBe(10);
    expect(sanitizer.estimateTokens('')).toBe(0);
  });
});

describe('DomSanitizer.sanitizeAround', () => {
  it('focuses on element matching target selector', () => {
    const html = `
      <html><body>
        <header><h1>Title</h1></header>
        <main>
          <div id="form-area">
            <button data-testid="login">Login</button>
          </div>
        </main>
        <footer>copyright</footer>
      </body></html>`;
    const result = sanitizer.sanitizeAround(html, '[data-testid="login"]', { ancestorLevels: 2 });
    expect(result).toContain('data-testid="login"');
    expect(result).not.toContain('Title');
    expect(result).not.toContain('copyright');
  });

  it('falls back to whole-document sanitize when target not found', () => {
    const html = '<div><span>only</span></div>';
    const result = sanitizer.sanitizeAround(html, '[data-testid="missing"]');
    expect(result).toContain('only');
  });

  it('handles invalid selector gracefully', () => {
    const html = '<div>x</div>';
    const result = sanitizer.sanitizeAround(html, '[!! invalid');
    expect(result).toContain('x');
  });
});
