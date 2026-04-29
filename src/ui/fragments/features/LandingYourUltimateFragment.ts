import { BaseFragment } from '../base/BaseFragment';

class LandingYourUltimateFragment extends BaseFragment {
  constructor() {
    super('main');
  }

  readonly selectors = {
    heroTitle: 'h1',
    createListButton: '[href="/register"]',
    findListButton: '[href="/find-a-list"]',
    whyChooseTitle: '.benefit-section_title h2',
    brandCarousel: '.brands-section_carouselsWrapper',
  } as const;

  async waitToLoad(): Promise<void> {
    this.I.waitForElement(this.selectors.heroTitle, 5);
  }

  async createGiftList(): Promise<void> {
    this.I.click(this.selectors.createListButton);
  }

  async verifyHeroVisible(): Promise<void> {
    this.I.seeElement(this.selectors.heroTitle);
  }
}

export = LandingYourUltimateFragment;
