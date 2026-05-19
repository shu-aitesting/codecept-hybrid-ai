import { RestClient } from '@api/rest/RestClient';
import {
  PetService,
  FIND_PETS_BY_STATUS_RESPONSE_SCHEMA,
  FIND_PETS_BY_TAGS_RESPONSE_SCHEMA,
  GET_PET_BY_ID_RESPONSE_SCHEMA,
  UPLOAD_FILE_RESPONSE_SCHEMA,
  AddPetRequest,
  UpdatePetRequest,
} from '@api/services/PetService';

import { DataContext } from '@ai/data/DataContext';

Feature('Pet API').tag('@api').tag('@regression');

let client: RestClient;
let svc: PetService;
let dataCtx: DataContext;

Before(async () => {
  client = new RestClient();
  await client.init();
  svc = new PetService(client);
  dataCtx = new DataContext();
});

After(async () => {
  dataCtx.clear();
  await client.dispose();
});

Scenario('[PET-001] POST /pet — positive', async () => {
  const res = await svc.addPet({
    id: -29249898,
    name: 'doggie',
    photoUrls: [
      'magna',
      'sint reprehenderit laboris',
      'Excepteur cillum do esse',
      'magna reprehenderit ad ea sunt',
      'ipsum ut esse ea qui',
    ],
    tags: [
      {
        nostrud2: 'labore consectetur',
        fugiat__f: true,
        ad975: 'nisi ut labore Ut',
        est0: 'proident pariatur ad',
        id: -13395073,
        name: 'consequat enim irure',
      },
      { laborumc3: -7329764 },
      {
        incididunt47d: 30912994,
        nisi__3f: true,
        fugiat_b: 88524161,
        id: -72535549,
        name: 'officia commodo',
      },
      { name: 'aliqua sunt' },
      { id: 79885984, name: 'ea sed et qui' },
    ],
  } as AddPetRequest);
  res.expectStatus(200);
})
  .tag('@PET-001')
  .tag('@positive')
  .tag('@contract')
  .tag('@smoke');

Scenario('[PET-002] POST /pet — negative-validation', async () => {
  const payload = {
    id: -17654268,
    category: {
      exercitation275: 8758372,
      sunt_d: -12473265.454173088,
      eu_4: -87655519.2284286,
      irure6: 'do deserunt eiusmod pariatur',
      id: 66881499,
      name: 'est sint voluptate laboris',
    },
    photoUrls: ['sed'],
    tags: [
      { id: 45420439, name: 'sunt ea dolore' },
      { id_9f: -72205809, est71: true },
    ],
    status: 'sold',
  } as unknown as AddPetRequest;
  const res = await svc.addPet(payload);
  res.expectStatus(400);
})
  .tag('@PET-002')
  .tag('@negative-validation');

Scenario('[PET-003] DELETE /pet/{petId} — positive', async () => {
  const res = await svc.deletePet('1');
  res.expectStatus(200);
})
  .tag('@PET-003')
  .tag('@positive')
  .tag('@contract')
  .tag('@smoke');

Scenario('[PET-004] DELETE /pet/{petId} — negative-validation', async () => {
  const res = await svc.deletePet('0');
  res.expectStatus(404);
})
  .tag('@PET-004')
  .tag('@negative-validation');

Scenario('[PET-005] GET /pet/findByStatus — positive', async () => {
  const res = await svc.findPetsByStatus('placeholder');
  res
    .expectStatus(200)
    .expectContentType('application/json')
    .expectSchema(FIND_PETS_BY_STATUS_RESPONSE_SCHEMA);
})
  .tag('@PET-005')
  .tag('@positive')
  .tag('@contract')
  .tag('@smoke')
  .tag('@schema');

Scenario('[PET-006] GET /pet/findByStatus — negative-validation', async () => {
  const res = await svc.findPetsByStatus('invalid-value');
  res.expectStatus(400);
})
  .tag('@PET-006')
  .tag('@negative-validation');

Scenario('[PET-007] GET /pet/findByTags — positive', async () => {
  const res = await svc.findPetsByTags('placeholder');
  res
    .expectStatus(200)
    .expectContentType('application/json')
    .expectSchema(FIND_PETS_BY_TAGS_RESPONSE_SCHEMA);
})
  .tag('@PET-007')
  .tag('@positive')
  .tag('@contract')
  .tag('@schema')
  .tag('@deprecated');

