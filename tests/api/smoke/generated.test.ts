import { RestClient } from '@api/rest/RestClient';
import { BrandResponseSchema } from '@api/schemas/generated.schema';
import { GeneratedService } from '@api/services/GeneratedService';

Feature('Generated API').tag('@api').tag('@regression');

let client: RestClient;
let svc: GeneratedService;

Before(async () => {
  client = new RestClient();
  await client.init();
  svc = new GeneratedService(client);
});

After(async () => {
  await client.dispose();
});

Scenario('Retrieves brand by SEO name successfully', async () => {
  const res = await svc.getBrandBySeoName('kitchenaid');
  res.expectStatus(200).expectMatchesSchema(BrandResponseSchema).expectResponseTime(2000);
}).tag('@smoke');

Scenario('Returns 404 for non-existent SEO name', async () => {
  const res = await svc.getBrandBySeoName('nonexistentbrand');
  res.expectStatus(404);
}).tag('@negative');

Scenario('Handles invalid SEO name format', async () => {
  const res = await svc.getBrandBySeoName('invalid!seo@name');
  res.expectStatus(400);
}).tag('@negative');
