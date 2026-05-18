import { RestClient } from '@api/rest/RestClient';

import { DataContext } from '@ai/data/DataContext';

import { PingService, GET_PING_RESPONSE_SCHEMA } from '../../services/PingService';

Feature('Ping API').tag('@api').tag('@regression');

let client: RestClient;
let svc: PingService;
let dataCtx: DataContext;

Before(async () => {
  client = new RestClient();
  await client.init();
  svc = new PingService(client);
  dataCtx = new DataContext();
});

After(async () => {
  dataCtx.clear();
  await client.dispose();
});

Scenario('Health check - no auth', async () => {
  const res = await svc.getPing();
  res
    .expectStatus(200)
    .expectContentType('application/json')
    .expectSchema(GET_PING_RESPONSE_SCHEMA);
})
  .tag('@positive')
  .tag('@smoke')
  .tag('@contract')
  .tag('@schema');
