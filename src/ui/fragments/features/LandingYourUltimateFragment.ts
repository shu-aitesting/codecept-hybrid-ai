import { BaseFragment } from '../base/BaseFragment';

class LandingYourUltimateFragment extends BaseFragment {
  constructor() {
    super('main');
  }

  selectors = {
    heroTitle: 'h1',
    createListButton: '[href="/register"]',
    findListButton: '[href="/find-a-list"]',
    whyChooseTitle: '.benefit-section_title h2',
    brandCarousel: '.brands-section_carouselsWrapper',
  };

  async waitToLoad(): Promise<void> {
    await this.I.waitForElement(this.selectors.heroTitle, 5);
  }

  async createGiftList(): Promise<void> {
    await this.I.click(this.selectors.createListButton);
  }
}

export = LandingYourUltimateFragment;
