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
      if (candidate) {
        const outcome = this.parseCandidate(candidate, opts.schema);
        if ('data' in outcome) return outcome.data;
        lastError = outcome.error;
      } else {
        lastError = 'no JSON object found in model output';
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
    const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
    const body = fence ? fence[1] : text;
    const balanced = this.findBalanced(body);
    if (!balanced) return null;
    return this.normalizeBacktickStrings(balanced);
  }

  /**
   * LLMs sometimes emit backtick template literals instead of valid JSON
   * double-quoted strings, e.g. `"serviceTs": `import { ... }`` .
   * Converts any backtick-delimited strings (outside existing JSON strings)
   * into properly escaped JSON double-quoted strings.
   */
  private normalizeBacktickStrings(json: string): string {
    let result = '';
    let i = 0;
    while (i < json.length) {
      const ch = json[i];
      if (ch === '"') {
        const [str, next] = this.consumeJsonString(json, i);
        result += str;
        i = next;
      } else if (ch === '`' && json.startsWith('```', i)) {
        // Triple-backtick code fence — consume until matching ```
        const [str, next] = this.consumeTripleBacktickString(json, i + 3);
        result += str;
        i = next;
      } else if (ch === '`') {
        const [str, next] = this.consumeBacktickString(json, i + 1);
        result += str;
        i = next;
      } else {
        result += ch;
        i++;
      }
    }
    return result;
  }

  /**
   * Consume a triple-backtick code fence (opening ``` already skipped).
   * Skips an optional language tag (e.g. "typescript"), then collects content
   * until the closing ``` and returns it as an escaped JSON double-quoted string.
   */
  private consumeTripleBacktickString(json: string, contentStart: number): [string, number] {
    let i = contentStart;
    // Skip optional language hint on the opening line (e.g. "typescript\n")
    while (i < json.length && json[i] !== '\n' && !json.startsWith('```', i)) {
      i++;
    }
    if (i < json.length && json[i] === '\n') i++;

    let content = '';
    while (i < json.length) {
      if (json.startsWith('```', i)) {
        i += 3;
        break;
      }
      content += json[i];
      i++;
    }
    return [`"${this.escapeForJson(content)}"`, i];
  }

  /**
   * Copy a JSON double-quoted string, honouring escape sequences and escaping
   * any literal control characters (e.g. raw newlines) that LLMs sometimes
   * emit directly inside string values.
   */
  private consumeJsonString(json: string, start: number): [string, number] {
    let out = json[start]; // opening "
    let i = start + 1;
    while (i < json.length) {
      const c = json[i];
      if (c === '\\') {
        out += c;
        i++;
        if (i < json.length) {
          out += json[i];
          i++;
        }
      } else if (c === '"') {
        out += c;
        return [out, i + 1];
      } else if (c === '\n') {
        out += String.raw`\n`;
        i++;
      } else if (c === '\r') {
        out += String.raw`\r`;
        i++;
      } else if (c === '\t') {
        out += String.raw`\t`;
        i++;
      } else {
        out += c;
        i++;
      }
    }
    return [out, i];
  }

  /** Collect a backtick string and return it as an escaped JSON string. */
  private consumeBacktickString(json: string, contentStart: number): [string, number] {
    let content = '';
    let i = contentStart;
    while (i < json.length) {
      if (json[i] === '\\' && i + 1 < json.length) {
        const next = json[i + 1];
        if (next === '`') {
          content += '`';
          i += 2;
          continue;
        } // \` → literal backtick
        if (next === '$') {
          content += '$';
          i += 2;
          continue;
        } // \$ → literal dollar sign
        if (next === '\\') {
          content += '\\';
          i += 2;
          continue;
        } // \\ → literal backslash
      }
      if (json[i] === '`') break;
      content += json[i];
      i++;
    }
    return [`"${this.escapeForJson(content)}"`, i + 1];
  }

  private escapeForJson(s: string): string {
    return s
      .replaceAll('\\', String.raw`\\`)
      .replaceAll('"', String.raw`\"`)
      .replaceAll('\n', String.raw`\n`)
      .replaceAll('\r', String.raw`\r`)
      .replaceAll('\t', String.raw`\t`);
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
        ({ escaped, inString } = this.advanceInString(ch, escaped));
        continue;
      }
      if (ch === '"') {
        inString = true;
        continue;
      }
      if (ch === opener) {
        depth += 1;
      } else if (ch === closer) {
        depth -= 1;
        if (depth === 0) return text.slice(startIdx, i + 1);
      }
    }
    return null;
  }

  private advanceInString(ch: string, escaped: boolean): { escaped: boolean; inString: boolean } {
    if (escaped) return { escaped: false, inString: true };
    if (ch === '\\') return { escaped: true, inString: true };
    if (ch === '"') return { escaped: false, inString: false };
    return { escaped: false, inString: true };
  }

  private parseCandidate<T>(
    candidate: string,
    schema: z.ZodSchema<T>,
  ): { data: T } | { error: string } {
    try {
      const json = JSON.parse(candidate);
      const result = schema.safeParse(json);
      if (result.success) return { data: result.data };
      return {
        error: result.error.errors
          .map((e) => `${e.path.join('.') || '<root>'}: ${e.message}`)
          .join('; '),
      };
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) };
    }
  }
}
