export abstract class BasePage {
  abstract path: string;

  protected get I(): CodeceptJS.I {
    return inject().I;
  }

  async open(): Promise<void> {
    this.I.amOnPage(this.path);
    await this.waitForLoad();
  }

  abstract waitForLoad(): Promise<void>;
}
