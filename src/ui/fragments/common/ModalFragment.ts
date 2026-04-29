import { BaseFragment } from '../base/BaseFragment';

class ModalFragment extends BaseFragment {
  constructor(rootSelector = '[role="dialog"]') {
    super(rootSelector);
  }

  readonly selectors = {
    title: '.modal-title',
    confirmBtn: '[data-testid="confirm"]',
    cancelBtn: '[data-testid="cancel"]',
    closeIcon: '.modal-close',
  } as const;

  async waitToLoad(): Promise<void> {
    this.I.waitForElement(this.root, 5);
  }

  async confirm(): Promise<void> {
    await this.within(() => this.I.click(this.selectors.confirmBtn));
  }

  async cancel(): Promise<void> {
    await this.within(() => this.I.click(this.selectors.cancelBtn));
  }

  async close(): Promise<void> {
    await this.within(() => this.I.click(this.selectors.closeIcon));
  }

  async getTitle(): Promise<string> {
    return this.I.grabTextFrom(`${this.root} ${this.selectors.title}`);
  }

  async isVisible(): Promise<boolean> {
    return this.I.grabNumberOfVisibleElements(this.root).then((n) => n > 0);
  }
}

export = ModalFragment;
