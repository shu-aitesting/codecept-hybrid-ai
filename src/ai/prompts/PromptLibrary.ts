import * as fs from 'node:fs';
import * as path from 'node:path';

import Mustache from 'mustache';

import { ChatMessage } from '../providers/types';

interface FrontMatter {
  task?: string;
  model?: string;
  examples?: Array<{ input: unknown; output: unknown }>;
  [k: string]: unknown;
}

export interface ParsedPrompt {
  meta: FrontMatter;
  body: string;
}

interface PromptLibraryOpts {
  /** Directory holding `*.prompt.md` files. */
  promptDir?: string;
}

/**
 * Loads `*.prompt.md` templates and renders them with Mustache. Each file may
 * begin with a YAML-ish front-matter block (`---` … `---`) carrying metadata
 * (model hint, few-shot examples). The body is the actual Mustache template.
 *
 * Why prompt-as-file: prompts evolve like code, so they should diff cleanly
 * in PRs and be A/B-able. Mustache (logic-less) keeps templates honest —
 * complex branching belongs in TS, not prompts.
 */
export class PromptLibrary {
  private readonly promptDir: string;
  private readonly cache = new Map<string, ParsedPrompt>();

  constructor(opts: PromptLibraryOpts = {}) {
    this.promptDir = opts.promptDir ?? path.join(process.cwd(), 'config', 'ai', 'prompts');
  }

  load(name: string): ParsedPrompt {
    const cached = this.cache.get(name);
    if (cached) return cached;
    const file = path.join(this.promptDir, `${name}.prompt.md`);
    if (!fs.existsSync(file)) {
      throw new Error(`Prompt template not found: ${file}`);
    }
    const raw = fs.readFileSync(file, 'utf8');
    const parsed = this.parseFrontMatter(raw);
    this.cache.set(name, parsed);
    return parsed;
  }

  render(name: string, vars: Record<string, unknown>): string {
    const { body } = this.load(name);
    return Mustache.render(body, vars);
  }

  /**
   * Build a chat-message list with system (instruction) + few-shot user/assistant
   * pairs + final user message. The few-shot examples come from front-matter.
   */
  loadChatMessages(
    name: string,
    vars: Record<string, unknown>,
    opts: { cacheSystem?: boolean } = {},
  ): ChatMessage[] {
    const { meta, body } = this.load(name);
    const messages: ChatMessage[] = [];
    const rendered = Mustache.render(body, vars);
    const split = rendered.split(/\n## ?USER\b/i);
    const systemText = split[0].trim();
    const userText = split.length > 1 ? split.slice(1).join('\n## USER').trim() : rendered.trim();

    messages.push({ role: 'system', content: systemText, cache: opts.cacheSystem });
    for (const ex of meta.examples ?? []) {
      messages.push({ role: 'user', content: this.stringify(ex.input) });
      messages.push({ role: 'assistant', content: this.stringify(ex.output) });
    }
    messages.push({ role: 'user', content: userText });
    return messages;
  }

  /** Visible for testing — clear the in-memory cache. */
  clearCache(): void {
    this.cache.clear();
  }

  private parseFrontMatter(raw: string): ParsedPrompt {
    if (!raw.startsWith('---')) {
      return { meta: {}, body: raw };
    }
    const end = raw.indexOf('\n---', 3);
    if (end === -1) return { meta: {}, body: raw };
    const block = raw.slice(3, end).trim();
    const body = raw.slice(end + 4).replace(/^\r?\n/, '');
    return { meta: this.parseYamlIsh(block), body };
  }

  /**
   * Tiny YAML-subset parser: supports `key: value`, nested blocks via two-space
   * indentation, list entries `- key: value`. Avoids pulling a full YAML
   * dependency for what is essentially configuration metadata.
   */
  private parseYamlIsh(text: string): FrontMatter {
    const lines = text.split('\n');
    const root: Record<string, unknown> = {};
    const stack: Array<{ container: Record<string, unknown> | unknown[]; indent: number }> = [
      { container: root, indent: -1 },
    ];

    for (let i = 0; i < lines.length; i++) {
      const rawLine = lines[i];
      if (!rawLine.trim() || rawLine.trim().startsWith('#')) continue;
      const indent = rawLine.match(/^ */)![0].length;
      const line = rawLine.trim();
      while (stack.length > 1 && indent <= stack[stack.length - 1].indent) {
        stack.pop();
      }
      const top = stack[stack.length - 1];

      if (line.startsWith('- ')) {
        this.parseListItem(line.slice(2), indent, top.container as unknown[], stack);
      } else {
        this.parseKeyValue(line, indent, lines, i, top.container as Record<string, unknown>, stack);
      }
    }
    return root as FrontMatter;
  }

  private parseListItem(
    item: string,
    indent: number,
    arr: unknown[],
    stack: Array<{ container: Record<string, unknown> | unknown[]; indent: number }>,
  ): void {
    if (!item.includes(':')) {
      arr.push(this.castScalar(item));
      return;
    }
    const obj: Record<string, unknown> = {};
    const [k, ...rest] = item.split(':');
    const value = rest.join(':').trim();
    arr.push(obj);
    stack.push({ container: obj, indent });
    if (value) {
      obj[k.trim()] = this.castScalar(value);
    } else {
      // e.g. "- input:" — the key maps to a nested object; push child so that
      // sibling keys at indent+2 pop it and land back on the item object.
      const child: Record<string, unknown> = {};
      obj[k.trim()] = child;
      stack.push({ container: child, indent: indent + 2 });
    }
  }

  private parseKeyValue(
    line: string,
    indent: number,
    lines: string[],
    lineIndex: number,
    obj: Record<string, unknown>,
    stack: Array<{ container: Record<string, unknown> | unknown[]; indent: number }>,
  ): void {
    const idx = line.indexOf(':');
    if (idx === -1) return;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (value) {
      obj[key] = this.castScalar(value);
      return;
    }
    // No value — peek at the next non-empty line to decide array vs object.
    const next = lines.slice(lineIndex + 1).find((l) => l.trim());
    if (next?.trim().startsWith('- ')) {
      const arr: unknown[] = [];
      obj[key] = arr;
      stack.push({ container: arr, indent });
    } else {
      const child: Record<string, unknown> = {};
      obj[key] = child;
      stack.push({ container: child, indent });
    }
  }

  private castScalar(raw: string): unknown {
    if (raw === 'true') return true;
    if (raw === 'false') return false;
    if (raw === 'null' || raw === '~') return null;
    if (/^-?\d+(\.\d+)?$/.test(raw)) return Number(raw);
    if ((raw.startsWith('{') && raw.endsWith('}')) || (raw.startsWith('[') && raw.endsWith(']'))) {
      try {
        return JSON.parse(raw);
      } catch {
        // fall through and return raw string
      }
    }
    if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
      return raw.slice(1, -1);
    }
    return raw;
  }

  private stringify(value: unknown): string {
    return typeof value === 'string' ? value : JSON.stringify(value);
  }
}
