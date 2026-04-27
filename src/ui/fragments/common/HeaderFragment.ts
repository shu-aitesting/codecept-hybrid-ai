import { BaseFragment } from '../base/BaseFragment';

class HeaderFragment extends BaseFragment {
  constructor() {
    super('header[role="banner"]');
  }

  selectors = {
    logo: '[data-testid="logo"]',
    userMenu: '[data-testid="user-menu"]',
    logoutBtn: '[data-testid="logout"]',
    notificationBell: '[data-testid="notifications"]',
  };

  async waitToLoad(): Promise<void> {
    this.I.waitForElement(this.root, 10);
  }

  async clickUserMenu(): Promise<void> {
    this.within(() => this.I.click(this.selectors.userMenu));
  }

  async logout(): Promise<void> {
    await this.clickUserMenu();
    this.I.click(this.selectors.logoutBtn);
  }

  async clickLogo(): Promise<void> {
    this.within(() => this.I.click(this.selectors.logo));
  }
}

export = HeaderFragment;
