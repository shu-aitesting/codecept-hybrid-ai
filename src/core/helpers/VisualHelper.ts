import { Helper } from 'codeceptjs';

import { VisualComparator, VisualResult, CompareOptions } from '@visual/VisualComparator';

/**
 * Thin type shim for the parts of the Playwright helper we access at runtime.
 * CodeceptJS does not export a typed interface for its built-in helpers, so we
 * declare only the surface we need.
 */
interface PlaywrightHelperShim {
  page: {
    screenshot(options?: { fullPage?: boolean; clip?: { x: number; y: number; width: number; height: number } }): Promise<Buffer>;
  };
}

class VisualHelper extends Helper {
  private comparator = new VisualComparator();

  /**
   * Takes a full-page screenshot and compares it against the stored baseline.
   * On the very first run the screenshot is saved as the baseline and the step
   * passes so CI does not require a separate "capture baseline" phase.
   *
   * @param name   Unique slug for this checkpoint, e.g. `'homepage-hero'`.
   * @param options.threshold  Fraction of different pixels allowed (default 0.01).
   * @param options.fullPage   Capture the full scrollable page (default false).
   * @param options.strictDimensions  Throw when viewport size changes (default false).
   */
  async checkVisualMatch(
    name: string,
    options: CompareOptions & { fullPage?: boolean } = {},
  ): Promise<VisualResult> {
    const { fullPage = false, ...compareOpts } = options;

    const pw = this.helpers['Playwright'] as PlaywrightHelperShim | undefined;
    if (!pw?.page) {
      throw new Error('VisualHelper requires the Playwright helper to be configured in codecept.conf.ts');
    }

    const buffer = await pw.page.screenshot({ fullPage });
    const result = this.comparator.compare(name, buffer, compareOpts);

    if (result.baselineCreated) {
      this.debug(`[VisualHelper] Baseline created for "${name}" — first run always passes.`);
      return result;
    }

    if (!result.match) {
      throw new Error(
        `Visual mismatch for "${name}": ` +
          `${result.diffPixels} pixels differ ` +
          `(${(result.diffRatio * 100).toFixed(2)}% of ${result.width}×${result.height}).` +
          (result.diffImagePath ? `\n  Diff:   ${result.diffImagePath}` : '') +
          (result.actualImagePath ? `\n  Actual: ${result.actualImagePath}` : '') +
          `\n  Run 'npm run visual:update -- ${name}' to accept as new baseline.`,
      );
    }

    return result;
  }

  /**
   * Programmatically promote the last actual screenshot to baseline.
   * Use in a dedicated "update" scenario rather than in regular test runs.
   */
  updateBaseline(name: string): void {
    this.comparator.updateBaseline(name);
    this.debug(`[VisualHelper] Baseline updated for "${name}".`);
  }
}

export = VisualHelper;
