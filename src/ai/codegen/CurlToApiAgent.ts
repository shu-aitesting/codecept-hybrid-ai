import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { faker } from '@faker-js/faker';
import { z } from 'zod';

import { curlToModel } from '@api/curl/CurlEndpointAdapter';
import { CurlConverter } from '@api/rest/CurlConverter';

import { ScenarioEnricher } from '@ai/codegen/shared/ScenarioEnricher';
import { CurlNegativeStrategy } from '@ai/codegen/shared/strategies/CurlNegativeStrategy';
import { renderService } from '@ai/codegen/shared/templates/ServiceTemplate';
import { RenderablePlan, renderTest } from '@ai/codegen/shared/templates/TestTemplate';
import { TestCasePlan } from '@ai/codegen/shared/TestCasePlan';
import { TestCasePlanner } from '@ai/codegen/shared/TestCasePlanner';
import { DataContext } from '@ai/data/DataContext';
import { DataFactory } from '@ai/data/DataFactory';

import { createApiPostValidate } from './ApiPostValidator';
import { GenerationCache } from './GenerationCache';

export interface CurlToApiInput {
  curl: string;
  serviceName: string;
  outputDir: string;
}

const outputSchema = z.object({
  serviceTs: z.string().min(1),
  testTs: z.string().min(1),
});
export type CurlToApiOutput = z.infer<typeof outputSchema>;

/** Options controlling agent behaviour — passed at construction time. */
export interface AgentOpts {
  requiredHeaders?: string[];
  authNegativeCases?: 'missing' | 'invalid' | 'both';
  /** Glob/operationId patterns to skip. */
  exclude?: string[];
  /** Fixed seed for DataFactory — overrides per-plan hashes. */
  seed?: number;
  includeOptional?: boolean;
  /** Skip ScenarioEnricher LLM call; use auto-generated titles instead. */
  noLlm?: boolean;
  /** Parsed response body for cURL `--with-response` mode. */
  withResponse?: unknown;
  /** Expected HTTP status code when `withResponse` is provided. */
  expectedStatus?: number;
  /** Path template with `{param}` placeholders to override URL tokenization. */
  pathTemplate?: string;
}

/** Per-run options (backward-compat with old GenerationPipeline RunOpts). */
export interface RunOpts {
  dryRun?: boolean;
  skipCache?: boolean;
  /** Kept for API compatibility; not used in new implementation. */
  maxRetries?: number;
}

interface AgentDeps {
  enricher?: ScenarioEnricher;
  dataFactory?: DataFactory;
  postValidate?: (files: CurlToApiOutput) => Promise<string[]>;
  cache?: GenerationCache;
}

const UNIQUE_FIELD_RE = /email|username|code|sku|slug/i;

/** Override fields whose names suggest uniqueness to avoid DB conflicts on reruns. */
function mergeWithFakerOverrides(body: unknown): unknown {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return body;
  const result = { ...(body as Record<string, unknown>) };
  for (const key of Object.keys(result)) {
    if (UNIQUE_FIELD_RE.test(key)) {
      result[key] = /email/i.test(key) ? faker.internet.email() : faker.string.alphanumeric(8);
    }
  }
  return result;
}

function planCacheKey(planIds: string[], seed?: number): string {
  return crypto
    .createHash('sha256')
    .update([...planIds].sort().join(',') + ':' + (seed ?? ''))
    .digest('hex');
}

// FNV-1a-inspired integer hash for stable seed derivation from a string.
function strHash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function autoTitleFallback(plan: TestCasePlan): string {
  return `${plan.endpoint.method} ${plan.endpoint.path} — ${plan.kind}`;
}

function toSlug(name: string): string {
  return name
    .replace(/([A-Z])/g, '-$1')
    .toLowerCase()
    .replace(/^-/, '');
}

/**
 * Converts a cURL command into a typed Service class + CodeceptJS API test file
 * using the shared deterministic core. LLM is used only for Scenario titles.
 */
export class CurlToApiAgent {
  private readonly enricher: ScenarioEnricher;
  private readonly dataFactory: DataFactory;
  private readonly postValidate: (files: CurlToApiOutput) => Promise<string[]>;
  private readonly cache?: GenerationCache;
  private readonly agentOpts: AgentOpts;

