Feature('API Smoke').tag('@api').tag('@smoke');

Scenario('GET /todos/1 returns valid todo', async ({ I }) => {
  const res = await I.sendGet('/todos/1');

  res.expectStatus(200).expectJsonPath('id', 1).expectJsonPath('completed', false);
});

Scenario('GET /users returns non-empty array', async ({ I }) => {
  const res = await I.sendGet('/users');

  res.expectStatus(200);
  const users = res.json<unknown[]>();
  if (!Array.isArray(users) || users.length === 0) {
    throw new Error('Expected non-empty users array');
  }
});

Scenario('POST /posts creates a post', async ({ I }) => {
  const res = await I.sendPost('/posts', {
    title: 'Test Post',
    body: 'Hello from codecept-hybrid',
    userId: 1,
  });

  res.expectStatus(201).expectJsonPath('title', 'Test Post');
});
