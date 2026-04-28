import { ListRegisterPage } from '../pages/ListRegisterPage';

class ListRegisterSteps {
  private readonly page = new ListRegisterPage();

  protected get I(): CodeceptJS.I {
    return inject().I;
  }

  async navigateToRegistration(): Promise<void> {
    await this.page.open();
  }

  async completeRegistration(
    firstName: string,
    lastName: string,
    email: string,
    password: string,
  ): Promise<void> {
    await this.page.open();
    await this.page.main.fillRegistrationForm(firstName, lastName, email, password);
    await this.page.main.agreeToTerms();
    await this.page.main.submitForm();
  }

  async verifyTermsLink(): Promise<void> {
    await this.page.open();
    this.I.seeElement(this.page.main.selectors.termsLink);
  }
}

export = new ListRegisterSteps();
