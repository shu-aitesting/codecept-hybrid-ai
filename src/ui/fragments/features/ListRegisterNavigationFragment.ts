import { BaseFragment } from '../base/BaseFragment';

class ListRegisterNavigationFragment extends BaseFragment {
  constructor() {
    super('nav');
  }

  selectors = {
    logoLink: 'a.register-layout_logoContainer',
  };

  async waitToLoad(): Promise<void> {
    this.I.waitForElement(this.selectors.logoLink, 5);
  }

  async goToHome(): Promise<void> {
    this.I.click(this.selectors.logoLink);
  }
}

export = ListRegisterNavigationFragment;
