import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { z } from 'zod';

import type { Config } from '@core/config/ConfigLoader';

import { AMBIENT_DEFAULTS } from '@api/rest/ambientHeaders';
import { swaggerToModel } from '@api/swagger/SwaggerEndpointAdapter';
import { SwaggerGroup, SwaggerParserResult } from '@api/swagger/SwaggerParser';

import { ScenarioEnricher } from '@ai/codegen/shared/ScenarioEnricher';
import { SwaggerNegativeStrategy } from '@ai/codegen/shared/strategies/SwaggerNegativeStrategy';
import { renderService } from '@ai/codegen/shared/templates/ServiceTemplate';
import { RenderablePlan, renderTest } from '@ai/codegen/shared/templates/TestTemplate';
import { TestCasePlan } from '@ai/codegen/shared/TestCasePlan';
import { TestCasePlanner } from '@ai/codegen/shared/TestCasePlanner';
import { DataContext } from '@ai/data/DataContext';
import { DataFactory } from '@ai/data/DataFactory';

import { createApiPostValidate } from './ApiPostValidator';
import { GenerationCache } from './GenerationCache';

export interface SwaggerToApiInput {
  group: SwaggerGroup;
  baseUrl: string;
  outputDir?: string;
  testOutputDir?: string;
  /** Top-level securitySchemes from the parsed spec. */
  securitySchemes?: Record<string, unknown>;
  /** Global security requirements from the parsed spec. */
  globalSecurity?: Array<Record<string, string[]>>;
}

const outputSchema = z.object({
  serviceTs: z.string().min(1),
  testTs: z.string().min(1),
});
export type SwaggerToApiOutput = z.infer<typeof outputSchema>;

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
  postValidate?: (files: SwaggerToApiOutput) => Promise<string[]>;
  cache?: GenerationCache;
  /** Injectable config for testing — avoids loading ConfigLoader at module evaluation time. */
  apiHeaderNames?: Config['apiHeaderNames'];
}

function planCacheKey(planIds: string[], seed?: number): string {
  return crypto
    .createHash('sha256')
    .update([...planIds].sort().join(',') + ':' + (seed ?? ''))
    .digest('hex');
}

