import { describe, expect, it } from 'vitest';

import {
  checkServiceRules,
  checkTestRules,
  createApiPostValidate,
} from '../../../../src/ai/codegen/ApiPostValidator';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const VALID_SERVICE = `
import { config } from '@core/config/ConfigLoader';
import { RestClient } from '@api/rest/RestClient';
import { RestRequestBuilder } from '@api/rest/RestRequestBuilder';

const USER_ENDPOINT = '/users';

export interface CreateUserRequest { name: string; email: string; }
export interface CreateUserResponse { id: number; name: string; }

export class UserService {
  constructor(private readonly client: RestClient) {}

  async createUser(params: CreateUserRequest) {
    const req = new RestRequestBuilder()
      .post(\`\${config.apiUrl}\${USER_ENDPOINT}\`)
      .json(params)
      .build();
    return this.client.send<CreateUserResponse>(req);
  }
}
`;

const VALID_TEST = `
import { UserService, CreateUserRequest } from '@api/services/UserService';
import { RestClient } from '@api/rest/RestClient';

Feature('User API').tag('@api').tag('@regression');

let client: RestClient;
let svc: UserService;

Before(async () => {
  client = new RestClient();
  await client.init();
  svc = new UserService(client);
});

After(async () => {
  await client.dispose();
});

Scenario('Creates user successfully', async () => {
  const res = await svc.createUser({ name: 'Alice', email: 'alice@example.com' });
  res.expectStatus(201);
}).tag('@smoke');

Scenario('Returns 400 for missing name', async () => {
  const res = await svc.createUser({ name: '', email: 'alice@example.com' });
  res.expectStatus(400);
}).tag('@negative');
`;

// ─── checkServiceRules ────────────────────────────────────────────────────────

describe('checkServiceRules', () => {
  it('returns no errors for a fully compliant service', () => {
    expect(checkServiceRules(VALID_SERVICE)).toEqual([]);
  });

  it('flags missing endpoint constant', () => {
    const svc = VALID_SERVICE.replace(/const USER_ENDPOINT.*;\n/, '');
    const errors = checkServiceRules(svc);
    expect(errors.some((e) => e.includes('endpoint constant'))).toBe(true);
  });

  it('flags hardcoded absolute URL (no config.apiUrl)', () => {
    const svc = VALID_SERVICE.replace('config.apiUrl', '"https://api.example.com"');
    const errors = checkServiceRules(svc);
    expect(errors.some((e) => e.includes('config.apiUrl'))).toBe(true);
  });

  it('flags .body() instead of .json()', () => {
    const svc = VALID_SERVICE.replace('.json(params)', '.body(params)');
    const errors = checkServiceRules(svc);
    expect(errors.some((e) => e.includes('.body()'))).toBe(true);
  });

  it('flags sec-ch-ua browser fingerprint header', () => {
    const svc = VALID_SERVICE.replace(
      '.json(params)',
      ".json(params)\n      .header('sec-ch-ua', 'Chromium')",
    );
    const errors = checkServiceRules(svc);
    expect(errors.some((e) => e.includes('browser-fingerprinting'))).toBe(true);
  });

  it('flags sec-fetch-* header', () => {
    const svc = VALID_SERVICE.replace(
      '.json(params)',
      ".json(params)\n      .header('sec-fetch-mode', 'cors')",
    );
    const errors = checkServiceRules(svc);
    expect(errors.some((e) => e.includes('browser-fingerprinting'))).toBe(true);
  });

  it('flags old .url().method(RestMethod.*) pattern', () => {
    const svc = VALID_SERVICE.replace(
      '.post(`${config.apiUrl}${USER_ENDPOINT}`)',
      '.url(`${config.apiUrl}${USER_ENDPOINT}`).method(RestMethod.POST)',
    );
    const errors = checkServiceRules(svc);
    expect(errors.some((e) => e.includes('shorthands'))).toBe(true);
  });

  it('accumulates multiple errors at once', () => {
    // Drop endpoint constant AND config.apiUrl in one go
    const svc = `
export class BrokenService {
  async go() {
    const req = new RestRequestBuilder()
      .post('https://hardcoded.example.com/api/users')
      .body({ name: 'x' })
      .header('user-agent', 'Mozilla')
      .build();
  }
}`;
    const errors = checkServiceRules(svc);
    expect(errors.length).toBeGreaterThanOrEqual(3);
  });
});

// ─── checkTestRules ───────────────────────────────────────────────────────────

