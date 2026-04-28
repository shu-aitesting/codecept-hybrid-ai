import * as fs from 'node:fs';
import * as path from 'node:path';

import { z } from 'zod';

import { PromptLibrary } from '../prompts/PromptLibrary';
import { StructuredOutputParser } from '../providers/StructuredOutputParser';
import { TaskAwareRouter } from '../providers/TaskAwareRouter';
import { ChatMessage } from '../providers/types';

import { GenerationCache, GeneratedFiles } from './GenerationCache';

export class GenerationFailedError extends Error {
  constructor(
    public readonly validationErrors: string[],
    message: string,
  ) {
    super(message);
    this.name = 'GenerationFailedError';
  }
}

export interface PipelineConfig<TIn, TOut extends object> {
  agentName: string;
  /** Name of the prompt template (without .prompt.md extension). */
  promptTemplate: string;
  outputSchema: z.ZodSchema<TOut>;
  /** Deterministic hash of the input — cache key. */
  inputHasher: (input: TIn) => string;
  /** Build Mustache template variables from the raw input. */
  contextBuilder: (input: TIn) => Promise<Record<string, unknown>>;
  /**
   * Map generated files to disk paths. When provided and `dryRun` is false,
   * the pipeline writes files before returning.
   */
  outputMapper?: (input: TIn, files: TOut) => object;
  /**
   * Validate generated code (e.g. tsc). Returns an array of error strings.
   * Empty array → success. On failure the pipeline appends errors to the
   * conversation and retries.
   */
  postValidate?: (files: TOut) => Promise<string[]>;
}

export interface RunOpts {
  dryRun?: boolean;
  skipCache?: boolean;
  maxRetries?: number;
}

interface PipelineDeps {
  router?: TaskAwareRouter;
  cache?: GenerationCache;
  prompts?: PromptLibrary;
  parser?: StructuredOutputParser;
}

/**
 * Shared generation pipeline used by all codegen agents.
 *
 * Flow: cache lookup → context build → LLM call → parse JSON → post-validate
 * (e.g. tsc) → retry-with-errors if validation fails → write files → cache.
 */
export class GenerationPipeline<TIn, TOut extends object> {
  private readonly config: PipelineConfig<TIn, TOut>;
  private readonly router: TaskAwareRouter;
  private readonly cache: GenerationCache;
  private readonly prompts: PromptLibrary;
  private readonly parser: StructuredOutputParser;

  constructor(config: PipelineConfig<TIn, TOut>, deps: PipelineDeps = {}) {
    this.config = config;
    this.router = deps.router ?? new TaskAwareRouter('codegen');
    this.cache = deps.cache ?? new GenerationCache();
    this.prompts = deps.prompts ?? new PromptLibrary();
    this.parser = deps.parser ?? new StructuredOutputParser();
  }

  async run(input: TIn, opts: RunOpts = {}): Promise<TOut> {
    const hash = this.config.inputHasher(input);

    // Cache lookup — skip on first call if skipCache
    if (!opts.skipCache) {
      const cached = this.cache.lookup(this.config.agentName, hash);
      if (cached) {
        const validation = this.config.outputSchema.safeParse(cached);
        if (validation.success) return validation.data;
        // Stale cache entry (schema changed) — fall through to regenerate
      }
    }

    // Build Mustache context from input
    const ctx = await this.config.contextBuilder(input);

    // Load initial chat messages
    const baseMessages = this.prompts.loadChatMessages(this.config.promptTemplate, ctx, {
      cacheSystem: true,
    });

    const maxRetries = opts.maxRetries ?? 2;
    let messages: ChatMessage[] = baseMessages;
    let lastFiles: TOut | null = null;
    let lastErrors: string[] = [];
    let lastRawText = '';

    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      const llmResult = await this.router.chat(messages, {}, { agentName: this.config.agentName });
      lastRawText = llmResult.text;

      const parsed = await this.parser.parse(llmResult.text, {
        schema: this.config.outputSchema,
        llmFix: async (errMsg, rawText) => {
          const fixMessages: ChatMessage[] = [
            ...messages,
            { role: 'assistant', content: rawText },
            {
              role: 'user',
              content: `JSON validation failed: ${errMsg}. Return corrected JSON only, no markdown.`,
            },
          ];
          const fix = await this.router.chat(
            fixMessages,
            { temperature: 0 },
            { agentName: this.config.agentName },
          );
          return fix.text;
        },
        maxFixRetries: 1,
      });

      lastFiles = parsed;
      lastErrors = [];

      if (this.config.postValidate) {
        lastErrors = await this.config.postValidate(parsed);
        if (lastErrors.length === 0) break;

        // Retry with errors appended — LLM gets a chance to fix its output.
        if (attempt < maxRetries) {
          messages = [
            ...messages,
            { role: 'assistant', content: lastRawText },
            {
              role: 'user',
              content: `Fix these TypeScript errors and return corrected JSON only:\n${lastErrors.join('\n')}`,
            },
          ];
        }
      } else {
        break;
      }
    }

    if (lastErrors.length > 0) {
      throw new GenerationFailedError(
        lastErrors,
        `[${this.config.agentName}] Generation failed after ${maxRetries + 1} attempt(s): ${lastErrors[0]}`,
      );
    }

    if (!lastFiles) {
      throw new GenerationFailedError([], `[${this.config.agentName}] No output produced`);
    }

    // Write files to disk (unless dry-run or no mapper)
    if (!opts.dryRun && this.config.outputMapper) {
      const fileMap = this.config.outputMapper(input, lastFiles);
      for (const [filePath, content] of Object.entries(fileMap)) {
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, content, 'utf8');
      }
    }

    // Store in idempotency cache
    this.cache.store(this.config.agentName, hash, lastFiles as unknown as GeneratedFiles);

    return lastFiles;
  }
}
