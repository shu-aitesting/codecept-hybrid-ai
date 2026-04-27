import { RestRequestBuilder } from '@api/rest/RestRequestBuilder';

Feature('User CRUD API').tag('@api').tag('@regression');

interface User {
  id: number;
  name: string;
  email: string;
  username: string;
}

interface Post {
  id: number;
  userId: number;
  title: string;
  body: string;
}

Scenario('GET /users/:id returns correct user', async ({ I }) => {
  const res = await I.sendGet<User>('/users/1');

  res
    .expectStatus(200)
    .expectJsonPath('id', 1)
    .expectJsonPath('name', 'Leanne Graham')
    .expectJsonPath('email', 'Sincere@april.biz');
});

Scenario('POST /posts creates resource and returns 201', async ({ I }) => {
  const payload = { title: 'CRUD Regression', body: 'Framework test', userId: 1 };
  const res = await I.sendPost<Post>('/posts', payload);

  res
    .expectStatus(201)
    .expectJsonPath('title', 'CRUD Regression')
    .expectJsonPath('userId', 1);

  const created = res.json<Post>();
  if (!created.id) throw new Error('Expected created resource to have id');
});

Scenario('PUT /posts/:id updates resource', async ({ I }) => {
  const payload = { id: 1, title: 'Updated Title', body: 'Updated body', userId: 1 };
  const res = await I.sendPut<Post>('/posts/1', payload);

  res.expectStatus(200).expectJsonPath('title', 'Updated Title');
});

Scenario('PATCH /posts/:id partially updates resource', async ({ I }) => {
  const res = await I.sendPatch<Post>('/posts/1', { title: 'Patched Title' });

  res.expectStatus(200).expectJsonPath('title', 'Patched Title');
});

Scenario('DELETE /posts/:id returns 200', async ({ I }) => {
  const res = await I.sendDelete('/posts/1');

  res.expectStatus(200);
});

Scenario('GET non-existent resource returns 404', async ({ I }) => {
  const res = await I.sendGet('/posts/99999');

  res.expectStatus(404);
});

Scenario('Builder API: fluent RestRequestBuilder works end-to-end', async ({ I }) => {
  const builder = new RestRequestBuilder()
    .get('/todos/5')
    .header('Accept', 'application/json')
    .timeout(15000);

  const res = await I.sendApiRequest(builder);

  res.expectStatus(200).expectJsonPath('id', 5);
});
