Feature('Visual Regression').tag('@visual');

/**
 * Uses https://example.com as a stable, publicly-accessible target so the
 * test can run without a local app server.
 *
 * Run sequence:
 *   1st run  → baseline created, test passes (baselineCreated: true)
 *   2nd run  → actual compared to baseline, passes if layout unchanged
 *   After intentional UI change → test fails, diff saved to output/visual-diffs/
 *   Acceptance → npm run visual:update -- homepage-full
 */

Scenario('Homepage viewport matches baseline', async ({ I }) => {
  I.amOnPage('https://example.com');
  // Let fonts/images settle before capturing.
  I.wait(1);
  await I.checkVisualMatch('homepage-viewport');
});

Scenario('Homepage full-page matches baseline', async ({ I }) => {
  I.amOnPage('https://example.com');
  I.wait(1);
  // fullPage: true scrolls and stitches the entire document height.
  await I.checkVisualMatch('homepage-full', { fullPage: true });
});

Scenario('Homepage with strict-dimension guard', async ({ I }) => {
  I.amOnPage('https://example.com');
  I.wait(1);
  // strictDimensions: true causes the test to throw if viewport size changes,
  // e.g. when a browser update alters the default scrollbar width.
  await I.checkVisualMatch('homepage-strict', { threshold: 0.005, strictDimensions: true });
});
