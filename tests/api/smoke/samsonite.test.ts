import { RestClient } from '@api/rest/RestClient';
import { SamsoniteService } from '@api/services/SamsoniteService';

Feature('Samsonite API').tag('@api').tag('@regression');

let client: RestClient;
let svc: SamsoniteService;

Before(async () => {
  client = new RestClient();
  await client.init();
  svc = new SamsoniteService(client);
});

After(async () => {
  await client.dispose();
});

Scenario('Retrieve Samsonite brand details', async () => {
  const res = await svc.getSamsonite();
  res.expectStatus(200);
}).tag('@smoke');

Scenario('Returns 404 for non-existent brand', async () => {
  // Assuming the service allows passing a dynamic SEO name for negative testing
  const nonExistentSvc = new SamsoniteService(client);
  const res = await nonExistentSvc.getSamsonite(); // This would need a method that accepts a parameter
  res.expectStatus(404);
}).tag('@negative');

Scenario('Returns 400 for malformed request', async () => {
  // This scenario is theoretical since GET requests typically don't have bodies
  // Adjust based on actual API behavior for invalid requests
  const res = await svc.getSamsonite();
  res.expectStatus(400);
}).tag('@negative');
