import * as path from 'node:path';

import { describe, expect, it, beforeAll } from 'vitest';

import { SwaggerNegativeStrategy } from '../../../../../../src/ai/codegen/shared/strategies/SwaggerNegativeStrategy';
import {
  renderTest,
  RenderablePlan,
} from '../../../../../../src/ai/codegen/shared/templates/TestTemplate';
import { TestCasePlanner } from '../../../../../../src/ai/codegen/shared/TestCasePlanner';
import { swaggerToModel } from '../../../../../../src/api/swagger/SwaggerEndpointAdapter';
import { SwaggerParser } from '../../../../../../src/api/swagger/SwaggerParser';

const FIXTURE = path.resolve(__dirname, '../../../../../api/_fixtures/system-health.yaml');
const DEFAULT_CONFIG = {
  apiHeaderNames: { token: 'Token', tokenPrefix: '', language: 'Lng', timezone: 'Tz' },
};

let pingOutput: string;
let userOutput: string;

beforeAll(async () => {
  const parsed = await SwaggerParser.parse(FIXTURE);
  const planner = new TestCasePlanner(new SwaggerNegativeStrategy(), { authNegativeCases: 'both' });

  // Ping group
  const pingGroup = parsed.groups.find((g) => g.tagSlug === 'ping')!;
  const pingModels = swaggerToModel(
    pingGroup,
    parsed.securitySchemes,
    parsed.globalSecurity,
    DEFAULT_CONFIG,
  );
  const pingPlans = pingModels.flatMap((ep) => planner.plan(ep));
  const pingRenderablePlans: RenderablePlan[] = pingPlans.map((plan) => ({
    plan,
    title: `${plan.endpoint.method} ${plan.endpoint.path} — ${plan.kind}`,
  }));
  pingOutput = renderTest(pingGroup, pingRenderablePlans);

  // User group
  const userGroup = parsed.groups.find((g) => g.tagSlug === 'user')!;
  const userModels = swaggerToModel(
    userGroup,
    parsed.securitySchemes,
    parsed.globalSecurity,
    DEFAULT_CONFIG,
  );
  const userPlans = userModels.flatMap((ep) => planner.plan(ep));
  const userRenderablePlans: RenderablePlan[] = userPlans.map((plan) => ({
    plan,
    title: `${plan.endpoint.method} ${plan.endpoint.path} — ${plan.kind}`,
  }));
  userOutput = renderTest(userGroup, userRenderablePlans);
});

