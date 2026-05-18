import { createHash } from 'node:crypto';

import { GenerationPipeline, PipelineConfig } from '../GenerationPipeline';

import type { EndpointModel } from './EndpointModel';
import { EnrichedPlan, EnrichedPlanArraySchema } from './EnrichedPlan';
import type { TestCasePlan } from './TestCasePlan';

export interface EnricherInput {
  method: string;
  path: string;
  summary: string;
  plans: Array<{
    planId: string;
    kind: string;
    mutationKind?: string;
    mutationPath?: string;
  }>;
}

const ENRICHER_PIPELINE_CONFIG: PipelineConfig<EnricherInput, EnrichedPlan[]> = {
  agentName: 'scenario-enricher',
  promptTemplate: 'scenario-enricher',
  outputSchema: EnrichedPlanArraySchema,
  inputHasher: (input) => createHash('sha256').update(JSON.stringify(input)).digest('hex'),
  contextBuilder: async (input) => ({
    method: input.method,
    path: input.path,
    summary: input.summary,
    plansJson: JSON.stringify(input.plans, null, 2),
  }),
};

export class ScenarioEnricher {
  private readonly pipeline: GenerationPipeline<EnricherInput, EnrichedPlan[]>;

  constructor(pipeline?: GenerationPipeline<EnricherInput, EnrichedPlan[]>) {
    this.pipeline = pipeline ?? new GenerationPipeline(ENRICHER_PIPELINE_CONFIG);
  }

  /**
   * Generate deterministic titles without LLM — used with --no-llm flag or as
   * ultimate fallback when the pipeline fails after all retries.
   */
  static autoTitle(plans: TestCasePlan[], endpoint: EndpointModel): EnrichedPlan[] {
    return plans.map((plan) => ({
      planId: plan.id,
      title: `${endpoint.method} ${endpoint.path} — ${plan.kind}`,
    }));
  }

  async enrich(plans: TestCasePlan[], endpoint: EndpointModel): Promise<EnrichedPlan[]> {
    if (plans.length === 0) return [];

    const input: EnricherInput = {
      method: endpoint.method,
      path: endpoint.path,
      summary: endpoint.summary ?? `${endpoint.method} ${endpoint.path}`,
      plans: plans.map((p) => ({
        planId: p.id,
        kind: p.kind,
        mutationKind: p.mutation?.kind,
        mutationPath: p.mutation?.path,
      })),
    };

    const inputPlanIds = new Set(plans.map((p) => p.id));

    try {
      const raw = await this.pipeline.run(input);
      // Keep only planIds that belong to this call and have valid title lengths
      const valid = raw.filter(
        (ep) => inputPlanIds.has(ep.planId) && ep.title.length >= 5 && ep.title.length <= 80,
      );
      if (valid.length === plans.length) return valid;
      // Fill any planIds the LLM omitted or that failed post-validation
      return this.fillMissing(plans, endpoint, valid);
    } catch {
      return ScenarioEnricher.autoTitle(plans, endpoint);
    }
  }

  private fillMissing(
    plans: TestCasePlan[],
    endpoint: EndpointModel,
    partial: EnrichedPlan[],
  ): EnrichedPlan[] {
    const map = new Map(partial.map((ep) => [ep.planId, ep]));
    return plans.map(
      (plan) =>
        map.get(plan.id) ?? {
          planId: plan.id,
          title: `${endpoint.method} ${endpoint.path} — ${plan.kind}`,
        },
    );
  }
}
