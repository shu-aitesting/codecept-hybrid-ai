import { RestClient } from '@api/rest/RestClient';
import { FindService } from '@api/services/FindService';

Feature('GiftList Find API').tag('@api').tag('@regression');

let client: RestClient;
let svc: FindService;

Before(async () => {
  client = new RestClient();
  await client.init();
  svc = new FindService(client);
});

After(async () => {
  await client.dispose();
});

Scenario('Returns gift list for valid name and month', async () => {
  const res = await svc.findGiftList({ name: 'John', month: '0' });
  res.expectStatus(200);
}).tag('@smoke');

Scenario('Returns gift list for specific month', async () => {
  const res = await svc.findGiftList({ name: 'John', month: '5' });
  res.expectStatus(200);
}).tag('@smoke');

Scenario('Returns 400 for empty parameters', async () => {
  const res = await svc.findGiftList({ name: '', month: '' });
  res.expectStatus(400);
}).tag('@negative');