// ---------------------------------------------------------------------------
// PingService test file
// ---------------------------------------------------------------------------
describe('renderTest — ping.test.ts', () => {
  it('contains correct imports', () => {
    expect(pingOutput).toContain(`import { RestClient } from '@api/rest/RestClient'`);
    expect(pingOutput).toContain(`import { DataContext } from '@ai/data/DataContext'`);
    expect(pingOutput).toContain('PingService');
    expect(pingOutput).toContain('GET_PING_RESPONSE_SCHEMA');
  });

  it('declares Feature for Ping', () => {
    expect(pingOutput).toContain(`Feature('Ping API').tag('@api').tag('@regression')`);
  });

  it('declares module-scope variables', () => {
    expect(pingOutput).toContain('let client: RestClient;');
    expect(pingOutput).toContain('let svc: PingService;');
    expect(pingOutput).toContain('let dataCtx: DataContext;');
  });

  it('has Before hook with init', () => {
    expect(pingOutput).toContain('Before(async () => {');
    expect(pingOutput).toContain('await client.init();');
    expect(pingOutput).toContain('svc = new PingService(client);');
  });

  it('has After hook with dispose', () => {
    expect(pingOutput).toContain('After(async () => {');
    expect(pingOutput).toContain('dataCtx.clear();');
    expect(pingOutput).toContain('await client.dispose();');
  });

  it('positive scenario calls getPing and checks status 200', () => {
    expect(pingOutput).toContain('await svc.getPing()');
    expect(pingOutput).toContain('res.expectStatus(200)');
  });

  it('positive scenario has @schema assertion using schema const', () => {
    expect(pingOutput).toContain('.expectSchema(GET_PING_RESPONSE_SCHEMA)');
  });

  it('positive scenario has @smoke tag', () => {
    expect(pingOutput).toContain(".tag('@smoke')");
  });

  it('positive scenario has @positive, @contract tags', () => {
    expect(pingOutput).toContain(".tag('@positive')");
    expect(pingOutput).toContain(".tag('@contract')");
  });

  it('produces exactly 1 scenario (no auth, no body → positive only)', () => {
    const matches = pingOutput.match(/^Scenario\(/gm);
    expect(matches).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// UserService test file
// ---------------------------------------------------------------------------
describe('renderTest — user.test.ts', () => {
  it('imports UserService and schema consts', () => {
    expect(userOutput).toContain('UserService');
    expect(userOutput).toContain('GET_USERS_RESPONSE_SCHEMA');
    expect(userOutput).toContain('CREATE_USER_RESPONSE_SCHEMA');
    expect(userOutput).toContain('GET_USER_BY_ID_RESPONSE_SCHEMA');
    expect(userOutput).toContain('UPDATE_USER_RESPONSE_SCHEMA');
    // DELETE has no 2xx schema — no schema const for it
    expect(userOutput).not.toContain('DELETE_USER_RESPONSE_SCHEMA');
  });

  it('declares Feature for User', () => {
    expect(userOutput).toContain(`Feature('User API').tag('@api').tag('@regression')`);
  });

  it('positive plan for getUsers has @schema, @smoke tags', () => {
    const lines = userOutput.split('\n');
    const getUsersPositiveIdx = lines.findIndex(
      (l) => l.includes('await svc.getUsers()') && !l.includes('svc2'),
    );
    expect(getUsersPositiveIdx).toBeGreaterThan(-1);
    // The closing tag chain is on the same or nearby lines
    const vicinity = lines.slice(getUsersPositiveIdx, getUsersPositiveIdx + 10).join('\n');
    expect(vicinity).toContain('@schema');
    expect(vicinity).toContain('@smoke');
  });

  it('getUsers negative-validation passes opts with out-of-range page', () => {
    expect(userOutput).toContain('svc.getUsers({"page":0})');
  });

  it('negative-auth-missing scenarios use skipAmbient token', () => {
    expect(userOutput).toContain("skipAmbient: ['token']");
  });

  it('negative-auth-invalid scenarios use headerOverrides + extraHTTPHeaders', () => {
    expect(userOutput).toContain("headerOverrides: { token: 'Token' }");
    expect(userOutput).toContain("'Token': 'invalid-token-for-test'");
  });

  it('negative-headers scenario uses skipAmbient language', () => {
    expect(userOutput).toContain("skipAmbient: ['language']");
  });

  it('createUser positive calls svc.createUser with body (from example)', () => {
    expect(userOutput).toContain('svc.createUser(');
    expect(userOutput).toContain('jane@example.com');
  });

  it('createUser negative-validation body is missing the required field', () => {
    const lines = userOutput.split('\n');
    const negSection = lines
      .filter((l) => l.includes('createUser(') || l.includes('negative-validation'))
      .join('\n');
    expect(negSection).toContain('email');
  });

  it('getUserById positive calls svc.getUserById(1)', () => {
    expect(userOutput).toContain('svc.getUserById(1)');
  });

  it('getUserById negative-validation calls with id=0', () => {
    expect(userOutput).toContain('svc.getUserById(0)');
  });

  it('deleteUser positive expects status 204', () => {
    const lines = userOutput.split('\n');
    const deleteCallIdx = lines.findIndex(
      (l) => l.includes('svc.deleteUser(1)') || l.includes('svc.deleteUser('),
    );
    expect(deleteCallIdx).toBeGreaterThan(-1);
    const deleteSection = lines.slice(deleteCallIdx, deleteCallIdx + 5).join('\n');
    expect(deleteSection).toContain('204');
  });

  it('deleteUser negative-validation expects status 404 (DELETE special case)', () => {
    expect(userOutput).toContain('svc.deleteUser(0)');
    // Find the scenario block containing deleteUser(0) and check it expects 404
    const blocks = userOutput.split('Scenario(');
    const deleteNegBlock = blocks.find((b) => b.includes('deleteUser(0)'));
    expect(deleteNegBlock).toBeDefined();
    expect(deleteNegBlock).toContain('expectStatus(404)');
  });

  it('does NOT emit forbidden header calls in scenarios', () => {
    expect(userOutput).not.toMatch(/\.header\('Token'/);
    expect(userOutput).not.toMatch(/\.header\('Lng'/);
    expect(userOutput).not.toMatch(/\.header\('Authorization'/);
  });

  it('output ends with a newline', () => {
    expect(userOutput.endsWith('\n')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// renderTest — with explicit payload (PR-7 path simulation)
// ---------------------------------------------------------------------------
describe('renderTest — explicit payload from DataFactory', () => {
  it('uses provided payload instead of endpoint example', async () => {
    const parsed = await SwaggerParser.parse(FIXTURE);
    const userGroup = parsed.groups.find((g) => g.tagSlug === 'user')!;
    const userModels = swaggerToModel(
      userGroup,
      parsed.securitySchemes,
      parsed.globalSecurity,
      DEFAULT_CONFIG,
    );
    const createUserEp = userModels.find((e) => e.operationId === 'createUser')!;
    const planner = new TestCasePlanner(new SwaggerNegativeStrategy(), {});
    const positivePlan = planner.plan(createUserEp).find((p) => p.kind === 'positive')!;

    const customPayload = { name: 'Factory User', email: 'factory@test.com' };
    const rp: RenderablePlan = {
      plan: positivePlan,
      title: 'Create user with factory data',
      payload: customPayload,
    };

    const output = renderTest(userGroup, [rp]);
    expect(output).toContain('"Factory User"');
    expect(output).toContain('"factory@test.com"');
  });
});
