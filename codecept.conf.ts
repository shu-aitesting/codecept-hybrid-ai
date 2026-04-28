import { setHeadlessWhen, setCommonPlugins } from '@codeceptjs/configure';

import { SelfHealEngine, type PageLike } from './src/ai/heal/SelfHealEngine';
import { TaskAwareRouter } from './src/ai/providers/TaskAwareRouter';
import { config as appConfig } from './src/core/config/ConfigLoader';
import { globalSetup } from './src/hooks/globalSetup';
import { globalTeardown } from './src/hooks/globalTeardown';

/**
 * The heal engine and router are constructed lazily — building them at
 * import time would force every test (including ones that never need AI) to
 * pull SQLite + Anthropic SDK into memory. The lazy getters also let us run
 * Codecept without AI deps installed (CI for unrelated changes).
 */
let healEngineInstance: SelfHealEngine | null = null;
const getHealEngine = (): SelfHealEngine => {
  if (!healEngineInstance) healEngineInstance = new SelfHealEngine();
  return healEngineInstance;
};

setHeadlessWhen(appConfig.headless);
setCommonPlugins();

const isCI = process.env.CI === 'true';

export const config: CodeceptJS.MainConfig = {
  name: 'codecept-hybrid',
  tests: './tests/{api,ui,visual}/**/*.test.ts',
  output: './output',
  helpers: {
    Playwright: {
      url: appConfig.baseUrl,
      show: !appConfig.headless,
      browser: appConfig.browser,
      // Capture trace and video for every test; artifacts for passed tests are
      // discarded to save disk space — only failures keep them for debugging.
      trace: true,
      video: true,
      keepVideoForPassedTests: false,
      keepTraceForPassedTests: false,
      windowSize: '1280x720',
    },
    REST: {
      endpoint: appConfig.apiUrl,
      timeout: 30000,
      defaultHeaders: { 'Content-Type': 'application/json' },
    },
    RestHelper: {
      require: './src/core/helpers/RestHelper.ts',
    },
    VisualHelper: {
      require: './src/core/helpers/VisualHelper.ts',
    },
    ExpectHelper: {
      require: '@codeceptjs/expect-helper',
    },
    FileSystem: {},
  },
  include: {
    I: './steps_file.ts',
    // --- Fragments (reusable UI components) ---
    headerFragment: './src/ui/fragments/common/HeaderFragment.ts',
    modalFragment: './src/ui/fragments/common/ModalFragment.ts',
    navbarFragment: './src/ui/fragments/common/NavbarFragment.ts',
    loginForm: './src/ui/fragments/features/LoginFormFragment.ts',
    // --- Pages (compose fragments, own one screen's path) ---
    loginPage: './src/ui/pages/LoginPage.ts',
    dashboardPage: './src/ui/pages/DashboardPage.ts',
    // --- Step Objects (business-level workflows) ---
    authSteps: './src/ui/steps/AuthSteps.ts',
    landingSteps: './src/ui/steps/LandingSteps.ts',
    registerSteps: './src/ui/steps/RegisterSteps.ts',
    listRegisterSteps: './src/ui/steps/ListRegisterSteps.ts',
    findAListSteps: './src/ui/steps/FindAListSteps.ts',
    // --- Landing page (registered for direct use in integration tests) ---
    landingPage: './src/ui/pages/LandingPage.ts',
  },
  bootstrap: globalSetup,
  teardown: globalTeardown,
  mocha: {
    reporterOptions: { reportDir: './output/reports/html' },
  },
  plugins: {
    retryFailedStep: { enabled: true, retries: 2 },
    screenshotOnFail: { enabled: true },
    // pauseOnFail halts the runner on failure so devs can inspect the browser.
    // Only active when there is an interactive terminal (TTY) — never in CI or
    // piped/scripted runs where there is no one to press Enter to resume.
    pauseOnFail: { enabled: !isCI && !!process.stdout.isTTY },
    heal: {
      enabled: appConfig.ai.healEnabled,
      healLimit: 2,
      healSteps: ['click', 'fillField', 'waitForElement', 'see', 'dontSee'],
      // Override CodeceptJS' default LLM call with our 4-phase engine — gives
      // us cache lookup, DOM sanitize, and DOM verification around the model.
      fnResolveHealing: async (failure: {
        test?: { file?: string };
        step?: { name?: string; toCode?: () => string };
        error?: { message?: string };
        helper?: { page?: PageLike };
        page?: PageLike;
      }) => {
        const page = failure.helper?.page ?? failure.page;
        if (!page) return null;
        const out = await getHealEngine().heal({
          testFile: failure.test?.file ?? 'unknown',
          step: failure.step?.toCode?.() ?? failure.step?.name ?? '',
          locator: extractLocator(failure.step),
          error: failure.error?.message ?? '',
          page,
        });
        return out.healedSelector;
      },
    },
    ai: {
      // CodeceptJS' generic AI plugin uses TaskAwareRouter under the hood so
      // every AI feature shares the same circuit breaker + budget guard.
      request: async (msgs: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>) =>
        new TaskAwareRouter('heal').chat(msgs),
    },
    allure: {
      enabled: true,
      require: '@codeceptjs/allure-legacy',
      outputDir: appConfig.allureResultsDir,
    },
  },
  require: ['ts-node/register', 'tsconfig-paths/register'],
};

/** Best-effort recovery of the failing selector from a CodeceptJS step. */
function extractLocator(step?: { args?: unknown[]; toCode?: () => string }): string {
  if (!step) return '';
  const args = step.args ?? [];
  const first = args.find((a) => typeof a === 'string' || typeof a === 'object');
  if (typeof first === 'string') return first;
  if (first && typeof first === 'object') return JSON.stringify(first);
  return step.toCode?.() ?? '';
}
