import FindAListFooterFragment = require('../fragments/features/FindAListFooterFragment');
import FindAListHeaderFragment = require('../fragments/features/FindAListHeaderFragment');
import FindAListMainFragment = require('../fragments/features/FindAListMainFragment');

import { BasePage } from './base/BasePage';

export class FindAListPage extends BasePage {
  path = '/find-a-list';
  header = new FindAListHeaderFragment();
  main = new FindAListMainFragment();
  footer = new FindAListFooterFragment();

  async waitForLoad(): Promise<void> {
    await this.main.waitToLoad();
  }
}
