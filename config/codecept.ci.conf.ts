import { config as base } from '../codecept.conf';

// CI-specific overrides on top of the base config.
// Run with: codeceptjs run -c config/codecept.ci.conf.ts
// The HEADLESS, BROWSER, CI, and ALLURE_RESULTS_DIR env vars are set by Jenkins.
export const config: CodeceptJS.MainConfig = {
  ...base,
  helpers: {
    ...base.helpers,
    Playwright: {
      ...((base.helpers?.Playwright ?? {}) as Record<string, unknown>),
      show: false, // always headless in CI regardless of HEADLESS env var
    },
  },
  plugins: {
    ...base.plugins,
    pauseOnFail: { enabled: false }, // never pause waiting for input in CI
  },
};
