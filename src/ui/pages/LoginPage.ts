import LoginFormFragment = require('../fragments/features/LoginFormFragment');

import { BasePage } from './base/BasePage';

export class LoginPage extends BasePage {
  path = '/login';
  loginForm = new LoginFormFragment();

  async waitForLoad(): Promise<void> {
    await this.loginForm.waitToLoad();
  }
}
