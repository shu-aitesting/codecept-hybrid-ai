import { FindAListPage } from '../pages/FindAListPage';

class FindAListSteps {
  private readonly page = new FindAListPage();

  protected get I(): CodeceptJS.I {
    return inject().I;
  }

  async navigateToListSearch(): Promise<void> {
    await this.page.open();
  }

  async searchForList(firstName: string, lastName: string): Promise<void> {
    await this.page.open();
    await this.page.main.fillSearchForm(firstName, lastName);
    await this.page.main.submitSearch();
  }

  async verifyFaqSectionVisible(): Promise<void> {
    this.I.seeElement(this.page.main.selectors.faqAccordion);
  }
}

export = new FindAListSteps();
