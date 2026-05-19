/**
 * Integration test: CurlToApiAgent end-to-end on sample-curls fixtures.
 * Runs with noLlm=true so no real LLM calls are made.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

import { CurlToApiAgent, CurlToApiOutput } from '../../../../src/ai/codegen/CurlToApiAgent';

const FIXTURES_DIR = path.resolve(__dirname, '../../../api/_fixtures/sample-curls');

function readFixture(name: string): string {
  return fs.readFileSync(path.join(FIXTURES_DIR, name), 'utf8').trim();
}

function makeAgent(postValidate?: (f: CurlToApiOutput) => Promise<string[]>): CurlToApiAgent {
  return new CurlToApiAgent(
    { postValidate: postValidate ?? (() => Promise.resolve([])) },
    { noLlm: true },
  );
}

const BASE_INPUT = {
  serviceName: 'Sample',
  outputDir: path.join(process.cwd(), '.tmp', 'curl-agent-test'),
};

describe('CurlToApiAgent integration — sample-curls fixtures', () => {
  it('get-no-auth.txt: produces serviceTs + testTs without error', async () => {
    const curl = readFixture('get-no-auth.txt');
    const agent = makeAgent();
    const result = await agent.run({ ...BASE_INPUT, curl }, { dryRun: true });
    expect(result.serviceTs).toBeTruthy();
    expect(result.testTs).toBeTruthy();
  });

  it('get-no-auth.txt: no auth → no @negative-auth-* scenarios', async () => {
    const curl = readFixture('get-no-auth.txt');
    const agent = makeAgent();
    const result = await agent.run({ ...BASE_INPUT, curl }, { dryRun: true });
    expect(result.testTs).not.toContain('negative-auth');
  });

  it('get-with-token.txt: auth header detected → @negative-auth scenarios emitted', async () => {
    const curl = readFixture('get-with-token.txt');
    const agent = makeAgent();
    const result = await agent.run({ ...BASE_INPUT, curl }, { dryRun: true });
    // At least one negative-auth scenario must exist
    expect(result.testTs).toContain("skipAmbient: ['token']");
  });

  it('post-with-body.txt: body detected → service method receives payload argument', async () => {
    const curl = readFixture('post-with-body.txt');
    const agent = makeAgent();
    const result = await agent.run({ ...BASE_INPUT, curl }, { dryRun: true });
    expect(result.serviceTs).toMatch(/async \w+\(.*\w+.*\)/); // method with at least one param
    expect(result.testTs).toContain('Scenario(');
  });

  it('idempotent: two runs with same cURL produce identical output', async () => {
    const curl = readFixture('post-with-body.txt');
    const agent = makeAgent();
    const input = { ...BASE_INPUT, curl };
    const first = await agent.run(input, { dryRun: true, skipCache: true });
    const second = await agent.run(input, { dryRun: true, skipCache: true });
    expect(second.serviceTs).toBe(first.serviceTs);
    expect(second.testTs).toBe(first.testTs);
  });

  it('testTs has Feature, Before, After and at least one Scenario', async () => {
    const curl = readFixture('get-with-token.txt');
    const agent = makeAgent();
    const result = await agent.run({ ...BASE_INPUT, curl }, { dryRun: true });
    expect(result.testTs).toContain("Feature('");
    expect(result.testTs).toContain('Before(');
    expect(result.testTs).toContain('After(');
    expect(result.testTs).toContain('Scenario(');
  });

  it('throws when postValidate returns errors', async () => {
    const curl = readFixture('get-no-auth.txt');
    const agent = makeAgent(() => Promise.resolve(['Forbidden header in service']));
    await expect(agent.run({ ...BASE_INPUT, curl }, { dryRun: true })).rejects.toThrow(
      'Post-validation failed',
    );
  });
});
