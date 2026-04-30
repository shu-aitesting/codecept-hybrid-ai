import * as fs from 'node:fs';
import * as path from 'node:path';

// ─── Embedded golden examples ─────────────────────────────────────────────────
//
// These are REAL, typechecked files from the project — copied here as string
// constants so every AI agent has a concrete, correct pattern to follow even
// when running in an environment where the source files are not on disk
// (e.g. Docker image without source mount, unit tests with temp dirs).
//
// MAINTENANCE: When you update the canonical source files, copy the new
// content here to keep the golden examples in sync.
//
// Why embed instead of always reading from disk?
// • Self-contained — works in any environment, no path assumptions.
// • Stable — agents always get the same reference even if someone edits the
//   source file mid-sprint and hasn't typechecked yet.
// • Overridable — if a disk file exists at the override path, it wins.
//   This lets advanced users swap out examples without touching this file.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Golden Fragment example — LoginFormFragment.ts
 *
 * Demonstrates:
 *  • `readonly selectors = { ... } as const` — immutable, literal-typed locator map
 *  • `this.I.*` calls WITHOUT `await` (CodeceptJS types them as void)
 *  • `await this.within(...)` to scope interactions inside the root container
 *  • `verify*()` methods to expose assertions — callers NEVER access `.selectors`
 *  • `export = ClassName` (CommonJS, required for CodeceptJS DI)
 */
const GOLDEN_FRAGMENT = `\
import { BaseFragment } from '../base/BaseFragment';

class LoginFormFragment extends BaseFragment {
  constructor() {
    super('[data-testid="login-form"]');
  }

  readonly selectors = {
    email: 'input[name="email"]',
    password: 'input[name="password"]',
    submit: 'button[type="submit"]',
    errorMsg: '.error-message',
    rememberMe: 'input[name="remember"]',
    forgotPassword: '[data-testid="forgot-password"]',
  } as const;

  async waitToLoad(): Promise<void> {
    this.I.waitForElement(this.root, 10); // no await — CodeceptJS I.* is void
  }

  async fillCredentials(email: string, password: string): Promise<void> {
    await this.within(() => {           // await this.within() — returns Promise<void>
      this.I.fillField(this.selectors.email, email);
      this.I.fillField(this.selectors.password, password);
    });
  }

  async submit(): Promise<void> {
    await this.within(() => this.I.click(this.selectors.submit));
  }

  async getError(): Promise<string> {
    return this.I.grabTextFrom(\`\${this.root} \${this.selectors.errorMsg}\`);
  }

  async checkRememberMe(): Promise<void> {
    await this.within(() => this.I.checkOption(this.selectors.rememberMe));
  }

  async clickForgotPassword(): Promise<void> {
    await this.within(() => this.I.click(this.selectors.forgotPassword));
  }

  // verify* method: Step Objects call this — NEVER access .selectors directly
  async verifyErrorVisible(): Promise<void> {
    this.I.seeElement(this.selectors.errorMsg);
  }
}

export = LoginFormFragment;
`;

/**
 * Golden Step Object example — AuthSteps.ts
 *
 * Demonstrates:
 *  • `private readonly page = new XxxPage()` — owns the page, not exposed
 *  • `protected get I()` via `inject()` — CodeceptJS DI pattern
 *  • Methods represent user journeys (loginAs, logout) — NOT automation steps
 *  • Delegates to Fragment METHODS: `loginPage.loginForm.fillCredentials()`
 *  • NEVER accesses `this.page.*.selectors` directly
 *  • `export = new AuthSteps()` — singleton exported (required for CodeceptJS inject)
 */