  constructor(deps: AgentDeps = {}, agentOpts: AgentOpts = {}) {
    this.enricher = deps.enricher ?? new ScenarioEnricher();
    this.dataFactory = deps.dataFactory ?? new DataFactory();
    this.postValidate = deps.postValidate ?? createApiPostValidate();
    this.cache = deps.cache;
    this.agentOpts = agentOpts;
  }

  async run(input: CurlToApiInput, runOpts: RunOpts = {}): Promise<CurlToApiOutput> {
    // 1. Parse cURL command → RestRequest
    const req = CurlConverter.fromCurl(input.curl);

    // 2. Convert to EndpointModel
    const endpoint = curlToModel(req, {
      serviceName: input.serviceName,
      pathTemplate: this.agentOpts.pathTemplate,
      withResponse: this.agentOpts.withResponse,
      expectedStatus: this.agentOpts.expectedStatus,
    });

    // 3. Plan test cases
    const strategy = new CurlNegativeStrategy();
    const planner = new TestCasePlanner(strategy, {
      requiredHeaders: this.agentOpts.requiredHeaders,
      authNegativeCases: this.agentOpts.authNegativeCases,
    });
    const plans = planner.plan(endpoint);

    // 4. Cache lookup
    const cacheKey = planCacheKey(
      plans.map((p) => p.id),
      this.agentOpts.seed,
    );
    if (!runOpts.skipCache && this.cache) {
      const hit = this.cache.lookup('curl-to-api', cacheKey);
      if (hit && hit['serviceTs'] && hit['testTs']) {
        const cached: CurlToApiOutput = {
          serviceTs: hit['serviceTs'] as string,
          testTs: hit['testTs'] as string,
        };
        if (!runOpts.dryRun) this.writeFiles(input, cached);
        return cached;
      }
    }

    // 5. Build renderable plans with payloads + titles
    const dataCtx = new DataContext();
    const renderablePlans: RenderablePlan[] = [];

    for (const plan of plans) {
      let payload: unknown;
      if (plan.kind === 'positive') {
        // Canonical truth: captured body with unique-field overrides
        payload = mergeWithFakerOverrides(req.body);
      } else {
        // Negative: apply mutation on DataFactory output
        payload = await this.dataFactory.build(endpoint, {
          seed: this.agentOpts.seed ?? strHash(plan.id),
          ctx: dataCtx,
          mutation: plan.mutation,
          includeOptional: this.agentOpts.includeOptional,
        });
      }
      renderablePlans.push({ plan, title: '', payload });
    }

    // Enrich titles (all plans for the single endpoint at once)
    const enriched = this.agentOpts.noLlm
      ? ScenarioEnricher.autoTitle(plans, endpoint)
      : await this.enricher.enrich(plans, endpoint);
    for (let i = 0; i < renderablePlans.length; i++) {
      renderablePlans[i].title = enriched[i]?.title ?? autoTitleFallback(plans[i]);
    }

    // 6. Render service + test (cURL always produces a single-endpoint group)
    const group = { groupName: input.serviceName, tagSlug: toSlug(input.serviceName) };
    const serviceTs = renderService(group, [endpoint]);
    const testTs = renderTest(group, renderablePlans);
    const output: CurlToApiOutput = { serviceTs, testTs };

    // 7. Post-validate
    const errors = await this.postValidate(output);
    if (errors.length > 0) {
      throw new Error(`Post-validation failed:\n${errors.join('\n')}`);
    }

    // 8. Store in cache
    if (!runOpts.skipCache && this.cache) {
      this.cache.store('curl-to-api', cacheKey, { serviceTs, testTs });
    }

    // 9. Write files (unless dry run)
    if (!runOpts.dryRun) this.writeFiles(input, output);

    return output;
  }

  private writeFiles(input: CurlToApiInput, output: CurlToApiOutput): void {
    const svcPath = path.join(input.outputDir, 'services', `${input.serviceName}Service.ts`);
    const testPath = path.join(
      process.cwd(),
      'tests',
      'api',
      'smoke',
      `${toSlug(input.serviceName)}.test.ts`,
    );
    fs.mkdirSync(path.dirname(svcPath), { recursive: true });
    fs.mkdirSync(path.dirname(testPath), { recursive: true });
    fs.writeFileSync(svcPath, output.serviceTs, 'utf8');
    fs.writeFileSync(testPath, output.testTs, 'utf8');
  }
}
