import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { z } from 'zod';

import { TaskAwareRouter } from '@ai/providers/TaskAwareRouter';
import type { LLMProvider } from '@ai/providers/types';

interface CacheEntry<T> {
  prompt: string;
  count: number;
  items: T[];
  generatedAt: string;
}

export interface GeneratorOptions {
  /** Re-use a cached result when the same (prompt, count) was already generated. Default: true. */
  useCache?: boolean;
  /** Override directory where cache JSON files are stored. */
  cacheDir?: string;
  /**
   * Inject an LLM provider — useful in unit tests to avoid real API calls.
   * When omitted a TaskAwareRouter('data-gen') is used.
   */
  provider?: LLMProvider;
}

/**
 * Generate test data via LLM from a natural-language prompt, then validate
 * every item against a Zod schema.
 *
 * Results are written to `output/data-cache/<hash>.json` so consecutive runs
 * with the same (prompt, count) are deterministic without hitting the API.
 *
 * Example:
 *   const gen = new AIDataGenerator();
 *   const users = await gen.generate(
 *     'edge-case Vietnamese user registrations with Unicode names',
 *     UserSchema,
 *     5,
 *   );
 */
export class AIDataGenerator {
  private readonly cacheDir: string;
  private readonly provider: LLMProvider | null;

  constructor(opts: GeneratorOptions = {}) {
    this.cacheDir = opts.cacheDir ?? path.join('output', 'data-cache');
    this.provider = opts.provider ?? null;
    fs.mkdirSync(this.cacheDir, { recursive: true });
  }

  async generate<T>(
    prompt: string,
    schema: z.ZodSchema<T>,
    count = 5,
    opts: Pick<GeneratorOptions, 'useCache'> = {},
  ): Promise<T[]> {
    const useCache = opts.useCache ?? true;
    const cacheKey = this.hashKey(prompt, count);
    const cachePath = path.join(this.cacheDir, `${cacheKey}.json`);

    if (useCache && fs.existsSync(cachePath)) {
      const raw = JSON.parse(fs.readFileSync(cachePath, 'utf-8')) as CacheEntry<unknown>;
      return raw.items.map((item) => schema.parse(item));
    }

    const items = await this.callLlm(prompt, count, schema);

    if (useCache) {
      const entry: CacheEntry<T> = {
        prompt,
        count,
        items,
        generatedAt: new Date().toISOString(),
      };
      fs.writeFileSync(cachePath, JSON.stringify(entry, null, 2), 'utf-8');
    }

    return items;
  }

  /** Remove all cached JSON files produced by this generator instance. */
  clearCache(): void {
    if (!fs.existsSync(this.cacheDir)) return;
    for (const f of fs.readdirSync(this.cacheDir)) {
      if (f.endsWith('.json')) {
        fs.unlinkSync(path.join(this.cacheDir, f));
      }
    }
  }

  // ─── private ──────────────────────────────────────────────────────────────

  private async callLlm<T>(prompt: string, count: number, schema: z.ZodSchema<T>): Promise<T[]> {
    const provider = this.provider ?? new TaskAwareRouter('data-gen');

    const systemMsg =
      'You are a test-data generator. Generate realistic, edge-case data as a JSON array. ' +
      'Respond ONLY with valid JSON — no markdown fences, no explanation, no trailing text.';

    const userMsg =
      `Generate ${count} items for: ${prompt}\n\n` +
      'Return a top-level JSON array of objects. Example: [{"field":"value"}, ...]';

    const result = await provider.chat([
      { role: 'system', content: systemMsg },
      { role: 'user', content: userMsg },
    ]);

    const items = this.parseJsonArray(result.text);

    // Validate every item; collect all validation errors before throwing
    const errors: string[] = [];
    const validated: T[] = [];
    for (let i = 0; i < items.length; i++) {
      const parsed = schema.safeParse(items[i]);
      if (parsed.success) {
        validated.push(parsed.data);
      } else {
        errors.push(`item[${i}]: ${parsed.error.message}`);
      }
    }

    if (errors.length > 0) {
      throw new AIDataValidationError(
        `AIDataGenerator: ${errors.length}/${items.length} items failed schema validation:\n${errors.join('\n')}`,
        errors,
      );
    }

    return validated;
  }

  private parseJsonArray(raw: string): unknown[] {
    const text = raw.trim();

    // Strip optional markdown fences the model might still add
    const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    const json = fence ? fence[1].trim() : text;

    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch (err) {
      throw new AIDataParseError(
        `AIDataGenerator: LLM returned non-JSON output. Raw (first 300 chars): ${text.slice(0, 300)}`,
        text,
      );
    }

    if (Array.isArray(parsed)) return parsed;

    // Some models wrap in { items: [...] } or { data: [...] }
    if (parsed && typeof parsed === 'object') {
      const obj = parsed as Record<string, unknown>;
      const list = obj['items'] ?? obj['data'] ?? obj['results'];
      if (Array.isArray(list)) return list;
    }

    throw new AIDataParseError(
      `AIDataGenerator: expected JSON array but got: ${typeof parsed}`,
      text,
    );
  }

  private hashKey(prompt: string, count: number): string {
    return crypto.createHash('sha256').update(`${prompt}::${count}`).digest('hex').slice(0, 16);
  }
}

// ─── error types ─────────────────────────────────────────────────────────────

export class AIDataParseError extends Error {
  constructor(
    message: string,
    public readonly rawOutput: string,
  ) {
    super(message);
    this.name = 'AIDataParseError';
  }
}

export class AIDataValidationError extends Error {
  constructor(
    message: string,
    public readonly fieldErrors: string[],
  ) {
    super(message);
    this.name = 'AIDataValidationError';
  }
}
