/**
 * OpenApiSuiteAgent — generate a typed service file + test suite from an OpenAPI spec.
 *
 * For each tag:
 *   - Service file: deterministic (ServiceTemplate, no LLM)
 *   - Test file: LLM batch call via GenerationPipeline
 *
 * Output is written to:
 *   src/api/services/_generated/{Tag}Service.ts
 *   tests/api/_generated/{tag}.test.ts
 */
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

import type { OpenAPIObject } from 'openapi3-ts';
import { z } from 'zod';

import { GenerationCache } from './GenerationCache';
import { GenerationPipeline, PipelineConfig, RunOpts } from './GenerationPipeline';
import {
  parseOperations,
  groupByTag,
  type Operation,
  type ParseOptions,
} from './openapi/OperationParser';
import { renderServiceFile } from './openapi/ServiceTemplate';

// ─── types ────────────────────────────────────────────────────────────────────

export interface SuiteInput {
  openApiDoc: OpenAPIObject;
  filterOpts?: ParseOptions;
  outServices?: string;
  outTests?: string;
  schemasImportPath?: string;
}

const scenarioSchema = z.object({
  name: z.string().min(1),
  type: z.enum(['happy', 'schema', 'sla', 'array', '404', '400', '401']),
  body: z.string().min(1),
});

const tagOutputSchema = z.object({
  operations: z.array(
    z.object({
      operationId: z.string(),
      scenarios: z.array(scenarioSchema),
    }),
  ),
  testTs: z.string().min(1),
});

type TagOutput = z.infer<typeof tagOutputSchema>;

export interface SuiteResult {
  tag: string;
  serviceFile: string;
  testFile: string;
  serviceTs: string;
  testTs: string;
}

export interface AgentDeps {
  pipeline?: GenerationPipeline<TagBatchInput, TagOutput>;
  cache?: GenerationCache;
}

interface TagBatchInput {
  tag: string;
  operations: Operation[];
  schemasImportPath: string;
}

// ─── pipeline config ──────────────────────────────────────────────────────────

function buildPipelineConfig(
  outTests: string,
  deps: AgentDeps,
): PipelineConfig<TagBatchInput, TagOutput> {
  return {
    agentName: 'openapi-test-suite',
    promptTemplate: 'openapi-test-suite',
    outputSchema: tagOutputSchema,

    inputHasher: (input) =>
      crypto
        .createHash('sha256')
        .update(input.tag + JSON.stringify(input.operations))
        .digest('hex'),

    contextBuilder: async (input) => {
      const serviceClass = toPascalCase(input.tag) + 'Service';
      const operationsSummary = input.operations
        .map((op) => {
          const params = op.parameters.map((p) => `${p.in}:${p.name}`).join(', ');
          const security = op.security ? ' [secured]' : '';
          const deprecated = op.deprecated ? ' [deprecated]' : '';
          return `  - ${op.method} ${op.path} (${op.operationId})${security}${deprecated} | params: ${params || 'none'} | response: ${op.responseRef ?? 'unknown'}`;
        })
        .join('\n');

      return {
        tag: input.tag,
        serviceClass,
        schemasImport: input.schemasImportPath,
        operationsSummary,
      };
    },

    outputMapper: (input, output) => ({
      [path.join(outTests, `${input.tag}.test.ts`)]: output.testTs,
    }),

    postValidate: deps.pipeline ? undefined : undefined,
  };
}

// ─── agent ────────────────────────────────────────────────────────────────────

export class OpenApiSuiteAgent {
  private readonly cache: GenerationCache;
  private readonly deps: AgentDeps;

  constructor(deps: AgentDeps = {}) {
    this.deps = deps;
    this.cache = deps.cache ?? new GenerationCache();
  }

  async run(input: SuiteInput, opts: RunOpts = {}): Promise<SuiteResult[]> {
    const outServices = path.resolve(
      process.cwd(),
      input.outServices ?? path.join('src', 'api', 'services', '_generated'),
    );
    const outTests = path.resolve(
      process.cwd(),
      input.outTests ?? path.join('tests', 'api', '_generated'),
    );
    const schemasImportPath = input.schemasImportPath ?? '@api/schemas/_generated';

    const operations = parseOperations(input.openApiDoc, input.filterOpts ?? {});
    const grouped = groupByTag(operations);

    const results: SuiteResult[] = [];

    for (const [tag, tagOps] of grouped.entries()) {
      // 1. Service file — deterministic, no LLM
      const serviceTs = renderServiceFile({ tag, operations: tagOps, schemasImportPath });
      const serviceFile = path.join(outServices, `${toPascalCase(tag)}Service.ts`);

      if (!opts.dryRun) {
        fs.mkdirSync(outServices, { recursive: true });
        fs.writeFileSync(serviceFile, serviceTs, 'utf8');
      }

      // 2. Test file — LLM batch per tag
      const pipeline: GenerationPipeline<TagBatchInput, TagOutput> =
        this.deps.pipeline ??
        new GenerationPipeline(buildPipelineConfig(outTests, this.deps), {
          cache: this.cache,
        });

      const batchInput: TagBatchInput = { tag, operations: tagOps, schemasImportPath };
      const tagOutput = await pipeline.run(batchInput, opts);

      const testFile = path.join(outTests, `${tag}.test.ts`);

      results.push({
        tag,
        serviceFile,
        testFile,
        serviceTs,
        testTs: tagOutput.testTs,
      });
    }

    return results;
  }
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function toPascalCase(s: string): string {
  return s
    .split(/[-_\s]/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}
