Feature('Landing Page').tag('@ui').tag('@smoke');

Scenario('User can navigate to home page @smoke', async ({ landingSteps, I }) => {
  await landingSteps.navigateToHome();
  I.seeInCurrentUrl('/');
});

Scenario('Hero section is visible @smoke', async ({ landingSteps }) => {
  await landingSteps.navigateToHome();
  await landingSteps.verifyHeroSectionVisible();
});

Scenario('User can create a gift list', async ({ landingSteps, I }) => {
  await landingSteps.navigateToHome();
  await landingSteps.createGiftList();
  I.seeInCurrentUrl('/register');
});
