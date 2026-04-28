import { BaseFragment } from '../base/BaseFragment';

class FindAListHeaderFragment extends BaseFragment {
  constructor() {
    super('header');
  }

  selectors = {
    menuToggle: '[aria-label="Menu"]',
    searchButtonLeft: '[aria-label="Search"]',
    searchButtonRight: '[aria-label="Search"]',
    logoLink: '[aria-label="Logo"]',
    createListLink: '[href="/register"]',
    findAListLink: '[href="/find-a-list"]',
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

  async toggleMenu(): Promise<void> {
    this.I.click(this.selectors.menuToggle);
  }
}

export = FindAListHeaderFragment;
