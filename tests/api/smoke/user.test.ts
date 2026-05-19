import { RestClient } from '@api/rest/RestClient';
import {
  UserService,
  GET_USER_BY_NAME_RESPONSE_SCHEMA,
  LOGIN_USER_RESPONSE_SCHEMA,
  CreateUserRequest,
  CreateUsersWithArrayInputRequest,
  CreateUsersWithListInputRequest,
  UpdateUserRequest,
} from '@api/services/UserService';

import { DataContext } from '@ai/data/DataContext';

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

Scenario('[USER-001] POST /user — positive', async () => {
  const res = await svc.createUser({
    id: 85699717,
    username: 'nostrud sed',
    lastName: 'Excepteur laboris',
    password: 'deserunt Excepteur ullamco culpa laboris',
    userStatus: 4983105,
  } as CreateUserRequest);
  res.expectStatus(200);
})
  .tag('@USER-001')
  .tag('@positive')
  .tag('@contract')
  .tag('@smoke');

Scenario('[USER-013] POST /user/createWithArray — positive', async () => {
  const res = await svc.createUsersWithArrayInput([
    {
      ea_26f: 80926074.22731817,
      ex_8: -80742177,
      Excepteur_4a0: true,
      lastName: 'quis occaecat',
      password: 'proident consequat enim aliquip ullamco',
      phone: 'officia',
    },
    {
      tempor378: -39881613,
      irure5e: 75377075,
      in5: true,
      mollit0b: true,
      sit_c: 34054415.25392234,
      ad59: false,
      est_4f9: 46710604.94147241,
      do_dd_: 'eu Excepteur ipsum',
      irure7c9: false,
      eiusmod__8: -99485997,
      voluptate_951: 36689317,
      dolor_2: -37601938,
      password: 'ad',
    },
    {
      id: -68326192,
      username: 'culpa mollit est',
      firstName: 'aliqua fugiat ad',
      lastName: 'ad veniam laborum',
      email: 'eu',
      phone: 'reprehenderit enim sunt Lorem',
    },
    {
      non6: 'adipisicing ad dolore veniam',
      etc4: 60688667,
      id: 51193245,
      firstName: 'in laboris commodo',
      lastName: 'dolor ea incididunt dolore proident',
      email: 'esse pariatur Ut mollit ipsum',
      password: 'aliquip commodo dolore',
      userStatus: 45071361,
    },
    {
      aute74c: 'aliquip sunt',
      fugiate: true,
      Duisc8: 'proident ea eiusmod Ut',
      dolor_edf: false,
      quis_5d6: 'in ut',
      et77a: -97499656.86351061,
      proident_8d: 'occaecat reprehenderit Lorem in',
      cillum8: 70236482,
      deserunt_00c: 'commodo esse',
      firstName: 'laborum',
      email: 'ut',
      password: 'tempor aliqua',
    },
  ] as CreateUsersWithArrayInputRequest);
  res.expectStatus(200);
})
  .tag('@USER-013')
  .tag('@positive')
  .tag('@contract')
  .tag('@smoke');

Scenario('[USER-014] POST /user/createWithList — positive', async () => {
  const res = await svc.createUsersWithListInput([
    {
      dolor01: 14957181.96965754,
      esse_d8: true,
      lastName: 'fugiat irure',
      email: 'dolor velit',
      password: 'nulla',
      phone: 'proident in consequat',
      userStatus: -42639410,
    },
    {
      firstName: 'aliquip tempor sit',
      email: 'aliquip exercitation ullamco dolore Excepteur',
      password: 'Ut',
      phone: 'dolor anim ea',
    },
    {
      voluptatec6: -82966803.75933647,
      quisf7: -9604219,
      sint_e6: 84387925.45348406,
      consequat2: true,
      nona07: -90707950,
      exercitation4e: 53896280.098706484,
      username: 'minim do elit',
      email: 'minim',
      password: 'deserunt aute anim',
      userStatus: -4425425,
    },
  ] as CreateUsersWithListInputRequest);
  res.expectStatus(200);
})
  .tag('@USER-014')
  .tag('@positive')
  .tag('@contract')
  .tag('@smoke');

Scenario('[USER-015] DELETE /user/{username} — positive', async () => {
  const res = await svc.deleteUser('1');
  res.expectStatus(200);
})
  .tag('@USER-015')
  .tag('@positive')
  .tag('@contract')
  .tag('@smoke');

Scenario('[USER-016] DELETE /user/{username} — negative-validation', async () => {
  const res = await svc.deleteUser('0');
  res.expectStatus(404);
})
  .tag('@USER-016')
  .tag('@negative-validation');

Scenario('[USER-017] GET /user/{username} — positive', async () => {
  const res = await svc.getUserByName('1');
  res
    .expectStatus(200)
    .expectContentType('application/json')
    .expectSchema(GET_USER_BY_NAME_RESPONSE_SCHEMA);
})
  .tag('@USER-017')
  .tag('@positive')
  .tag('@contract')
  .tag('@smoke')
  .tag('@schema');

Scenario('[USER-018] GET /user/{username} — negative-validation', async () => {
  const res = await svc.getUserByName('0');
  res.expectStatus(400);
})
  .tag('@USER-018')
  .tag('@negative-validation');

Scenario('[USER-019] GET /user/login — positive', async () => {
  const res = await svc.loginUser('placeholder', 'placeholder');
  res
    .expectStatus(200)
    .expectContentType('application/json')
    .expectSchema(LOGIN_USER_RESPONSE_SCHEMA);
})
  .tag('@USER-019')
  .tag('@positive')
  .tag('@contract')
  .tag('@smoke')
  .tag('@schema');

Scenario('[USER-020] GET /user/login — negative-validation', async () => {
  const res = await svc.loginUser('invalid-value', 'placeholder');
  res.expectStatus(400);
})
  .tag('@USER-020')
  .tag('@negative-validation');

Scenario('[USER-021] GET /user/logout — positive', async () => {
  const res = await svc.logoutUser();
  res.expectStatus(200);
})
  .tag('@USER-021')
  .tag('@positive')
  .tag('@contract')
  .tag('@smoke');

Scenario('[USER-022] PUT /user/{username} — positive', async () => {
  const res = await svc.updateUser('1', {
    mollit9: false,
    id: 74794982,
    username: 'voluptate ea id',
    firstName: 'do fugiat irure',
    lastName: 'amet',
    email: 'non',
    password: 'officia deserunt',
    phone: 'eiusmod cupidatat aliqua qui aute',
    userStatus: 77188842,
  } as UpdateUserRequest);
  res.expectStatus(200);
})
  .tag('@USER-022')
  .tag('@positive')
  .tag('@contract')
  .tag('@smoke');

Scenario('[USER-023] PUT /user/{username} — negative-validation', async () => {
  const payload = {
    dolore5: -25222305,
    dolore5e6: false,
    aliquip_2: 37759673.03663492,
    id: -33025101,
    firstName: 'adipisicing exercitation aliqua in',
    lastName: 'voluptate nulla ipsum sit velit',
    email: 'ex quis sit',
    password: 'sunt dolor',
    phone: 'officia proident',
    userStatus: 8080008,
  } as unknown as UpdateUserRequest;
  const res = await svc.updateUser('0', payload);
  res.expectStatus(400);
})
  .tag('@USER-023')
  .tag('@negative-validation');
