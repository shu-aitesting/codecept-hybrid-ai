import { RestClient } from '@api/rest/RestClient';
import {
  StoreService,
  GET_INVENTORY_RESPONSE_SCHEMA,
  GET_ORDER_BY_ID_RESPONSE_SCHEMA,
  PLACE_ORDER_RESPONSE_SCHEMA,
  PlaceOrderRequest,
} from '@api/services/StoreService';

import { DataContext } from '@ai/data/DataContext';

Feature('Store API').tag('@api').tag('@regression');

let client: RestClient;
let svc: StoreService;
let dataCtx: DataContext;

Before(async () => {
  client = new RestClient();
  await client.init();
  svc = new StoreService(client);
  dataCtx = new DataContext();
});

After(async () => {
  dataCtx.clear();
  await client.dispose();
});

Scenario('[STORE-001] DELETE /store/order/{orderId} — positive', async () => {
  const res = await svc.deleteOrder('1');
  res.expectStatus(200);
})
  .tag('@STORE-001')
  .tag('@positive')
  .tag('@contract')
  .tag('@smoke');

Scenario('[STORE-002] DELETE /store/order/{orderId} — negative-validation', async () => {
  const res = await svc.deleteOrder('0');
  res.expectStatus(404);
})
  .tag('@STORE-002')
  .tag('@negative-validation');

Scenario('[STORE-003] GET /store/inventory — positive', async () => {
  const res = await svc.getInventory();
  res
    .expectStatus(200)
    .expectContentType('application/json')
    .expectSchema(GET_INVENTORY_RESPONSE_SCHEMA);
})
  .tag('@STORE-003')
  .tag('@positive')
  .tag('@contract')
  .tag('@smoke')
  .tag('@schema');

Scenario('[STORE-004] GET /store/inventory — negative-auth-missing', async () => {
  const client2 = new RestClient();
  await client2.init({ skipAmbient: ['token'] });
  const svc2 = new StoreService(client2);
  const res = await svc2.getInventory();
  res.expectStatus(401);
  await client2.dispose();
})
  .tag('@STORE-004')
  .tag('@negative-auth-missing');

Scenario('[STORE-005] GET /store/inventory — negative-auth-invalid', async () => {
  const client2 = new RestClient();
  await client2.init({
    headerOverrides: { token: 'api_key' },
    extraHTTPHeaders: { api_key: 'invalid-token-for-test' },
  });
  const svc2 = new StoreService(client2);
  const res = await svc2.getInventory();
  res.expectStatus(401);
  await client2.dispose();
})
  .tag('@STORE-005')
  .tag('@negative-auth-invalid');

Scenario('[STORE-006] GET /store/order/{orderId} — positive', async () => {
  const res = await svc.getOrderById('1');
  res
    .expectStatus(200)
    .expectContentType('application/json')
    .expectSchema(GET_ORDER_BY_ID_RESPONSE_SCHEMA);
})
  .tag('@STORE-006')
  .tag('@positive')
  .tag('@contract')
  .tag('@smoke')
  .tag('@schema');

Scenario('[STORE-007] GET /store/order/{orderId} — negative-validation', async () => {
  const res = await svc.getOrderById('0');
  res.expectStatus(400);
})
  .tag('@STORE-007')
  .tag('@negative-validation');

Scenario('[STORE-008] POST /store/order — positive', async () => {
  const res = await svc.placeOrder({
    shipDate: '1902-01-22T04:25:47.0Z',
    complete: true,
  } as PlaceOrderRequest);
  res
    .expectStatus(200)
    .expectContentType('application/json')
    .expectSchema(PLACE_ORDER_RESPONSE_SCHEMA);
})
  .tag('@STORE-008')
  .tag('@positive')
  .tag('@contract')
  .tag('@smoke')
  .tag('@schema');

Scenario('[STORE-009] POST /store/order — negative-validation', async () => {
  const payload = {
    ina98: 'consequat culpa commodo nisi',
    aute_9: 25612486.619502306,
    quis_1d: false,
    laboris_de5: -19100250,
    quantity: 4161900,
    shipDate: '1943-05-16T18:57:15.0Z',
    status: '__INVALID__',
    complete: true,
  } as unknown as PlaceOrderRequest;
  const res = await svc.placeOrder(payload);
  res.expectStatus(400);
})
  .tag('@STORE-009')
  .tag('@negative-validation');
