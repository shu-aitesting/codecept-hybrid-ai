import { z } from 'zod';

interface ParseOpts<T> {
  schema: z.ZodSchema<T>;
  /**
   * Optional fix-up callback. When parsing fails, the parser invokes this
   * with the validation error message and expects a corrected JSON string
   * back. Up to `maxFixRetries` attempts.
   */
  llmFix?: (errorMessage: string, lastRaw: string) => Promise<string>;
  maxFixRetries?: number;
}

export class StructuredOutputParser {
  /**
   * Parse `rawText` (typically a model's chat completion) into a value that
   * matches `schema`. Strips ```json fences``` and surrounding chatter
   * before validation. If validation fails and `llmFix` is provided, the
   * parser asks the model to fix the JSON given the error.
   */
  async parse<T>(rawText: string, opts: ParseOpts<T>): Promise<T> {
    const maxFixes = opts.maxFixRetries ?? 2;
    let raw = rawText;
    let lastError = '';

    for (let attempt = 0; attempt <= maxFixes; attempt += 1) {
      const candidate = this.extractJson(raw);
      if (!candidate) {
        lastError = 'no JSON object found in model output';
      } else {
        try {
          const json = JSON.parse(candidate);
          const result = opts.schema.safeParse(json);
          if (result.success) return result.data;
          lastError = result.error.errors
            .map((e) => `${e.path.join('.') || '<root>'}: ${e.message}`)
            .join('; ');
        } catch (e) {
          lastError = e instanceof Error ? e.message : String(e);
        }
      }
      if (attempt === maxFixes || !opts.llmFix) {
        throw new Error(
          `StructuredOutputParser failed after ${attempt + 1} attempts: ${lastError}`,
        );
      }
      raw = await opts.llmFix(lastError, raw);
    }
    throw new Error(`unreachable: ${lastError}`);
  }

  /** Pull the first JSON object/array from arbitrary text. */
  extractJson(text: string): string | null {
    if (!text) return null;
    const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const body = fence ? fence[1] : text;
    return this.findBalanced(body);
  }

  private findBalanced(text: string): string | null {
    const startIdx = text.search(/[{[]/);
    if (startIdx === -1) return null;
    const opener = text[startIdx];
    const closer = opener === '{' ? '}' : ']';
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = startIdx; i < text.length; i += 1) {
      const ch = text[i];
      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (ch === '\\') {
          escaped = true;
        } else if (ch === '"') {
          inString = false;
        }
        continue;
      }
      if (ch === '"') {
        inString = true;
        continue;
      }
      if (ch === opener) depth += 1;
      else if (ch === closer) {
        depth -= 1;
        if (depth === 0) return text.slice(startIdx, i + 1);
      }
    }
    return null;
  }
}