function matchesExclude(operationId: string, patterns: string[]): boolean {
  return patterns.some((p) => {
    if (p.includes('*')) {
      const re = new RegExp(
        '^' + p.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$',
      );
      return re.test(operationId);
    }
    return operationId === p;
  });
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

/**
 * Generates a typed Service class + CodeceptJS API test file for a group of
 * Swagger/OpenAPI endpoints using the shared deterministic core.
 * LLM is used only for Scenario titles (via ScenarioEnricher).
 *
 * Use `runAll()` to process every group in a parsed swagger spec at once.
 */
export class SwaggerToApiAgent {
  private readonly enricher: ScenarioEnricher;
  private readonly dataFactory: DataFactory;
  private readonly postValidate: (files: SwaggerToApiOutput) => Promise<string[]>;
  private readonly cache?: GenerationCache;
  private readonly agentOpts: AgentOpts;
  private readonly apiHeaderNamesOverride?: Config['apiHeaderNames'];

  constructor(deps: AgentDeps = {}, agentOpts: AgentOpts = {}) {
    this.enricher = deps.enricher ?? new ScenarioEnricher();
    this.dataFactory = deps.dataFactory ?? new DataFactory();
    this.postValidate = deps.postValidate ?? createApiPostValidate();
    this.cache = deps.cache;
    this.agentOpts = agentOpts;
    this.apiHeaderNamesOverride = deps.apiHeaderNames;
  }

  private getApiHeaderNames(): Config['apiHeaderNames'] {
    // Fall back to AMBIENT_DEFAULTS, which matches the ConfigLoader defaults.
    // Callers in production scripts should inject config.apiHeaderNames for env overrides.
    return this.apiHeaderNamesOverride ?? AMBIENT_DEFAULTS;
  }

  async run(input: SwaggerToApiInput, runOpts: RunOpts = {}): Promise<SwaggerToApiOutput> {
    // 1. Build EndpointModel[] from Swagger group
    const models = swaggerToModel(input.group, input.securitySchemes ?? {}, input.globalSecurity, {
      apiHeaderNames: this.getApiHeaderNames(),
    });

    // 2. Apply exclude filter on operationId
    const filtered = this.agentOpts.exclude?.length
      ? models.filter((ep) => !matchesExclude(ep.operationId, this.agentOpts.exclude!))
      : models;

    // 3. Plan test cases (topological sort included)
    const strategy = new SwaggerNegativeStrategy();
    const planner = new TestCasePlanner(strategy, {
      requiredHeaders: this.agentOpts.requiredHeaders,
      authNegativeCases: this.agentOpts.authNegativeCases,
    });
    const { plans, executionOrder } = planner.planAll(filtered);

    // 4. Cache lookup — key is based on plan IDs + seed (LLM-independent)
    const cacheKey = planCacheKey(
      plans.map((p) => p.id),
      this.agentOpts.seed,
    );
    if (!runOpts.skipCache && this.cache) {
      const hit = this.cache.lookup('swagger-to-api', cacheKey);
      if (hit && hit['serviceTs'] && hit['testTs']) {
        const cached: SwaggerToApiOutput = {
          serviceTs: hit['serviceTs'] as string,
          testTs: hit['testTs'] as string,
        };
        if (!runOpts.dryRun) this.writeFiles(input, cached);
        return cached;
      }
    }

    // 5. Build renderable plans: payload per plan + enriched titles
    const renderablePlans = await this.buildRenderablePlans(plans);

    // 6. Render service + test files (deterministic templates)
    const serviceTs = renderService(input.group, filtered);
    const testTs = renderTest(input.group, renderablePlans, executionOrder);
    const output: SwaggerToApiOutput = { serviceTs, testTs };

    // 7. Post-validate
    const errors = await this.postValidate(output);
    if (errors.length > 0) {
      throw new Error(`Post-validation failed:\n${errors.join('\n')}`);
    }

    // 8. Store in cache
    if (!runOpts.skipCache && this.cache) {
      this.cache.store('swagger-to-api', cacheKey, { serviceTs, testTs });
    }

    // 9. Write files (unless dry run)
    if (!runOpts.dryRun) this.writeFiles(input, output);

    return output;
  }

  /**
   * Generate Service + Test for ALL groups from a parsed swagger result.
   * Runs sequentially — ~8s per group when LLM enricher is active.
   *
   * @returns Map of groupName → generated output
   */
  async runAll(
    parsed: SwaggerParserResult,
    opts: {
      outputDir?: string;
      testOutputDir?: string;
      onGroupStart?: (groupName: string, index: number, total: number) => void;
      onGroupDone?: (groupName: string, output: SwaggerToApiOutput) => void;
    } & RunOpts = {},
  ): Promise<Map<string, SwaggerToApiOutput>> {
    const { outputDir, testOutputDir, onGroupStart, onGroupDone, ...runOpts } = opts;
    const results = new Map<string, SwaggerToApiOutput>();
    for (let i = 0; i < parsed.groups.length; i++) {
      const group = parsed.groups[i];
      onGroupStart?.(group.groupName, i, parsed.groups.length);
      const output = await this.run(
        {
          group,
          baseUrl: parsed.baseUrl,
          outputDir,
          testOutputDir,
          securitySchemes: parsed.securitySchemes,
          globalSecurity: parsed.globalSecurity,
        },
        runOpts,
      );
      results.set(group.groupName, output);
      onGroupDone?.(group.groupName, output);
    }
    return results;
  }

  private async buildRenderablePlans(plans: TestCasePlan[]): Promise<RenderablePlan[]> {
    // Group plans by endpoint so enricher gets all plans for the same endpoint together.
    const grouped = new Map<string, { plans: TestCasePlan[]; indices: number[] }>();
    for (let i = 0; i < plans.length; i++) {
      const epId = plans[i].endpoint.operationId;
      const entry = grouped.get(epId) ?? { plans: [], indices: [] };
      entry.plans.push(plans[i]);
      entry.indices.push(i);
      grouped.set(epId, entry);
    }

    const dataCtx = new DataContext();
    const renderablePlans: RenderablePlan[] = plans.map((plan) => ({ plan, title: '' }));

    for (const { plans: epPlans, indices } of grouped.values()) {
      const endpoint = epPlans[0].endpoint;

      // Build payload for each plan in this endpoint group
      for (let j = 0; j < epPlans.length; j++) {
        const plan = epPlans[j];
        const payload = await this.dataFactory.build(endpoint, {
          seed: this.agentOpts.seed ?? strHash(plan.id),
          ctx: dataCtx,
          mutation: plan.mutation,
          includeOptional: this.agentOpts.includeOptional,
        });
        renderablePlans[indices[j]].payload = payload;
      }

      // Enrich scenario titles
      const enriched = this.agentOpts.noLlm
        ? ScenarioEnricher.autoTitle(epPlans, endpoint)
        : await this.enricher.enrich(epPlans, endpoint);

      for (let j = 0; j < enriched.length; j++) {
        renderablePlans[indices[j]].title = enriched[j]?.title ?? autoTitleFallback(epPlans[j]);
      }
    }

    return renderablePlans;
  }

  private writeFiles(input: SwaggerToApiInput, output: SwaggerToApiOutput): void {
    const outputDir = input.outputDir ?? path.join(process.cwd(), 'src', 'api');
    const testOutputDir = input.testOutputDir ?? path.join(process.cwd(), 'tests', 'api', 'smoke');
    const { groupName, tagSlug } = input.group;
    const svcPath = path.join(outputDir, 'services', `${groupName}Service.ts`);
    const testPath = path.join(testOutputDir, `${tagSlug}.test.ts`);
    fs.mkdirSync(path.dirname(svcPath), { recursive: true });
    fs.mkdirSync(path.dirname(testPath), { recursive: true });
    fs.writeFileSync(svcPath, output.serviceTs, 'utf8');
    fs.writeFileSync(testPath, output.testTs, 'utf8');
  }
}
