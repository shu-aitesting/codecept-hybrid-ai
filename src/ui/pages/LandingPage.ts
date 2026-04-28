import LandingFooterFragment = require('../fragments/features/LandingFooterFragment');
import LandingHeaderFragment = require('../fragments/features/LandingHeaderFragment');
import LandingYourUltimateFragment = require('../fragments/features/LandingYourUltimateFragment');

import { BasePage } from './base/BasePage';

export class LandingPage extends BasePage {
  path = '/';
  header = new LandingHeaderFragment();
  main = new LandingYourUltimateFragment();
  footer = new LandingFooterFragment();

  async waitForLoad(): Promise<void> {
    await this.main.waitToLoad();
  }
}
