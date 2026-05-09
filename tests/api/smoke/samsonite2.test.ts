import { RestClient } from '@api/rest/RestClient';
import { Samsonite2Service } from '@api/services/Samsonite2Service';

Feature('Samsonite2 API').tag('@api').tag('@regression');

let client: RestClient;
let svc: Samsonite2Service;

Before(async () => {
  client = new RestClient();
  await client.init();
  svc = new Samsonite2Service(client);
});

After(async () => {
  await client.dispose();
});

Scenario('Find gift list returns 200', async () => {
  const res = await svc.findGiftList({ name: 'John', month: '0' });
  res.expectStatus(200);
}).tag('@smoke');

Scenario('Find gift list with empty name returns 400', async () => {
  const res = await svc.findGiftList({ name: '', month: '0' });
  res.expectStatus(400);
}).tag('@negative');

Scenario('Find gift list with invalid month returns 400', async () => {
  const res = await svc.findGiftList({ name: 'John', month: 'invalid' });
  res.expectStatus(400);
}).tag('@negative');
