import { RestClient } from '@api/rest/RestClient';

import { DataContext } from '@ai/data/DataContext';

import {
  UserService,
  GET_USERS_RESPONSE_SCHEMA,
  CREATE_USER_RESPONSE_SCHEMA,
  GET_USER_BY_ID_RESPONSE_SCHEMA,
  UPDATE_USER_RESPONSE_SCHEMA,
  CreateUserRequest,
  UpdateUserRequest,
} from '../../services/UserService';

Feature('User API').tag('@api').tag('@regression');

let client: RestClient;
let svc: UserService;
let dataCtx: DataContext;

Before(async () => {
  client = new RestClient();
  await client.init();
  svc = new UserService(client);
  dataCtx = new DataContext();
});

After(async () => {
  dataCtx.clear();
  await client.dispose();
});

// --- GET /users ---
Scenario('List users successfully', async () => {
  const res = await svc.getUsers();
  res
    .expectStatus(200)
    .expectContentType('application/json')
    .expectSchema(GET_USERS_RESPONSE_SCHEMA);
})
  .tag('@positive')
  .tag('@smoke')
  .tag('@contract')
  .tag('@schema');

Scenario('GET /users - page param out of range returns 400', async () => {
  const res = await svc.getUsers({ page: 0 });
  res.expectStatus(400);
}).tag('@negative-validation');

Scenario('GET /users - missing auth token returns 401', async () => {
  const client2 = new RestClient();
  await client2.init({ skipAmbient: ['token'] });
  const svc2 = new UserService(client2);
  const res = await svc2.getUsers();
  res.expectStatus(401);
  await client2.dispose();
}).tag('@negative-auth-missing');

Scenario('GET /users - invalid auth token returns 401', async () => {
  const client2 = new RestClient();
  await client2.init({
    headerOverrides: { token: 'Token' },
    extraHTTPHeaders: { Token: 'invalid-token-for-test' },
  });
  const svc2 = new UserService(client2);
  const res = await svc2.getUsers();
  res.expectStatus(401);
  await client2.dispose();
}).tag('@negative-auth-invalid');

// --- POST /users ---
Scenario('Create user successfully', async () => {
  const res = await svc.createUser({ name: 'Jane Doe', email: 'jane@example.com', role: 'user' });
  res
    .expectStatus(201)
    .expectContentType('application/json')
    .expectSchema(CREATE_USER_RESPONSE_SCHEMA);
})
  .tag('@positive')
  .tag('@smoke')
  .tag('@contract')
  .tag('@schema');

Scenario('POST /users - missing required field name returns 400', async () => {
  const res = await svc.createUser({
    email: 'jane@example.com',
    role: 'user',
  } as CreateUserRequest);
  res.expectStatus(400);
}).tag('@negative-validation');

Scenario('POST /users - missing auth token returns 401', async () => {
  const client2 = new RestClient();
  await client2.init({ skipAmbient: ['token'] });
  const svc2 = new UserService(client2);
  const res = await svc2.createUser({ name: 'Jane Doe', email: 'jane@example.com', role: 'user' });
  res.expectStatus(401);
  await client2.dispose();
}).tag('@negative-auth-missing');

Scenario('POST /users - invalid auth token returns 401', async () => {
  const client2 = new RestClient();
  await client2.init({
    headerOverrides: { token: 'Token' },
    extraHTTPHeaders: { Token: 'invalid-token-for-test' },
  });
  const svc2 = new UserService(client2);
  const res = await svc2.createUser({ name: 'Jane Doe', email: 'jane@example.com', role: 'user' });
  res.expectStatus(401);
  await client2.dispose();
}).tag('@negative-auth-invalid');

Scenario('POST /users - missing Lng header returns 400', async () => {
  const client2 = new RestClient();
  await client2.init({ skipAmbient: ['language'] });
  const svc2 = new UserService(client2);
  const res = await svc2.createUser({ name: 'Jane Doe', email: 'jane@example.com', role: 'user' });
  res.expectStatus(400);
  await client2.dispose();
}).tag('@negative-headers');

