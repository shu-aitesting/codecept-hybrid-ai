import ListRegisterCongratulationsFragment = require('../fragments/features/ListRegisterCongratulationsFragment');
import ListRegisterNavigationFragment = require('../fragments/features/ListRegisterNavigationFragment');

import { BasePage } from './base/BasePage';

export class ListRegisterPage extends BasePage {
  path = '/register';
  navigation = new ListRegisterNavigationFragment();
  main = new ListRegisterCongratulationsFragment();

  async waitForLoad(): Promise<void> {
    await this.main.waitToLoad();
  }
}
