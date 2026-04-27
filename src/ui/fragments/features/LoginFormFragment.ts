import { BaseFragment } from '../base/BaseFragment';

class LoginFormFragment extends BaseFragment {
  constructor() {
    super('[data-testid="login-form"]');
  }

  selectors = {
    email: 'input[name="email"]',
    password: 'input[name="password"]',
    submit: 'button[type="submit"]',
    errorMsg: '.error-message',
    rememberMe: 'input[name="remember"]',
    forgotPassword: '[data-testid="forgot-password"]',
  };

  async waitToLoad(): Promise<void> {
    this.I.waitForElement(this.root, 10);
  }

  async fillCredentials(email: string, password: string): Promise<void> {
    this.within(() => {
      this.I.fillField(this.selectors.email, email);
      this.I.fillField(this.selectors.password, password);
    });
  }

  async submit(): Promise<void> {
    this.within(() => this.I.click(this.selectors.submit));
  }

  async getError(): Promise<string> {
    return this.I.grabTextFrom(`${this.root} ${this.selectors.errorMsg}`);
  }

  async checkRememberMe(): Promise<void> {
    this.within(() => this.I.checkOption(this.selectors.rememberMe));
  }

  async clickForgotPassword(): Promise<void> {
    this.within(() => this.I.click(this.selectors.forgotPassword));
  }
}

export = LoginFormFragment;
