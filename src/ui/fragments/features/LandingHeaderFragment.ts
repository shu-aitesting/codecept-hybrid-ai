import { BaseFragment } from '../base/BaseFragment';

class LandingHeaderFragment extends BaseFragment {
  constructor() {
    super('header');
  }

  selectors = {
    menuButton: '[aria-label="Menu"]',
    searchButtonLeft: '[aria-label="Search"]',
    searchButtonRight: '[aria-label="Search"]',
    logoLink: '[aria-label="Logo"]',
    createListButton: '[href="/register"]',
    findACoupleButton: '[href="/find-a-list"]',
    howItWorksLink: '[href="/how-it-works"]',
    brandsLink: '[href="/brands"]',
    productsLink: '[href="/products"]',
    inspirationLink: '[href="/inspiration/top-stories"]',
    collectionsLink: '[href="/collections"]',
    aboutUsLink: '[href="/about-us"]',
    showroomLink: '[href="/showrooms"]',
  };

  async waitToLoad(): Promise<void> {
    await this.I.waitForElement(this.selectors.logoLink, 5);
  }

  async openMenu(): Promise<void> {
    await this.I.click(this.selectors.menuButton);
  }

  async search(): Promise<void> {
    await this.I.click(this.selectors.searchButtonLeft);
  }
}

export = LandingHeaderFragment;
