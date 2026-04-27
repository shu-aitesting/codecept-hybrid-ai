import { z } from 'zod';

import { loadEnv } from './EnvResolver';

loadEnv();

const ConfigSchema = z.object({
  env: z.enum(['dev', 'staging', 'prod']).default('dev'),
  baseUrl: z.string().url(),
  apiUrl: z.string().url(),
  browser: z.enum(['chromium', 'firefox', 'webkit']).default('chromium'),
  headless: z.boolean().default(false),
  adminEmail: z.string().email().optional(),
  adminPassword: z.string().optional(),
  ai: z.object({
    anthropicKey: z.string().optional(),
    cohereKey: z.string().optional(),
    hfToken: z.string().optional(),
    healEnabled: z.boolean().default(false),
  }),
  allureResultsDir: z.string().default('./output/reports/allure'),
  logLevel: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
});

export type Config = z.infer<typeof ConfigSchema>;

export const config: Config = Object.freeze(
  ConfigSchema.parse({
    env: process.env.ENV,
    baseUrl: process.env.BASE_URL,
    apiUrl: process.env.API_URL,
    browser: process.env.BROWSER,
    headless: process.env.HEADLESS === 'true',
    adminEmail: process.env.ADMIN_EMAIL || undefined,
    adminPassword: process.env.ADMIN_PASSWORD || undefined,
    ai: {
      anthropicKey: process.env.ANTHROPIC_API_KEY || undefined,
      cohereKey: process.env.COHERE_API_KEY || undefined,
      hfToken: process.env.HF_TOKEN || undefined,
      healEnabled: process.env.AI_HEAL_ENABLED === 'true',
    },
    allureResultsDir: process.env.ALLURE_RESULTS_DIR,
    logLevel: process.env.LOG_LEVEL,
  }),
);
