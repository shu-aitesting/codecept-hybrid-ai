import * as path from 'node:path';

import { describe, expect, it, beforeAll } from 'vitest';

import { renderService } from '../../../../../../src/ai/codegen/shared/templates/ServiceTemplate';
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
  const pingGroup = parsed.groups.find((g) => g.tagSlug === 'ping')!;
  const userGroup = parsed.groups.find((g) => g.tagSlug === 'user')!;

  const pingModels = swaggerToModel(
    pingGroup,
    parsed.securitySchemes,
    parsed.globalSecurity,
    DEFAULT_CONFIG,
  );
  const userModels = swaggerToModel(
    userGroup,
    parsed.securitySchemes,
    parsed.globalSecurity,
    DEFAULT_CONFIG,
  );

  pingOutput = renderService(pingGroup, pingModels);
  userOutput = renderService(userGroup, userModels);
});

// ---------------------------------------------------------------------------
// PingService
// ---------------------------------------------------------------------------
describe('renderService — PingService', () => {
  it('contains correct imports', () => {
    expect(pingOutput).toContain(`import { config } from '@core/config/ConfigLoader'`);
    expect(pingOutput).toContain(`import { RestClient } from '@api/rest/RestClient'`);
    expect(pingOutput).toContain(
      `import { RestRequestBuilder } from '@api/rest/RestRequestBuilder'`,
    );
  });

  it('contains endpoint constant', () => {
    expect(pingOutput).toContain(`const PING_ENDPOINT = '/ping'`);
  });

  it('exports response schema const', () => {
    expect(pingOutput).toContain('export const GET_PING_RESPONSE_SCHEMA =');
    expect(pingOutput).toContain('as const;');
  });

  it('exports response interface', () => {
    expect(pingOutput).toContain('export interface GetPingResponse {');
    expect(pingOutput).toContain('status: string;');
  });

  it('exports class PingService', () => {
    expect(pingOutput).toContain('export class PingService {');
    expect(pingOutput).toContain('constructor(private readonly client: RestClient)');
  });

  it('has async getPing() method with no params', () => {
    expect(pingOutput).toContain('async getPing()');
  });

  it('GET method uses .get() builder call', () => {
    expect(pingOutput).toContain('.get(`${config.apiUrl}${PING_ENDPOINT}`)');
  });

  it('does NOT emit forbidden ambient headers', () => {
    expect(pingOutput).not.toMatch(/\.header\('Token'/);
    expect(pingOutput).not.toMatch(/\.header\('Lng'/);
    expect(pingOutput).not.toMatch(/\.header\('Tz'/);
    expect(pingOutput).not.toMatch(/\.header\('Authorization'/);
    expect(pingOutput).not.toMatch(/\.header\('Accept-Language'/);
  });

  it('does NOT emit Content-Type header for JSON body (auto-set by .json())', () => {
    expect(pingOutput).not.toMatch(/\.header\('Content-Type'/);
  });
});

// ---------------------------------------------------------------------------
// UserService
// ---------------------------------------------------------------------------
describe('renderService — UserService', () => {
  it('contains single USERS_ENDPOINT constant (base-path dedup)', () => {
    const matches = userOutput.match(/const USERS_ENDPOINT/g);
    expect(matches).toHaveLength(1);
    expect(userOutput).toContain(`const USERS_ENDPOINT = '/users'`);
  });

  it('exports 4 response schema consts (no deleteUser — 204 has no schema)', () => {
    expect(userOutput).toContain('export const GET_USERS_RESPONSE_SCHEMA =');
    expect(userOutput).toContain('export const CREATE_USER_RESPONSE_SCHEMA =');
    expect(userOutput).toContain('export const GET_USER_BY_ID_RESPONSE_SCHEMA =');
    expect(userOutput).toContain('export const UPDATE_USER_RESPONSE_SCHEMA =');
    expect(userOutput).not.toContain('DELETE_USER_RESPONSE_SCHEMA');
  });

  it('exports request interface for createUser', () => {
    expect(userOutput).toContain('export interface CreateUserRequest {');
    expect(userOutput).toContain('name: string;');
    expect(userOutput).toContain('email: string;');
    expect(userOutput).toContain('role?: string;');
  });

  it('exports request interface for updateUser', () => {
    expect(userOutput).toContain('export interface UpdateUserRequest {');
  });

  it('exports class UserService', () => {
    expect(userOutput).toContain('export class UserService {');
  });

  it('getUsers has opts bag for optional query params', () => {
    expect(userOutput).toContain('async getUsers(opts?: {');
    expect(userOutput).toContain('page?: number');
    expect(userOutput).toContain('limit?: number');
  });

  it('getUsers uses mutable builder with conditional query calls', () => {
    expect(userOutput).toContain("builder.query('page', opts.page!)");
    expect(userOutput).toContain("builder.query('limit', opts.limit!)");
  });

  it('createUser has body param typed as CreateUserRequest', () => {
    expect(userOutput).toContain('async createUser(body: CreateUserRequest)');
  });

  it('createUser uses .post() and .json(body)', () => {
    expect(userOutput).toContain('.post(`${config.apiUrl}${USERS_ENDPOINT}`)');
    expect(userOutput).toContain('.json(body)');
  });

  it('getUserById has id path param', () => {
    expect(userOutput).toContain('async getUserById(id: number)');
  });

  it('getUserById URL contains path param substitution', () => {
    expect(userOutput).toContain('`${config.apiUrl}${USERS_ENDPOINT}/${id}`');
  });

  it('updateUser has id path param and body', () => {
    expect(userOutput).toContain('async updateUser(id: number, body: UpdateUserRequest)');
  });

  it('deleteUser uses .delete() method', () => {
    expect(userOutput).toContain('async deleteUser(id: number)');
    expect(userOutput).toContain('.delete(');
  });

  it('does NOT emit forbidden ambient or Content-Type headers', () => {
    expect(userOutput).not.toMatch(/\.header\('Token'/);
    expect(userOutput).not.toMatch(/\.header\('Lng'/);
    expect(userOutput).not.toMatch(/\.header\('Authorization'/);
    expect(userOutput).not.toMatch(/\.header\('Content-Type'/);
  });

  it('output ends with a newline', () => {
    expect(userOutput.endsWith('\n')).toBe(true);
  });
});
