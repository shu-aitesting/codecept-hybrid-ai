import HeaderFragment = require('../fragments/common/HeaderFragment');

import { BasePage } from './base/BasePage';

export class DashboardPage extends BasePage {
  path = '/dashboard';
  header = new HeaderFragment();
  selectors = { welcomeBanner: '[data-testid="welcome"]' };

  async waitForLoad(): Promise<void> {
    this.I.waitForElement(this.selectors.welcomeBanner, 10);
  }

  async getWelcomeText(): Promise<string> {
    return this.I.grabTextFrom(this.selectors.welcomeBanner);
  }
}
