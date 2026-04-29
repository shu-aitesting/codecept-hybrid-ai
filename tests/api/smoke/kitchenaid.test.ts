import { RestClient } from '@api/rest/RestClient';
import { KitchenaidResponseSchema } from '@api/schemas/kitchenaid.schema';
import { KitchenaidService } from '@api/services/KitchenaidService';

Feature('Kitchenaid API').tag('@api').tag('@regression');

let client: RestClient;
let svc: KitchenaidService;

Before(async () => {
  client = new RestClient();
  await client.init();
  svc = new KitchenaidService(client);
});

After(async () => {
  await client.dispose();
});

Scenario('Retrieves Kitchenaid brand successfully', async () => {
  const res = await svc.getKitchenaid();
  res.expectStatus(200).expectMatchesSchema(KitchenaidResponseSchema).expectResponseTime(2000);
}).tag('@smoke');

Scenario('Returns 404 for non-existent brand', async () => {
  // Assuming the service method can accept a dynamic seoName
  const res = await svc.getKitchenaid('non-existent-brand');
  res.expectStatus(404);
}).tag('@negative');

Scenario('Validates response schema', async () => {
  const res = await svc.getKitchenaid();
  res.expectStatus(200).expectMatchesSchema(KitchenaidResponseSchema);
});
