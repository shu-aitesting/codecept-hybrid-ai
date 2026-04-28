import { BaseFragment } from '../base/BaseFragment';

class ListRegisterCongratulationsFragment extends BaseFragment {
  constructor() {
    super('main');
  }

  selectors = {
    firstNameInput: '#firstName',
    lastNameInput: '#lastName',
    emailInput: '#email',
    passwordInput: '[name="password"]',
    hasReferralCodeCheckbox: '#hasReferralCode',
    agreeToTermsCheckbox: '#agreeToTerms',
    termsLink: 'a.register_termsLink',
    submitButton: '[type="submit"]',
  };

  async waitToLoad(): Promise<void> {
    this.I.waitForElement(this.selectors.submitButton, 10);
  }

  async fillRegistrationForm(
    firstName: string,
    lastName: string,
    email: string,
    password: string,
  ): Promise<void> {
    this.I.fillField(this.selectors.firstNameInput, firstName);
    this.I.fillField(this.selectors.lastNameInput, lastName);
    this.I.fillField(this.selectors.emailInput, email);
    this.I.fillField(this.selectors.passwordInput, password);
  }

  async checkReferralCode(): Promise<void> {
    this.I.checkOption(this.selectors.hasReferralCodeCheckbox);
  }

  async agreeToTerms(): Promise<void> {
    this.I.checkOption(this.selectors.agreeToTermsCheckbox);
  }

  async submitForm(): Promise<void> {
    this.I.click(this.selectors.submitButton);
  }

  async openTerms(): Promise<void> {
    this.I.click(this.selectors.termsLink);
  }
}

export = ListRegisterCongratulationsFragment;
