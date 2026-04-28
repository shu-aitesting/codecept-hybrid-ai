import { RestClient } from '@api/rest/RestClient';
import { FundsService } from '@api/services/fundsService';

Feature('Funds API').tag('@api').tag('@regression');

let client: RestClient;
let svc: FundsService;

Before(async () => {
  client = new RestClient();
  await client.init();
  svc = new FundsService(client);
});

After(async () => {
  await client.dispose();
});

Scenario('Retrieves funds successfully @smoke', async () => {
  const res = await svc.getBySeoName();
  res.expectStatus(200);
});

Scenario('Returns 404 for invalid seoName @negative', async () => {
  const res = await svc.getBySeoName('invalid-name');
  res.expectStatus(404);
});

Scenario('Returns 400 for empty seoName @negative', async () => {
  const res = await svc.getBySeoName('');
  res.expectStatus(400);
});
