import * as fs from 'fs';
import * as path from 'path';

import * as dotenv from 'dotenv';

const REQUIRED_VARS = ['BASE_URL', 'API_URL'] as const;

/**
 * Loads environment variables from .env.{ENV} (then .env as fallback).
 * Throws immediately if required variables are missing so misconfiguration
 * surfaces before any test starts, not mid-run.
 */
export function loadEnv(): void {
  const env = process.env.ENV || 'dev';
  const candidates = [`.env.${env}`, '.env'];

  for (const file of candidates) {
    const fullPath = path.resolve(process.cwd(), file);
    if (fs.existsSync(fullPath)) {
      dotenv.config({ path: fullPath, override: false });
      console.log(`[EnvResolver] Loaded "${file}" (ENV=${env})`);
    }
  }

  const missing = REQUIRED_VARS.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(
      `[EnvResolver] Missing required variables: ${missing.join(', ')}.\n` +
        `Copy .env.example to .env.${env} and fill in the values.`,
    );
  }

  console.log(
    `[EnvResolver] Ready — BASE_URL=${process.env.BASE_URL}  API_URL=${process.env.API_URL}`,
  );
}
