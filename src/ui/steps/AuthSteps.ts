import { config } from '@core/config/ConfigLoader';

import { DashboardPage } from '../pages/DashboardPage';
import { LoginPage } from '../pages/LoginPage';

// Credentials are resolved once at load time so every test in the suite
// gets the same values — mutating config mid-run cannot affect them.
const ROLE_CREDENTIALS = {
  admin: { email: config.adminEmail ?? '', password: config.adminPassword ?? '' },
} as const;

type Role = keyof typeof ROLE_CREDENTIALS;

function assertCredentials(role: Role): { email: string; password: string } {
  const creds = ROLE_CREDENTIALS[role];
  if (!creds.email || !creds.password) {
    throw new Error(
      `[AuthSteps] Missing credentials for role "${role}". ` +
        `Set ADMIN_EMAIL and ADMIN_PASSWORD in your .env.${config.env} file.`,
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
