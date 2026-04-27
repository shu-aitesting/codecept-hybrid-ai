import { BaseFragment } from '../base/BaseFragment';

class NavbarFragment extends BaseFragment {
  constructor() {
    super('nav[role="navigation"]');
  }

  async waitToLoad(): Promise<void> {
    this.I.waitForElement(this.root, 10);
  }

  async navigateTo(linkText: string): Promise<void> {
    this.within(() => this.I.click(linkText));
  }

  async isLinkActive(linkText: string): Promise<boolean> {
    const count = await this.I.grabNumberOfVisibleElements(
      `${this.root} a.active:has-text("${linkText}")`,
    );
    return count > 0;
  }
}

export = NavbarFragment;