describe('checkTestRules', () => {
  it('returns no errors for a fully compliant test', () => {
    expect(checkTestRules(VALID_TEST)).toEqual([]);
  });

  it('flags RestRequestBuilder import in test', () => {
    const test =
      `import { RestRequestBuilder } from '@api/rest/RestRequestBuilder';\n` + VALID_TEST;
    const errors = checkTestRules(test);
    expect(errors.some((e) => e.includes('RestRequestBuilder'))).toBe(true);
  });

  it('flags expect().toBe() assertion style', () => {
    const test = VALID_TEST.replace('res.expectStatus(201)', 'expect(res.status).toBe(201)');
    const errors = checkTestRules(test);
    expect(errors.some((e) => e.includes('expectStatus'))).toBe(true);
  });

  it('flags I.assertEqual assertion style', () => {
    const test = VALID_TEST.replace('res.expectStatus(201)', 'I.assertEqual(res.status, 201)');
    const errors = checkTestRules(test);
    expect(errors.some((e) => e.includes('expectStatus'))).toBe(true);
  });

  it('flags missing Before() lifecycle hook', () => {
    const test = VALID_TEST.replace(/Before[\s\S]*?\}\);\n/, '');
    const errors = checkTestRules(test);
    expect(errors.some((e) => e.includes('Before()'))).toBe(true);
  });

  it('flags missing After() lifecycle hook', () => {
    const test = VALID_TEST.replace(/After[\s\S]*?\}\);\n/, '');
    const errors = checkTestRules(test);
    expect(errors.some((e) => e.includes('After()'))).toBe(true);
  });

  it("flags missing .tag('@api') on Feature", () => {
    const test = VALID_TEST.replace(".tag('@api')", '');
    const errors = checkTestRules(test);
    expect(errors.some((e) => e.includes("'@api'"))).toBe(true);
  });

  it('flags @smoke embedded in scenario title instead of chained .tag()', () => {
    const test = VALID_TEST.replace(
      "Scenario('Creates user successfully",
      "Scenario('Creates user @smoke",
    ).replace("}).tag('@smoke');", '});');
    const errors = checkTestRules(test);
    expect(errors.some((e) => e.includes('.tag('))).toBe(true);
  });

  it('accepts @health chained correctly', () => {
    const test = VALID_TEST.replace("}).tag('@smoke');", "}).tag('@smoke').tag('@health');");
    expect(checkTestRules(test)).toEqual([]);
  });

  it('accepts @deprecated chained correctly', () => {
    const test =
      VALID_TEST +
      `\nScenario('Old endpoint', async () => {\n  const res = await svc.createUser({ name: 'x', email: 'x@x.com' });\n  res.expectStatus(200);\n}).tag('@deprecated');\n`;
    expect(checkTestRules(test)).toEqual([]);
  });
});

// ─── createApiPostValidate ────────────────────────────────────────────────────

describe('createApiPostValidate', () => {
  it('returns no errors when both files are compliant (skipTsc)', async () => {
    const validate = createApiPostValidate({ skipTsc: true });
    const errors = await validate({ serviceTs: VALID_SERVICE, testTs: VALID_TEST });
    expect(errors).toEqual([]);
  });

  it('returns service errors when service is non-compliant', async () => {
    const validate = createApiPostValidate({ skipTsc: true });
    const svc = VALID_SERVICE.replace('config.apiUrl', '"https://hardcoded.example.com"');
    const errors = await validate({ serviceTs: svc, testTs: VALID_TEST });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.includes('config.apiUrl'))).toBe(true);
  });

  it('returns test errors when test is non-compliant', async () => {
    const validate = createApiPostValidate({ skipTsc: true });
    const test =
      `import { RestRequestBuilder } from '@api/rest/RestRequestBuilder';\n` + VALID_TEST;
    const errors = await validate({ serviceTs: VALID_SERVICE, testTs: test });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.includes('RestRequestBuilder'))).toBe(true);
  });

  it('reports service errors before test errors (service phase runs first)', async () => {
    const validate = createApiPostValidate({ skipTsc: true });
    // Both broken — service errors should come first
    const svc = VALID_SERVICE.replace('config.apiUrl', '"https://hardcoded.example.com"');
    const test =
      `import { RestRequestBuilder } from '@api/rest/RestRequestBuilder';\n` + VALID_TEST;
    const errors = await validate({ serviceTs: svc, testTs: test });
    // All errors returned together (service first, then test)
    expect(errors.some((e) => e.includes('config.apiUrl'))).toBe(true);
    expect(errors.some((e) => e.includes('RestRequestBuilder'))).toBe(true);
  });

  it('skips tsc when SKIP_TSC_VALIDATE env var is set', async () => {
    const prev = process.env['SKIP_TSC_VALIDATE'];
    process.env['SKIP_TSC_VALIDATE'] = 'true';
    try {
      // No skipTsc option — relies on env var
      const validate = createApiPostValidate();
      const errors = await validate({ serviceTs: VALID_SERVICE, testTs: VALID_TEST });
      expect(errors).toEqual([]);
    } finally {
      if (prev === undefined) delete process.env['SKIP_TSC_VALIDATE'];
      else process.env['SKIP_TSC_VALIDATE'] = prev;
    }
  });

  it('skips tsc when skipTsc option is true', async () => {
    const validate = createApiPostValidate({ skipTsc: true });
    const errors = await validate({ serviceTs: VALID_SERVICE, testTs: VALID_TEST });
    expect(errors).toEqual([]);
  });
});
