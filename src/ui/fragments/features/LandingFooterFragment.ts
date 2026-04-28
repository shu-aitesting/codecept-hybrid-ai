import { BaseFragment } from '../base/BaseFragment';

class LandingFooterFragment extends BaseFragment {
  constructor() {
    super('footer');
  }

  selectors = {
    footerLinks: 'a',
  };

  async waitToLoad(): Promise<void> {
    await this.I.waitForElement(this.root, 5);
  }
}

export = LandingFooterFragment;