Scenario('[PET-008] GET /pet/findByTags — negative-validation', async () => {
  const res = await svc.findPetsByTags('invalid-value');
  res.expectStatus(400);
})
  .tag('@PET-008')
  .tag('@negative-validation');

Scenario('[PET-009] GET /pet/{petId} — positive', async () => {
  const res = await svc.getPetById('1');
  res
    .expectStatus(200)
    .expectContentType('application/json')
    .expectSchema(GET_PET_BY_ID_RESPONSE_SCHEMA);
})
  .tag('@PET-009')
  .tag('@positive')
  .tag('@contract')
  .tag('@smoke')
  .tag('@schema');

Scenario('[PET-010] GET /pet/{petId} — negative-validation', async () => {
  const res = await svc.getPetById('0');
  res.expectStatus(400);
})
  .tag('@PET-010')
  .tag('@negative-validation');

Scenario('[PET-011] GET /pet/{petId} — negative-auth-missing', async () => {
  const client2 = new RestClient();
  await client2.init({ skipAmbient: ['token'] });
  const svc2 = new PetService(client2);
  const res = await svc2.getPetById('1');
  res.expectStatus(401);
  await client2.dispose();
})
  .tag('@PET-011')
  .tag('@negative-auth-missing');

Scenario('[PET-012] GET /pet/{petId} — negative-auth-invalid', async () => {
  const client2 = new RestClient();
  await client2.init({
    headerOverrides: { token: 'api_key' },
    extraHTTPHeaders: { api_key: 'invalid-token-for-test' },
  });
  const svc2 = new PetService(client2);
  const res = await svc2.getPetById('1');
  res.expectStatus(401);
  await client2.dispose();
})
  .tag('@PET-012')
  .tag('@negative-auth-invalid');

Scenario('[PET-013] PUT /pet — positive', async () => {
  const res = await svc.updatePet({
    name: 'doggie',
    photoUrls: [
      'cupidatat in aliquip pariatur',
      'Lorem officia fugiat Ut nisi',
      'velit aute',
      'fugiat',
    ],
    status: 'available',
  } as UpdatePetRequest);
  res.expectStatus(200);
})
  .tag('@PET-013')
  .tag('@positive')
  .tag('@contract')
  .tag('@smoke');

Scenario('[PET-014] PUT /pet — negative-validation', async () => {
  const payload = {
    id: 72491469,
    category: { et__: 22909765, id: -75515381, name: 'Duis eu' },
    photoUrls: ['eiusmod tempor ut sed', 'incididunt'],
    tags: [
      { ut_9d: true, id: 733337, name: 'veniam' },
      { pariatur_6_8: -432713.6557549238, commodo_e4a: -75508535.51365435, amet57_: 'Ut' },
      { id: 32950476, name: 'nisi enim ullamco aute' },
      { enim6: false, id: -20700389, name: 'cupidatat' },
      {
        consequat_da: 'et aliquip incididunt id ex',
        ea_9: 'mollit nisi in consectetur',
        proident5_b: -84912582,
        ad__: -91668854,
        irure_b: -10372546,
        nulla_e__: true,
      },
    ],
    status: 'pending',
  } as unknown as UpdatePetRequest;
  const res = await svc.updatePet(payload);
  res.expectStatus(400);
})
  .tag('@PET-014')
  .tag('@negative-validation');

Scenario('[PET-015] POST /pet/{petId} — positive', async () => {
  const res = await svc.updatePetWithForm('1');
  res.expectStatus(200);
})
  .tag('@PET-015')
  .tag('@positive')
  .tag('@contract')
  .tag('@smoke');

Scenario('[PET-016] POST /pet/{petId} — negative-validation', async () => {
  const res = await svc.updatePetWithForm('0');
  res.expectStatus(400);
})
  .tag('@PET-016')
  .tag('@negative-validation');

Scenario('[PET-017] POST /pet/{petId}/uploadImage — positive', async () => {
  const res = await svc.uploadFile('1');
  res
    .expectStatus(200)
    .expectContentType('application/json')
    .expectSchema(UPLOAD_FILE_RESPONSE_SCHEMA);
})
  .tag('@PET-017')
  .tag('@positive')
  .tag('@contract')
  .tag('@smoke')
  .tag('@schema');

Scenario('[PET-018] POST /pet/{petId}/uploadImage — negative-validation', async () => {
  const res = await svc.uploadFile('0');
  res.expectStatus(400);
})
  .tag('@PET-018')
  .tag('@negative-validation');
