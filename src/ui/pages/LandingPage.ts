import LandingFragment = require('../fragments/features/LandingFragment');

import { BasePage } from './base/BasePage';

export class LandingPage extends BasePage {
  path = '';
  landing = new LandingFragment();

  async waitForLoad(): Promise<void> {
    await this.landing.waitToLoad();
  }

  async createGiftList(): Promise<void> {
    this.I.click(this.landing.selectors.heroCreateListButton);
  }

  async findGiftList(): Promise<void> {
    this.I.click(this.landing.selectors.heroFindListButton);
  }
}
