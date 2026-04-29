import { LandingPage } from '../pages/LandingPage';

class LandingSteps {
  private readonly page = new LandingPage();

  protected get I(): CodeceptJS.I {
    return inject().I;
  }

  async navigateToHome(): Promise<void> {
    await this.page.open();
  }

  async openMainMenu(): Promise<void> {
    await this.page.header.openMenu();
  }

  async verifyHeroSectionVisible(): Promise<void> {
    await this.page.main.verifyHeroVisible();
  }

  async createGiftList(): Promise<void> {
    await this.page.main.createGiftList();
  }
}

export = new LandingSteps();
