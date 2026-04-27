import { BaseFragment } from '../base/BaseFragment';

export class FormFragment extends BaseFragment {
  constructor(rootSelector: string) {
    super(rootSelector);
  }

  async waitToLoad(): Promise<void> {
    this.I.waitForElement(this.root, 10);
  }

  async fillField(selector: string, value: string): Promise<void> {
    this.within(() => this.I.fillField(selector, value));
  }

  async selectOption(selector: string, value: string): Promise<void> {
    this.within(() => this.I.selectOption(selector, value));
  }

  async checkOption(selector: string): Promise<void> {
    this.within(() => this.I.checkOption(selector));
  }

  async submit(submitSelector = 'button[type="submit"]'): Promise<void> {
    this.within(() => this.I.click(submitSelector));
  }

  async getValidationError(fieldSelector: string): Promise<string> {
    return this.I.grabTextFrom(`${this.root} ${fieldSelector} ~ .error, ${this.root} ${fieldSelector} + .error`);
  }

  async hasValidationError(): Promise<boolean> {
    const count = await this.I.grabNumberOfVisibleElements(`${this.root} .error, ${this.root} [aria-invalid="true"]`);
    return count > 0;
  }
}
