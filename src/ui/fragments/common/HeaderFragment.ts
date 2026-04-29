import { BaseFragment } from '../base/BaseFragment';

class HeaderFragment extends BaseFragment {
  constructor() {
    super('header[role="banner"]');
  }

  readonly selectors = {
    logo: '[data-testid="logo"]',
    userMenu: '[data-testid="user-menu"]',
    logoutBtn: '[data-testid="logout"]',
    notificationBell: '[data-testid="notifications"]',
  } as const;

  async waitToLoad(): Promise<void> {
    this.I.waitForElement(this.root, 10);
  }

  async clickUserMenu(): Promise<void> {
    await this.within(() => this.I.click(this.selectors.userMenu));
  }

  async logout(): Promise<void> {
    await this.clickUserMenu();
    await this.within(() => this.I.click(this.selectors.logoutBtn));
  }

  async clickLogo(): Promise<void> {
    await this.within(() => this.I.click(this.selectors.logo));
  }
}

export = HeaderFragment;
