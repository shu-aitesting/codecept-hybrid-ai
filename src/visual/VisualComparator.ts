import * as fs from 'fs';
import * as path from 'path';

import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';

export interface VisualResult {
  match: boolean;
  diffPixels: number;
  diffRatio: number;
  width: number;
  height: number;
  diffImagePath?: string;
  actualImagePath?: string;
  baselineCreated?: boolean;
}

export interface CompareOptions {
  /** Fraction of pixel difference considered "same" (0–1). Default 0.01 (1%). */
  threshold?: number;
  /** Require baseline and actual to have identical dimensions; throws if they differ. */
  strictDimensions?: boolean;
}

export class VisualComparator {
  constructor(
    private readonly baselinesDir = path.resolve('src/visual/baselines'),
    private readonly diffsDir = path.resolve('output/visual-diffs'),
  ) {
    fs.mkdirSync(this.baselinesDir, { recursive: true });
    fs.mkdirSync(this.diffsDir, { recursive: true });
  }

  /**
   * Compares `actualBuffer` against the stored baseline for `name`.
   * On first run (no baseline), the actual is saved as the new baseline and
   * the result is marked as a match so CI does not fail on initial setup.
   */
  compare(name: string, actualBuffer: Buffer, options: CompareOptions = {}): VisualResult {
    const { threshold = 0.01, strictDimensions = false } = options;
    const baselinePath = path.join(this.baselinesDir, `${name}.png`);

    if (!fs.existsSync(baselinePath)) {
      fs.writeFileSync(baselinePath, actualBuffer);
      return { match: true, diffPixels: 0, diffRatio: 0, width: 0, height: 0, baselineCreated: true };
    }

    const baseline = this.readPng(baselinePath, `baseline "${name}"`);
    const actual = this.readPng(actualBuffer, `actual screenshot "${name}"`);

    if (baseline.width !== actual.width || baseline.height !== actual.height) {
      if (strictDimensions) {
        throw new Error(
          `Visual dimension mismatch for "${name}": ` +
            `baseline ${baseline.width}×${baseline.height} vs actual ${actual.width}×${actual.height}. ` +
            `Update the baseline if the layout change is intentional.`,
        );
      }
      // Treat the entire image as different — save actual for manual review.
      const actualImagePath = this.saveActual(name, actualBuffer);
      return {
        match: false,
        diffPixels: actual.width * actual.height,
        diffRatio: 1,
        width: actual.width,
        height: actual.height,
        actualImagePath,
      };
    }

    const { width, height } = baseline;
    const diff = new PNG({ width, height });

    const diffPixels = pixelmatch(baseline.data, actual.data, diff.data, width, height, {
      threshold,
      // Highlight changed pixels in red for easy review.
      diffColor: [255, 0, 0],
      diffColorAlt: [0, 255, 0],
    });

    const total = width * height;
    const diffRatio = diffPixels / total;
    const match = diffRatio <= threshold;

    let diffImagePath: string | undefined;
    let actualImagePath: string | undefined;

    if (!match) {
      diffImagePath = path.join(this.diffsDir, `${name}-diff.png`);
      fs.writeFileSync(diffImagePath, PNG.sync.write(diff));
      // Save actual screenshot so update-baselines script can promote it.
      actualImagePath = this.saveActual(name, actualBuffer);
    }

    return { match, diffPixels, diffRatio, width, height, diffImagePath, actualImagePath };
  }

  /** Programmatically promote the last captured actual screenshot to baseline. */
  updateBaseline(name: string): void {
    const actualPath = path.join(this.diffsDir, `${name}-actual.png`);
    const baselinePath = path.join(this.baselinesDir, `${name}.png`);
    if (!fs.existsSync(actualPath)) {
      throw new Error(`No captured actual found for "${name}" at ${actualPath}. Run the test first.`);
    }
    fs.copyFileSync(actualPath, baselinePath);
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  private saveActual(name: string, buffer: Buffer): string {
    const dest = path.join(this.diffsDir, `${name}-actual.png`);
    fs.writeFileSync(dest, buffer);
    return dest;
  }

  private readPng(source: string | Buffer, label: string): PNG {
    try {
      const raw = typeof source === 'string' ? fs.readFileSync(source) : source;
      return PNG.sync.read(raw);
    } catch (err) {
      throw new Error(`Failed to decode PNG for ${label}: ${(err as Error).message}`);
    }
  }
}
