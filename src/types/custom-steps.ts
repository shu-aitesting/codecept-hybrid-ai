// Custom I.* step signatures — single source of truth for steps.d.ts.
// Assertion methods are now provided by @codeceptjs/expect-helper, no need to declare here.
//
// HOW TO ADD CUSTOM STEPS:
//   1. Add the signature to the appropriate section below
//   2. Add the implementation in steps_file.ts
//   3. steps.d.ts never needs to change

// Placeholder — add custom step types here as the framework grows.
// Example:
//   type NavigationSteps = { navigateTo(page: string): void };
//   export type CustomSteps = NavigationSteps;

export type CustomSteps = Record<never, never>;
