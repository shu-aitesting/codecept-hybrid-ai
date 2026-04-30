import * as crypto from 'node:crypto';
import * as path from 'node:path';

import { z } from 'zod';

import { GenerationCache } from './GenerationCache';
import { GenerationPipeline, PipelineConfig, RunOpts } from './GenerationPipeline';
import { GoldenExampleLoader } from './GoldenExampleLoader';

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
  goldenLoader?: GoldenExampleLoader;
  postValidate?: (files: ScenarioGeneratorOutput) => Promise<string[]>;
}

function buildConfig(
  deps: AgentDeps,
  goldenLoader: GoldenExampleLoader,
): PipelineConfig<ScenarioGeneratorInput, ScenarioGeneratorOutput> {
  return {
    agentName: 'scenario-gen',
    promptTemplate: 'scenario-gen',
    outputSchema,

    inputHasher: (input) =>
      crypto.createHash('sha256').update(`${input.featureName}:${input.userStory}`).digest('hex'),

    contextBuilder: async (input) => ({
      featureName: input.featureName,
      userStory: input.userStory,
      goldenStepsTs: goldenLoader.load('steps'),
    }),

    outputMapper: (input, files) => {
      const kebab = input.featureName.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
      return {
        [path.join(input.outputDir, `${kebab}.test.ts`)]: files.featureFile,
        [path.join(process.cwd(), 'src', 'ui', 'steps', `${input.featureName}Steps.ts`)]:
          files.stepsTs,
      };
    },

    postValidate: deps.postValidate,
  };
}

/**
 * Converts a user story into a CodeceptJS test file + Step Object skeleton.
 * Prompt enforces ≥1 happy path, ≥3 negative cases, ≥2 boundary cases —
 * covering what BA specs typically miss.
 */
export class ScenarioGeneratorAgent {
  private readonly pipeline: GenerationPipeline<ScenarioGeneratorInput, ScenarioGeneratorOutput>;

  constructor(deps: AgentDeps = {}) {
    const goldenLoader = deps.goldenLoader ?? new GoldenExampleLoader();
    const config = buildConfig(deps, goldenLoader);
    this.pipeline =
      deps.pipeline ??
      new GenerationPipeline(config, {
        cache: new GenerationCache(),
      });
  }

  async run(input: ScenarioGeneratorInput, opts: RunOpts = {}): Promise<ScenarioGeneratorOutput> {
    return this.pipeline.run(input, opts);
  }
}
