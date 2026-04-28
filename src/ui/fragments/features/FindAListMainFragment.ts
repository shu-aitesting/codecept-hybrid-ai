import { BaseFragment } from '../base/BaseFragment';

class FindAListMainFragment extends BaseFragment {
  constructor() {
    super('main');
  }

  selectors = {
    firstNameInput: '#firstName',
    lastNameInput: '#lastName',
    weddingYearDropdown: '[placeholder="Wedding year"]',
    weddingMonthDropdown: '[placeholder="Wedding month"]',
    searchButton: '[type="submit"]',
    faqAccordion: '.accordion_wrapper',
    faqQuestions: '.accordion_sectionTitle',
  };

  async waitToLoad(): Promise<void> {
    await this.I.waitForElement(this.selectors.searchButton, 5);
  }

  async fillSearchForm(firstName: string, lastName: string): Promise<void> {
    this.I.fillField(this.selectors.firstNameInput, firstName);
    this.I.fillField(this.selectors.lastNameInput, lastName);
  }

  async selectWeddingYear(year: string): Promise<void> {
    this.I.click(this.selectors.weddingYearDropdown);
    this.I.fillField(this.selectors.weddingYearDropdown, year);
  }

  async submitSearch(): Promise<void> {
    this.I.click(this.selectors.searchButton);
  }
}

export = FindAListMainFragment;
