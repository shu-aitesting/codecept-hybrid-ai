// Shared I.* actions available across all tests.
// Keep only cross-cutting helpers here — business workflows belong in Step Objects (src/ui/steps/).
// Assertion methods are provided by @codeceptjs/expect-helper (I.expectEqual, I.expectTrue, etc.)
// Custom step types are declared in src/types/custom-steps.ts

module.exports = function () {
  return actor({});
};
