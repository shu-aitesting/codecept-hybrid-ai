import { RestClient } from '@api/rest/RestClient';
import { tablewareService } from '@api/services/tablewareService';

Feature('tableware API').tag('@api').tag('@regression');

let client: RestClient;
let svc: tablewareService;

Before(async () => {
  client = new RestClient();
  await client.init();
  svc = new tablewareService(client);
});

After(async () => {
  await client.dispose();
});

Scenario('Retrieves tableware successfully @smoke', async () => {
  const res = await svc.getTableware();
  res.expectStatus(200);
});

Scenario('Returns 404 for non-existent category @negative', async () => {
  const res = await svc.getBySlug('non-existent-category');
  res.expectStatus(404);
});

Scenario('Returns 404 for empty slug @negative', async () => {
  const res = await svc.getBySlug('');
  res.expectStatus(404);
});
