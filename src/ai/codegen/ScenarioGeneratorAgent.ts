import * as crypto from 'node:crypto';
import * as path from 'node:path';

import { z } from 'zod';

import { GenerationCache } from './GenerationCache';
import { GenerationPipeline, PipelineConfig, RunOpts } from './GenerationPipeline';

export interface ScenarioGeneratorInput {
  userStory: string;
  featureName: string;
  outputDir: string;
}

const outputSchema = z.object({
  featureFile: z.string().min(1),
  stepsTs: z.string().min(1),
});

export type ScenarioGeneratorOutput = z.infer<typeof outputSchema>;

interface AgentDeps {
  pipeline?: GenerationPipeline<ScenarioGeneratorInput, ScenarioGeneratorOutput>;
  postValidate?: (files: ScenarioGeneratorOutput) => Promise<string[]>;
}

function buildConfig(deps: AgentDeps): PipelineConfig<ScenarioGeneratorInput, ScenarioGeneratorOutput> {
  return {
    agentName: 'scenario-gen',
    promptTemplate: 'scenario-gen',
    outputSchema,

    inputHasher: (input) =>
      crypto
        .createHash('sha256')
        .update(`${input.featureName}:${input.userStory}`)
        .digest('hex'),

    contextBuilder: async (input) => ({
      featureName: input.featureName,
      userStory: input.userStory,
    }),

    outputMapper: (input, files) => {
      const kebab = input.featureName.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
      return {
        [path.join(input.outputDir, `${kebab}.feature`)]: files.featureFile,
        [path.join(input.outputDir, `${kebab}.steps.ts`)]: files.stepsTs,
      };
    },

    postValidate: deps.postValidate,
  };
}

/**
 * Converts a user story into a Gherkin feature file + TypeScript step
 * definition skeleton. Prompt enforces ≥1 happy path, ≥3 negative cases,
 * ≥2 boundary cases — covering what BA specs typically miss.
 */
export class ScenarioGeneratorAgent {
  private readonly pipeline: GenerationPipeline<ScenarioGeneratorInput, ScenarioGeneratorOutput>;

  constructor(deps: AgentDeps = {}) {
    const config = buildConfig(deps);
    this.pipeline =
      deps.pipeline ??
      new GenerationPipeline(config, {
        cache: new GenerationCache(),
      });
  }

  async run(
    input: ScenarioGeneratorInput,
    opts: RunOpts = {},
  ): Promise<ScenarioGeneratorOutput> {
    return this.pipeline.run(input, opts);
  }
}
