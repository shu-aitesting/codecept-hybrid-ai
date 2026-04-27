import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { PromptLibrary } from '../../../../src/ai/prompts/PromptLibrary';

describe('PromptLibrary', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompts-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('renders Mustache vars', () => {
    fs.writeFileSync(
      path.join(dir, 'simple.prompt.md'),
      'hello {{name}}!',
    );
    const lib = new PromptLibrary({ promptDir: dir });
    expect(lib.render('simple', { name: 'world' })).toBe('hello world!');
  });

  it('parses front-matter into meta', () => {
    fs.writeFileSync(
      path.join(dir, 'meta.prompt.md'),
      '---\ntask: heal\nmodel: anthropic:haiku\n---\nbody {{x}}',
    );
    const lib = new PromptLibrary({ promptDir: dir });
    const parsed = lib.load('meta');
    expect(parsed.meta.task).toBe('heal');
    expect(parsed.meta.model).toBe('anthropic:haiku');
    expect(parsed.body.trim()).toBe('body {{x}}');
  });

  it('parses example list with input/output objects', () => {
    fs.writeFileSync(
      path.join(dir, 'fewshot.prompt.md'),
      `---
task: heal
examples:
  - input: { step: "I.click('#a')", error: "not found" }
    output: { candidates: ["#a", "#b"] }
  - input: { step: "fail" }
    output: { candidates: ["c"] }
---
You are an expert.

## USER
{{question}}`,
    );
    const lib = new PromptLibrary({ promptDir: dir });
    const messages = lib.loadChatMessages('fewshot', { question: 'why?' }, { cacheSystem: true });
    // Expected: system, 2x (user + assistant) for examples, then final user.
    expect(messages).toHaveLength(1 + 2 * 2 + 1);
    expect(messages[0].role).toBe('system');
    expect(messages[0].cache).toBe(true);
    expect(messages[1].role).toBe('user');
    expect(messages[2].role).toBe('assistant');
    expect(messages.at(-1)).toMatchObject({ role: 'user', content: 'why?' });
  });

  it('throws for missing template', () => {
    const lib = new PromptLibrary({ promptDir: dir });
    expect(() => lib.load('nope')).toThrow(/not found/);
  });

  it('caches loaded prompts', () => {
    fs.writeFileSync(path.join(dir, 'c.prompt.md'), 'hi');
    const lib = new PromptLibrary({ promptDir: dir });
    const first = lib.load('c');
    fs.writeFileSync(path.join(dir, 'c.prompt.md'), 'changed');
    const second = lib.load('c');
    expect(first).toBe(second);
    lib.clearCache();
    expect(lib.load('c').body).toBe('changed');
  });

  it('handles prompts without front-matter', () => {
    fs.writeFileSync(path.join(dir, 'plain.prompt.md'), 'just text {{x}}');
    const lib = new PromptLibrary({ promptDir: dir });
    expect(lib.render('plain', { x: 'works' })).toBe('just text works');
  });

  it('loads the real heal.prompt.md template successfully', () => {
    const lib = new PromptLibrary({
      promptDir: path.resolve(__dirname, '..', '..', '..', '..', 'config', 'ai', 'prompts'),
    });
    const messages = lib.loadChatMessages(
      'heal',
      { step: 'I.click', locator: '#a', error: 'not found', dom: '<button>x</button>' },
      { cacheSystem: true },
    );
    expect(messages[0].role).toBe('system');
    expect(messages.at(-1)?.content).toContain('Failed step');
    expect(messages.at(-1)?.content).toContain('<button>x</button>');
  });
});
