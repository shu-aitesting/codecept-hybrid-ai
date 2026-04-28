import { BaseFragment } from '../base/BaseFragment';

class FindAListFooterFragment extends BaseFragment {
  constructor() {
    super('footer');
  }

  selectors = {
    aboutLinks: '.navigation-row_content a',
    socialLinks: '.social-and-actions-row_socialIcon a',
    showroomButton: '[type="button"]',
    brochureButton: '[type="button"]',
    termsLink: '[href="/terms-and-conditions"]',
    privacyLink: '[href="/privacy-policy"]',
    copyrightText: '.company-details_companyName',
  };

  async waitToLoad(): Promise<void> {
    await this.I.waitForElement(this.selectors.copyrightText, 5);
  }
}

export = FindAListFooterFragment;
