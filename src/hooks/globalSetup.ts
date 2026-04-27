import * as fs from 'fs';
import * as path from 'path';

import { Logger } from '../core/logger/Logger';
import './scenarioHooks';

/** Directories that must exist before any test writes artifacts to them. */
const OUTPUT_DIRS = [
  'output/logs',
  'output/reports/allure',
  'output/reports/html',
  'output/screenshots',
  'output/videos',
  'output/traces',
  'output/visual-diffs',
];

function ensureOutputDirs(): void {
  for (const dir of OUTPUT_DIRS) {
    try {
      fs.mkdirSync(path.resolve(dir), { recursive: true });
    } catch (err) {
      // Non-fatal: log and continue. The specific test that needs the dir
      // will fail with a clear I/O error if it is truly unavailable.
      Logger.warn('setup.mkdir.fail', { dir, error: (err as Error).message });
    }
  }
}

export async function globalSetup(): Promise<void> {
  ensureOutputDirs();
  Logger.info('suite.boot', {
    env: process.env.ENV ?? 'dev',
    baseUrl: process.env.BASE_URL,
    browser: process.env.BROWSER ?? 'chromium',
    headless: process.env.HEADLESS === 'true',
    nodeVersion: process.version,
  });
}