const GOLDEN_STEPS = `\
import { config } from '@core/config/ConfigLoader';

import { DashboardPage } from '../pages/DashboardPage';
import { LoginPage } from '../pages/LoginPage';

const ROLE_CREDENTIALS = {
  admin: { email: config.adminEmail ?? '', password: config.adminPassword ?? '' },
} as const;

type Role = keyof typeof ROLE_CREDENTIALS;

function assertCredentials(role: Role): { email: string; password: string } {
  const creds = ROLE_CREDENTIALS[role];
  if (!creds.email || !creds.password) {
    throw new Error(
      \`[AuthSteps] Missing credentials for role "\${role}". \` +
        \`Set ADMIN_EMAIL and ADMIN_PASSWORD in your .env.\${config.env} file.\`,
    );
  }
  return creds;
}

class AuthSteps {
  private readonly loginPage = new LoginPage();
  private readonly dashboardPage = new DashboardPage();

  protected get I(): CodeceptJS.I {
    return inject().I;
  }

  async loginAs(role: Role): Promise<void> {
    const creds = assertCredentials(role);
    await this.loginPage.open();
    await this.loginPage.loginForm.fillCredentials(creds.email, creds.password);
    await this.loginPage.loginForm.submit();
    await this.dashboardPage.waitForLoad();
  }

  async logout(): Promise<void> {
    await this.dashboardPage.header.logout();
  }
}

export = new AuthSteps();
`;

/**
 * Golden API Service example — FindService.ts
 *
 * Demonstrates:
 *  • `const RESOURCE_ENDPOINT = '/path'` constant for the path
 *  • Full URL: `\`\${config.apiUrl}\${RESOURCE_ENDPOINT}\`` — NEVER hardcode absolute URL
 *  • Typed request interface: `interface XxxRequest { ... }`
 *  • Service receives `RestClient` via constructor injection
 *  • Only API-relevant headers — no browser fingerprinting (sec-ch-ua, user-agent, etc.)
 *  • `client.send(req)` — RestClient handles the actual HTTP call
 */
const GOLDEN_SERVICE = `\
import { config } from '@core/config/ConfigLoader';

import { RestClient } from '@api/rest/RestClient';
import { RestRequestBuilder } from '@api/rest/RestRequestBuilder';

const GIFT_LIST_FIND_ENDPOINT = '/api/GiftList/Find';

export interface GiftListFindRequest {
  name: string;
  month: string;
}

export interface GiftListFindResponse {
  id: string;
  name: string;
  ownerName: string;
  month: string;
}

export class FindService {
  constructor(private readonly client: RestClient) {}

  async findGiftList(params: GiftListFindRequest) {
    const req = new RestRequestBuilder()
      .post(\`\${config.apiUrl}\${GIFT_LIST_FIND_ENDPOINT}\`)
      .header('Accept', 'application/json, text/plain, */*')
      .header('Accept-Language', 'en-US,en;q=0.9,vi;q=0.8,kk;q=0.7')
      .json(params)
      .build();
    return this.client.send<GiftListFindResponse>(req);
  }
}
`;

// ─── Override paths (optional) ────────────────────────────────────────────────
// Place a file at these paths to override the embedded example above.
// Useful when a project wants a different golden pattern without changing
// this file (e.g. a team that uses a different base class or API convention).
const OVERRIDE_PATHS: Record<GoldenKey, string> = {
  fragment: path.join('config', 'ai', 'examples', 'LoginFormFragment.golden.ts'),
  steps: path.join('config', 'ai', 'examples', 'AuthSteps.golden.ts'),
  service: path.join('config', 'ai', 'examples', 'FindService.golden.ts'),
};

const EMBEDDED: Record<GoldenKey, string> = {
  fragment: GOLDEN_FRAGMENT,
  steps: GOLDEN_STEPS,
  service: GOLDEN_SERVICE,
};

export type GoldenKey = 'fragment' | 'steps' | 'service';

/**
 * Loads golden example code for injection into LLM prompt contexts.
 *
 * Priority: disk override (config/ai/examples/*.golden.ts) > embedded constant.
 *
 * Usage in an agent's contextBuilder:
 * ```ts
 * const loader = new GoldenExampleLoader();
 * return { ..., goldenFragmentTs: loader.load('fragment') };
 * ```
 *
 * In the prompt template (Mustache):
 * ```
 * {{#goldenFragmentTs}}
 * ## Golden reference — follow this pattern exactly:
 * ```typescript
 * {{{goldenFragmentTs}}}
 * ```
 * {{/goldenFragmentTs}}
 * ```
 */
export class GoldenExampleLoader {
  private readonly root: string;

  constructor(root = process.cwd()) {
    this.root = root;
  }

  load(key: GoldenKey): string {
    const overridePath = path.join(this.root, OVERRIDE_PATHS[key]);
    if (fs.existsSync(overridePath)) {
      return fs.readFileSync(overridePath, 'utf8');
    }
    return EMBEDDED[key];
  }
}
