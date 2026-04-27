/**
 * Promotes captured actual screenshots to baselines.
 *
 * Usage:
 *   npm run visual:update           # update all checkpoints that have an actual
 *   npm run visual:update -- homepage-hero  # update a single checkpoint by name
 *
 * Workflow:
 *   1. Run visual tests → failures drop *-actual.png files in output/visual-diffs/
 *   2. Review the diffs in output/visual-diffs/*-diff.png
 *   3. Run this script to accept intentional changes
 */
import * as fs from 'fs';
import * as path from 'path';

const BASELINES_DIR = path.resolve('src/visual/baselines');
const DIFFS_DIR = path.resolve('output/visual-diffs');

function updateAll(): void {
  if (!fs.existsSync(DIFFS_DIR)) {
    console.log('No output/visual-diffs directory found — nothing to update.');
    process.exit(0);
  }

  const actuals = fs.readdirSync(DIFFS_DIR).filter((f) => f.endsWith('-actual.png'));

  if (actuals.length === 0) {
    console.log('No *-actual.png files in output/visual-diffs — all baselines are up to date.');
    process.exit(0);
  }

  let updated = 0;
  for (const file of actuals) {
    const name = file.replace(/-actual\.png$/, '');
    promote(name, file);
    updated++;
  }
  console.log(`\n✓ ${updated} baseline(s) updated.`);
}

function updateOne(name: string): void {
  const actualFile = `${name}-actual.png`;
  const actualPath = path.join(DIFFS_DIR, actualFile);
  if (!fs.existsSync(actualPath)) {
    console.error(`✗ No actual screenshot found for "${name}" at ${actualPath}.`);
    console.error(`  Run the visual test for "${name}" first, then re-run this script.`);
    process.exit(1);
  }
  promote(name, actualFile);
  console.log(`\n✓ 1 baseline updated.`);
}

function promote(name: string, actualFile: string): void {
  const src = path.join(DIFFS_DIR, actualFile);
  const dest = path.join(BASELINES_DIR, `${name}.png`);
  fs.mkdirSync(BASELINES_DIR, { recursive: true });
  fs.copyFileSync(src, dest);
  console.log(`  [${name}]  ${src} → ${dest}`);
}

// ─── Entry point ─────────────────────────────────────────────────────────────

const target = process.argv[2];
if (target) {
  updateOne(target);
} else {
  updateAll();
}
