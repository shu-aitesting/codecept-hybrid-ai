export abstract class BaseFragment {
  constructor(protected readonly root: string) {}

  protected get I(): CodeceptJS.I {
    return inject().I;
  }

  abstract waitToLoad(): Promise<void>;

  protected within(fn: () => void): void {
    within(this.root, fn);
  }
}
