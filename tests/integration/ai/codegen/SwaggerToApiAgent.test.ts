/**
 * Integration test: SwaggerToApiAgent end-to-end on system-health.yaml fixture.
 * Runs with noLlm=true so no real LLM calls are made.
 * CI env sets SKIP_LLM=true which the enricher respects via noLlm flag.
 */
import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  SwaggerToApiAgent,
  SwaggerToApiOutput,
} from '../../../../src/ai/codegen/SwaggerToApiAgent';
import { SwaggerParser } from '../../../../src/api/swagger/SwaggerParser';

const FIXTURE_PATH = path.resolve(__dirname, '../../../api/_fixtures/system-health.yaml');

function makeAgent(postValidate?: (f: SwaggerToApiOutput) => Promise<string[]>): SwaggerToApiAgent {
  return new SwaggerToApiAgent(
    { postValidate: postValidate ?? (() => Promise.resolve([])) },
    { noLlm: true },
  );
}

describe('SwaggerToApiAgent integration — system-health.yaml', () => {
  it('parses fixture and produces output for each group without error', async () => {
    const parsed = await SwaggerParser.parse(FIXTURE_PATH);
    expect(parsed.groups.length).toBeGreaterThan(0);

    const agent = makeAgent();
    const results = await agent.runAll(parsed, { dryRun: true });

    expect(results.size).toBe(parsed.groups.length);
    for (const [groupName, output] of results) {
      expect(output.serviceTs, `${groupName}: serviceTs empty`).toBeTruthy();
      expect(output.testTs, `${groupName}: testTs empty`).toBeTruthy();
    }
  });

  it('generated serviceTs contains the service class and at least one method', async () => {
    const parsed = await SwaggerParser.parse(FIXTURE_PATH);
    const agent = makeAgent();
    const results = await agent.runAll(parsed, { dryRun: true });

    for (const [groupName, output] of results) {
      expect(output.serviceTs, `${groupName}: no class`).toContain(`${groupName}Service`);
      expect(output.serviceTs, `${groupName}: no async method`).toMatch(/async \w+\(/);
    }
  });

  it('generated testTs contains Feature, Before, After, and at least one Scenario', async () => {
    const parsed = await SwaggerParser.parse(FIXTURE_PATH);
    const agent = makeAgent();
    const results = await agent.runAll(parsed, { dryRun: true });

    for (const [groupName, output] of results) {
      expect(output.testTs, `${groupName}: no Feature`).toContain("Feature('");
      expect(output.testTs, `${groupName}: no Before`).toContain('Before(');
      expect(output.testTs, `${groupName}: no After`).toContain('After(');
      expect(output.testTs, `${groupName}: no Scenario`).toContain('Scenario(');
    }
  });

  it('idempotent: two runs with same input produce identical output', async () => {
    const parsed = await SwaggerParser.parse(FIXTURE_PATH);
    const agent = makeAgent();

    const first = await agent.runAll(parsed, { dryRun: true, skipCache: true });
    const second = await agent.runAll(parsed, { dryRun: true, skipCache: true });

    for (const groupName of first.keys()) {
      expect(second.get(groupName)?.serviceTs).toBe(first.get(groupName)?.serviceTs);
      expect(second.get(groupName)?.testTs).toBe(first.get(groupName)?.testTs);
    }
  });

  it('exclude filter removes the excluded endpoint from service + test output', async () => {
    const parsed = await SwaggerParser.parse(FIXTURE_PATH);
    // Pick the first operationId from the first group to exclude
    const firstGroup = parsed.groups[0];
    const excludedOpId = firstGroup.endpoints[0]?.operationId;
    if (!excludedOpId) return; // skip if fixture has no endpoints

    const agentWithExclude = new SwaggerToApiAgent(
      { postValidate: () => Promise.resolve([]) },
      { noLlm: true, exclude: [excludedOpId] },
    );
    const results = await agentWithExclude.runAll(
      { ...parsed, groups: [firstGroup] },
      { dryRun: true },
    );
    const output = results.get(firstGroup.groupName);
    expect(output?.serviceTs).not.toContain(excludedOpId);
  });
});
