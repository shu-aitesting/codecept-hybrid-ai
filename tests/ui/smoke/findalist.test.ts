Feature('Find A List').tag('@ui').tag('@smoke');

Scenario('User can access list search @smoke', async ({ findAListSteps, I }) => {
  await findAListSteps.navigateToListSearch();
  I.seeInCurrentUrl('/find-a-list');
});

Scenario('User can submit search form', async ({ findAListSteps, I }) => {
  const firstName = 'John';
  const lastName = 'Doe';
  await findAListSteps.searchForList(firstName, lastName);
  I.seeInCurrentUrl('/search-results'); // Assuming redirect URL
});

Scenario('FAQ section is visible on page', async ({ findAListSteps }) => {
  await findAListSteps.navigateToListSearch();
  await findAListSteps.verifyFaqSectionVisible();
});
