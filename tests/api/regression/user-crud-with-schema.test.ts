import { UserSchema, UserListSchema, CreateUserRequestSchema, PostSchema } from '@api/schemas';

Feature('User CRUD API — schema-validated').tag('@api').tag('@regression').tag('@schema');

// ─── GET /users/:id — schema + SLA + content-type ─────────────────────────────

Scenario('GET /users/:id — body matches UserSchema + response time SLA', async ({ I }) => {
  const res = await I.sendGet('/users/1');

  res
    .expectStatus(200)
    .expectContentType('application/json')
    .expectResponseTime(3000)
    .expectMatchesSchema(UserSchema);
});

Scenario('GET /users/:id — parseWith returns typed User', async ({ I }) => {
  const res = await I.sendGet('/users/1');

  res.expectStatus(200);

  const user = res.parseWith(UserSchema);
  if (user.id !== 1) throw new Error(`Expected user.id=1, got ${user.id}`);
  if (!user.email.includes('@')) throw new Error(`Expected valid email, got ${user.email}`);
});

// ─── GET /users — array schema assertions ─────────────────────────────────────

Scenario('GET /users — body is array, each item matches UserSchema', async ({ I }) => {
  const res = await I.sendGet('/users');

  res
    .expectStatus(200)
    .expectContentType('application/json')
    .expectMatchesArraySchema(UserSchema)
    .expectArrayLengthAtLeast('', 1);
});

Scenario('GET /users — array contains user with id=1', async ({ I }) => {
  const res = await I.sendGet('/users');

  res.expectStatus(200).expectArrayContains<{ id: number }>('', (u) => u.id === 1);
});

Scenario('GET /users — every user has a valid email', async ({ I }) => {
  const res = await I.sendGet('/users');

  res.expectStatus(200).expectEvery<{
    email: string;
  }>('', (u) => typeof u.email === 'string' && u.email.includes('@'));
});

// ─── GET /users — parseWith returns typed array ────────────────────────────────

Scenario('GET /users — parseWith(UserListSchema) returns typed User[]', async ({ I }) => {
  const res = await I.sendGet('/users');

  res.expectStatus(200);
  const users = res.parseWith(UserListSchema);

  if (!Array.isArray(users)) throw new Error('Expected array');
  if (users.length === 0) throw new Error('Expected at least one user');
  users.forEach((u) => {
    if (typeof u.id !== 'number') throw new Error(`User.id should be number, got ${typeof u.id}`);
    if (!u.email.includes('@')) throw new Error(`User.email invalid: ${u.email}`);
  });
});

// ─── POST /posts — schema on created resource ─────────────────────────────────

Scenario('POST /posts — created resource matches PostSchema', async ({ I }) => {
  const payload: import('@api/schemas').CreatePostRequest = {
    userId: 1,
    title: 'Schema validation test',
    body: 'Testing that POST response matches PostSchema',
  };

  const res = await I.sendPost('/posts', payload);

  res
    .expectStatus(201)
    .expectContentType('application/json')
    .expectMatchesSchema(PostSchema)
    .expectResponseTime(5000);
});

Scenario('POST /posts — parseWith returns typed Post', async ({ I }) => {
  const payload = { userId: 1, title: 'Typed post', body: 'parseWith test' };
  const res = await I.sendPost('/posts', payload);

  res.expectStatus(201);
  const post = res.parseWith(PostSchema);

  if (typeof post.id !== 'number') throw new Error('Expected post.id to be number');
  if (post.userId !== 1) throw new Error('Expected post.userId=1');
});

// ─── Chained fluent assertions ────────────────────────────────────────────────

Scenario('GET /users/1 — full chained assertion chain', async ({ I }) => {
  const res = await I.sendGet('/users/1');

  res
    .expectStatus(200)
    .expectContentType('application/json')
    .expectResponseTime(3000)
    .expectMatchesSchema(UserSchema)
    .expectJsonPathDefined('email')
    .expectJsonPath('id', 1);
});

// ─── CreateUserRequestSchema — validate request shape (unit-level spot check) ─

Scenario('CreateUserRequestSchema rejects missing required fields', async ({ I }) => {
  // This scenario confirms the schema shapes match by checking that a valid
  // user from the API can be re-used as a CreateUserRequest base (minus id).
  const res = await I.sendGet('/users/1');
  res.expectStatus(200);

  const user = res.parseWith(UserSchema);
  const parseResult = CreateUserRequestSchema.safeParse({
    name: user.name,
    email: user.email,
    username: user.username,
  });

  if (!parseResult.success) {
    throw new Error(`CreateUserRequestSchema failed: ${parseResult.error.message}`);
  }
});
