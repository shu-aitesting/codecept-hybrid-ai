// Shared I.* actions available across all tests.
// Keep only cross-cutting helpers here — business workflows belong in Step Objects (src/ui/steps/).
module.exports = function () {
  return actor({
    /**
     * Strict equality assertion. Throws with a readable diff on mismatch.
     * Prefer over raw `throw new Error(...)` in test bodies.
     */
    assertEqual<T>(actual: T, expected: T, message?: string): void {
      if (actual !== expected) {
        throw new Error(
          message ??
            `assertEqual failed:\n  expected: ${JSON.stringify(expected)}\n  actual:   ${JSON.stringify(actual)}`,
        );
      }
    },

    /**
     * Truthy assertion. Useful for array/object checks in API tests.
     */
    assertTrue(condition: unknown, message?: string): void {
      if (!condition) {
        throw new Error(message ?? `assertTrue failed: received ${JSON.stringify(condition)}`);
      }
    },

    /**
     * Falsy assertion.
     */
    assertFalse(condition: unknown, message?: string): void {
      if (condition) {
        throw new Error(message ?? `assertFalse failed: received ${JSON.stringify(condition)}`);
      }
    },

    /**
     * Regex match assertion.
     * @example I.assertMatches('user-123', /^user-\d+$/)
     */
    assertMatches(value: string, pattern: RegExp, message?: string): void {
      if (!pattern.test(value)) {
        throw new Error(message ?? `assertMatches failed: "${value}" did not match ${pattern}`);
      }
    },

    /**
     * Deep equality assertion for objects/arrays via JSON serialization.
     * For strict reference equality use assertEqual.
     */
    assertDeepEqual<T>(actual: T, expected: T, message?: string): void {
      const a = JSON.stringify(actual);
      const e = JSON.stringify(expected);
      if (a !== e) {
        throw new Error(
          message ?? `assertDeepEqual failed:\n  expected: ${e}\n  actual:   ${a}`,
        );
      }
    },
  });
};
