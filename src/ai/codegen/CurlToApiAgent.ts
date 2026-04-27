import * as crypto from 'node:crypto';
import * as path from 'node:path';

import { z } from 'zod';

import { CurlConverter } from '../../api/rest/CurlConverter';
import { RestMethod } from '../../api/rest/RestMethod';

import { GenerationCache } from './GenerationCache';
import { GenerationPipeline, PipelineConfig, RunOpts } from './GenerationPipeline';

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

interface AgentDeps {
  pipeline?: GenerationPipeline<CurlToApiInput, CurlToApiOutput>;
  postValidate?: (files: CurlToApiOutput) => Promise<string[]>;
}

function inferEndpointDescription(method: RestMethod, url: string): string {
  const segments = url.split('/').filter(Boolean).filter((s) => !s.startsWith('http'));
  const resource = segments[segments.length - 1] ?? 'resource';
  const verbMap: Partial<Record<RestMethod, string>> = {
    [RestMethod.GET]: 'Retrieve',
    [RestMethod.POST]: 'Create',
    [RestMethod.PUT]: 'Update',
    [RestMethod.PATCH]: 'Partially update',
    [RestMethod.DELETE]: 'Delete',
  };
  return `${verbMap[method] ?? 'Interact with'} ${resource}`;
}

function buildConfig(deps: AgentDeps): PipelineConfig<CurlToApiInput, CurlToApiOutput> {
  return {
    agentName: 'curl-to-api',
    promptTemplate: 'curl-to-api',
    outputSchema,

    inputHasher: (input) =>
      crypto
        .createHash('sha256')
        .update(`${input.serviceName}:${input.curl}`)
        .digest('hex'),

    contextBuilder: async (input) => {
      const req = CurlConverter.fromCurl(input.curl);
      return {
        serviceName: input.serviceName,
        method: req.method,
        url: req.url,
        headers: JSON.stringify(req.headers),
        body: req.body ? JSON.stringify(req.body) : '{}',
        endpointDescription: inferEndpointDescription(req.method, req.url),
      };
    },

    outputMapper: (input, files) => ({
      [path.join(input.outputDir, 'services', `${input.serviceName}Service.ts`)]: files.serviceTs,
      [path.join(process.cwd(), 'tests', 'api', `${input.serviceName.toLowerCase()}-service.test.ts`)]: files.testTs,
    }),

    postValidate: deps.postValidate,
  };
}

/**
 * Converts a cURL command into a typed Service class + API test file.
 * `CurlConverter` (deterministic, 100% accurate) handles parsing; the LLM
 * only invents method names, doc comments, and test scenarios.
 */
export class CurlToApiAgent {
  private readonly pipeline: GenerationPipeline<CurlToApiInput, CurlToApiOutput>;

  constructor(deps: AgentDeps = {}) {
    const config = buildConfig(deps);
    this.pipeline =
      deps.pipeline ??
      new GenerationPipeline(config, {
        cache: new GenerationCache(),
      });
  }

  async run(input: CurlToApiInput, opts: RunOpts = {}): Promise<CurlToApiOutput> {
    return this.pipeline.run(input, opts);
  }
}
