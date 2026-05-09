import * as crypto from 'node:crypto';
import * as path from 'node:path';

import { z } from 'zod';

import { SwaggerGroup, SwaggerParserResult } from '../../api/swagger/SwaggerParser';

import { createApiPostValidate } from './ApiPostValidator';
import { GenerationCache } from './GenerationCache';
import { GenerationPipeline, PipelineConfig, RunOpts } from './GenerationPipeline';
import { GoldenExampleLoader } from './GoldenExampleLoader';

// ─── I/O types ───────────────────────────────────────────────────────────────

export interface SwaggerToApiInput {
  group: SwaggerGroup;
  baseUrl: string;
  /** Root dir for service files — defaults to <cwd>/src/api */
  outputDir?: string;
  /** Dir for test files — defaults to <cwd>/tests/api/smoke */
  testOutputDir?: string;
}

const outputSchema = z.object({
  serviceTs: z.string().min(1),
  testTs: z.string().min(1),
});

export type SwaggerToApiOutput = z.infer<typeof outputSchema>;

// ─── Agent deps (injectable for unit tests) ───────────────────────────────────

interface AgentDeps {
  pipeline?: GenerationPipeline<SwaggerToApiInput, SwaggerToApiOutput>;
  goldenLoader?: GoldenExampleLoader;
  postValidate?: (files: SwaggerToApiOutput) => Promise<string[]>;
}

// ─── Endpoint shape passed to the Mustache template ──────────────────────────

interface TemplateEndpoint {
  operationId: string;
  method: string;
  path: string;
  summary: string;
  hasPathParams: boolean;
  pathParams: Array<{ name: string; description?: string }>;
  hasQueryParams: boolean;
  queryParams: Array<{ name: string; required: boolean; description?: string }>;
  hasRequestBody: boolean;
  requestBodyExample: string;
  requestBodySchema: string;
  successStatus: number;
  responseSchema: string;
  isReadOnly: boolean;
  deprecated: boolean;
}

// ─── Pipeline config builder ──────────────────────────────────────────────────

function buildConfig(
  deps: AgentDeps,
  goldenLoader: GoldenExampleLoader,
): PipelineConfig<SwaggerToApiInput, SwaggerToApiOutput> {
  return {
    agentName: 'swagger-to-api',
    promptTemplate: 'swagger-to-api',
    outputSchema,

    inputHasher: (input) =>
      crypto
        .createHash('sha256')
        .update(`${input.group.groupName}:${JSON.stringify(input.group.endpoints)}`)
        .digest('hex'),

    contextBuilder: async (input) => {
      const { group, baseUrl } = input;

      const templateEndpoints: TemplateEndpoint[] = group.endpoints.map((ep) => {
        const pathParams = ep.parameters.filter((p) => p.in === 'path');
        const queryParams = ep.parameters.filter((p) => p.in === 'query');
        const successResponse = ep.responses.find((r) => r.statusCode >= 200 && r.statusCode < 300);

        return {
          operationId: ep.operationId,
          method: ep.method,
          path: ep.path,
          summary: ep.summary ?? `${ep.method} ${ep.path}`,
          hasPathParams: pathParams.length > 0,
          pathParams: pathParams.map((p) => ({ name: p.name, description: p.description })),
          hasQueryParams: queryParams.length > 0,
          queryParams: queryParams.map((p) => ({
            name: p.name,
            required: p.required,
            description: p.description,
          })),
          hasRequestBody: !!ep.requestBody,
          requestBodyExample: ep.requestBody?.example
            ? JSON.stringify(ep.requestBody.example)
            : '{}',
          requestBodySchema: ep.requestBody?.schema
            ? JSON.stringify(ep.requestBody.schema, null, 2)
            : '{}',
          successStatus: successResponse?.statusCode ?? 200,
          responseSchema: successResponse?.schema
            ? JSON.stringify(successResponse.schema, null, 2)
            : '{}',
          isReadOnly: ep.method === 'GET' || ep.method === 'HEAD',
          deprecated: ep.deprecated,
        };
      });

      return {
        groupName: group.groupName,
        tagSlug: group.tagSlug,
        baseUrl,
        endpointCount: group.endpoints.length,
        // Serialize endpoints as compact JSON string for the Mustache triple-stache (no escaping)
        endpointsJson: JSON.stringify(templateEndpoints, null, 2),
        goldenServiceTs: goldenLoader.load('service'),
        goldenTestTs: goldenLoader.load('test'),
      };
    },

    outputMapper: (input, files) => {
      const outputDir = input.outputDir ?? path.join(process.cwd(), 'src', 'api');
      const testOutputDir =
        input.testOutputDir ?? path.join(process.cwd(), 'tests', 'api', 'smoke');
      const { groupName, tagSlug } = input.group;

      return {
        [path.join(outputDir, 'services', `${groupName}Service.ts`)]: files.serviceTs,
        [path.join(testOutputDir, `${tagSlug}.test.ts`)]: files.testTs,
      };
    },

    postValidate: deps.postValidate ?? createApiPostValidate(),
  };
}

// ─── SwaggerToApiAgent ────────────────────────────────────────────────────────

/**
 * Generates a typed Service class + CodeceptJS API test file for a group of
 * Swagger/OpenAPI endpoints. Mirrors CurlToApiAgent but operates on batches
 * of endpoints grouped by tag instead of a single cURL command.
 *
 * Use `runAll()` to process every group in a parsed swagger spec at once.
 */
export class SwaggerToApiAgent {
  private readonly pipeline: GenerationPipeline<SwaggerToApiInput, SwaggerToApiOutput>;

  constructor(deps: AgentDeps = {}) {
    const goldenLoader = deps.goldenLoader ?? new GoldenExampleLoader();
    const config = buildConfig(deps, goldenLoader);
    this.pipeline =
      deps.pipeline ??
      new GenerationPipeline(config, {
        cache: new GenerationCache(),
      });
  }

  /** Generate Service + Test for a single endpoint group. */
  async run(input: SwaggerToApiInput, opts: RunOpts = {}): Promise<SwaggerToApiOutput> {
    return this.pipeline.run(input, opts);
  }

  /**
   * Generate Service + Test for ALL groups from a parsed swagger result.
   * Runs sequentially to respect rate limits — ~8s per group.
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
        },
        runOpts,
      );

      results.set(group.groupName, output);
      onGroupDone?.(group.groupName, output);
    }

    return results;
  }
}