// --- GET /users/{id} ---
Scenario('Get user by ID successfully', async () => {
  const res = await svc.getUserById(1);
  res
    .expectStatus(200)
    .expectContentType('application/json')
    .expectSchema(GET_USER_BY_ID_RESPONSE_SCHEMA);
})
  .tag('@positive')
  .tag('@smoke')
  .tag('@contract')
  .tag('@schema');

Scenario('GET /users/{id} - invalid id returns 400', async () => {
  const res = await svc.getUserById(0);
  res.expectStatus(400);
}).tag('@negative-validation');

Scenario('GET /users/{id} - missing auth token returns 401', async () => {
  const client2 = new RestClient();
  await client2.init({ skipAmbient: ['token'] });
  const svc2 = new UserService(client2);
  const res = await svc2.getUserById(1);
  res.expectStatus(401);
  await client2.dispose();
}).tag('@negative-auth-missing');

Scenario('GET /users/{id} - invalid auth token returns 401', async () => {
  const client2 = new RestClient();
  await client2.init({
    headerOverrides: { token: 'Token' },
    extraHTTPHeaders: { Token: 'invalid-token-for-test' },
  });
  const svc2 = new UserService(client2);
  const res = await svc2.getUserById(1);
  res.expectStatus(401);
  await client2.dispose();
}).tag('@negative-auth-invalid');

// --- PUT /users/{id} ---
Scenario('Update user successfully', async () => {
  const res = await svc.updateUser(1, { name: 'John Doe' });
  res
    .expectStatus(200)
    .expectContentType('application/json')
    .expectSchema(UPDATE_USER_RESPONSE_SCHEMA);
})
  .tag('@positive')
  .tag('@smoke')
  .tag('@contract')
  .tag('@schema');

Scenario('PUT /users/{id} - missing required field name returns 400', async () => {
  const res = await svc.updateUser(1, {} as UpdateUserRequest);
  res.expectStatus(400);
}).tag('@negative-validation');

Scenario('PUT /users/{id} - missing auth token returns 401', async () => {
  const client2 = new RestClient();
  await client2.init({ skipAmbient: ['token'] });
  const svc2 = new UserService(client2);
  const res = await svc2.updateUser(1, { name: 'John Doe' });
  res.expectStatus(401);
  await client2.dispose();
}).tag('@negative-auth-missing');

Scenario('PUT /users/{id} - invalid auth token returns 401', async () => {
  const client2 = new RestClient();
  await client2.init({
    headerOverrides: { token: 'Token' },
    extraHTTPHeaders: { Token: 'invalid-token-for-test' },
  });
  const svc2 = new UserService(client2);
  const res = await svc2.updateUser(1, { name: 'John Doe' });
  res.expectStatus(401);
  await client2.dispose();
}).tag('@negative-auth-invalid');

// --- DELETE /users/{id} ---
Scenario('Delete user successfully', async () => {
  const res = await svc.deleteUser(1);
  res.expectStatus(204);
})
  .tag('@positive')
  .tag('@smoke')
  .tag('@contract');

Scenario('DELETE /users/{id} - non-existent id returns 404', async () => {
  const res = await svc.deleteUser(0);
  res.expectStatus(404);
}).tag('@negative-validation');

Scenario('DELETE /users/{id} - missing auth token returns 401', async () => {
  const client2 = new RestClient();
  await client2.init({ skipAmbient: ['token'] });
  const svc2 = new UserService(client2);
  const res = await svc2.deleteUser(1);
  res.expectStatus(401);
  await client2.dispose();
}).tag('@negative-auth-missing');

Scenario('DELETE /users/{id} - invalid auth token returns 401', async () => {
  const client2 = new RestClient();
  await client2.init({
    headerOverrides: { token: 'Token' },
    extraHTTPHeaders: { Token: 'invalid-token-for-test' },
  });
  const svc2 = new UserService(client2);
  const res = await svc2.deleteUser(1);
  res.expectStatus(401);
  await client2.dispose();
}).tag('@negative-auth-invalid');
