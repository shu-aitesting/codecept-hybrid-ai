Feature('List Registration').tag('@ui').tag('@smoke');

Scenario('User can navigate to registration @smoke', async ({ listRegisterSteps, I }) => {
  await listRegisterSteps.navigateToRegistration();
  I.seeInCurrentUrl('/register');
});

Scenario('User can complete registration form @smoke', async ({ listRegisterSteps, I }) => {
  const firstName = 'John';
  const lastName = 'Doe';
  const email = 'john.doe@example.com';
  const password = 'securePassword123';

  await listRegisterSteps.completeRegistration(firstName, lastName, email, password);
  I.seeInCurrentUrl('/register'); // Assuming success redirect
});

Scenario('Terms link is visible', async ({ listRegisterSteps }) => {
  await listRegisterSteps.navigateToRegistration();
  await listRegisterSteps.verifyTermsLink();
});
