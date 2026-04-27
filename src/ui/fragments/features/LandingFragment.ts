import { BaseFragment } from '../base/BaseFragment';

class LandingFragment extends BaseFragment {
  constructor() {
    super('body');
  }

  selectors = {
    menuButton: '[aria-label="Menu"]',
    searchButton: '[aria-label="Search"]',
    createListHeader: 'a.cta_root__CXED3.cta_headerFont__FihAJ',
    findACoupleHeader: 'a.cta_root__CXED3.buttons_findAListLink__DGbWR',
    howItWorksLink: 'a.cta_root__CXED3.buttons_menuButton__fD1aX:has-text("How it works")',
    brandsLink: 'a.cta_root__CXED3.buttons_menuButton__fD1aX:has-text("Brands")',
    productsLink: 'a.cta_root__CXED3.buttons_menuButton__fD1aX:has-text("Products")',
    inspirationLink: 'a.cta_root__CXED3.buttons_menuButton__fD1aX:has-text("Inspiration")',
    collectionsLink: 'a.cta_root__CXED3.buttons_menuButton__fD1aX:has-text("Collections")',
    aboutUsLink: 'a.cta_root__CXED3.buttons_menuButton__fD1aX:has-text("About us")',
    showroomLink: 'a.cta_root__CXED3.buttons_menuButton__fD1aX:has-text("Our showroom")',
    heroCreateListButton: '.overlay-banner_buttonContainer__F3MDd a:has-text("Create a list")',
    heroFindListButton: '.overlay-banner_buttonContainer__F3MDd a:has-text("Find a list")',
    carouselPrevButton: '[aria-label="Previous slide"]',
    carouselNextButton: '[aria-label="Next slide"]',
    videoMuteButton: '[aria-label="Unmute video"]',
  };

  async waitToLoad(): Promise<void> {
    this.I.waitForElement(this.selectors.menuButton, 10);
  }

  async openMenu(): Promise<void> {
    this.I.click(this.selectors.menuButton);
  }

  async clickCarouselNext(): Promise<void> {
    this.I.click(this.selectors.carouselNextButton);
  }

  async clickCarouselPrev(): Promise<void> {
    this.I.click(this.selectors.carouselPrevButton);
  }

  async toggleVideoMute(): Promise<void> {
    this.I.click(this.selectors.videoMuteButton);
  }
}

export = LandingFragment;
