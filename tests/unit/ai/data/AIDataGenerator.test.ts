import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  AIDataGenerator,
  AIDataParseError,
  AIDataValidationError,
} from '../../../../src/ai/data/AIDataGenerator';
import { MockProvider } from '../../../../src/ai/providers/MockProvider';

// ─── helpers ─────────────────────────────────────────────────────────────────

const UserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  age: z.number().int().min(0).max(150),
});
type TestUser = z.infer<typeof UserSchema>;

function makeUsers(count: number): TestUser[] {
  return Array.from({ length: count }, (_, i) => ({
    email: `user${i}@example.com`,
    name: `User ${i}`,
    age: 20 + i,
  }));
}

function mockProvider(response: string): MockProvider {
  return new MockProvider({ fallback: () => response });
}

let tempDir: string;

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-data-test-'));
});

afterEach(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
});

// ─── happy path ──────────────────────────────────────────────────────────────

describe('AIDataGenerator.generate() — happy path', () => {
  it('returns validated items from LLM JSON response', async () => {
    const users = makeUsers(3);
    const gen = new AIDataGenerator({
      cacheDir: tempDir,
      provider: mockProvider(JSON.stringify(users)),
    });

    const result = await gen.generate('test users', UserSchema, 3, { useCache: false });

    expect(result).toHaveLength(3);
    result.forEach((u) => {
      expect(u.email).toMatch(/@/);
      expect(u.name.length).toBeGreaterThan(0);
    });
  });

  it('handles LLM wrapping array in { items: [...] }', async () => {
    const users = makeUsers(2);
    const payload = JSON.stringify({ items: users });
    const gen = new AIDataGenerator({ cacheDir: tempDir, provider: mockProvider(payload) });

    const result = await gen.generate('wrapped items', UserSchema, 2, { useCache: false });
    expect(result).toHaveLength(2);
  });

  it('handles LLM wrapping array in { data: [...] }', async () => {
    const users = makeUsers(2);
    const payload = JSON.stringify({ data: users });
    const gen = new AIDataGenerator({ cacheDir: tempDir, provider: mockProvider(payload) });

    const result = await gen.generate('data wrapper', UserSchema, 2, { useCache: false });
    expect(result).toHaveLength(2);
  });

  it('handles LLM wrapping array in { results: [...] }', async () => {
    const users = makeUsers(2);
    const payload = JSON.stringify({ results: users });
    const gen = new AIDataGenerator({ cacheDir: tempDir, provider: mockProvider(payload) });

    const result = await gen.generate('results wrapper', UserSchema, 2, { useCache: false });
    expect(result).toHaveLength(2);
  });

  it('strips markdown code fences before parsing', async () => {
    const users = makeUsers(1);
    const fenced = '```json\n' + JSON.stringify(users) + '\n```';
    const gen = new AIDataGenerator({ cacheDir: tempDir, provider: mockProvider(fenced) });

    const result = await gen.generate('fenced', UserSchema, 1, { useCache: false });
    expect(result).toHaveLength(1);
  });

  it('strips plain ``` code fences without language hint', async () => {
    const users = makeUsers(1);
    const fenced = '```\n' + JSON.stringify(users) + '\n```';
    const gen = new AIDataGenerator({ cacheDir: tempDir, provider: mockProvider(fenced) });

    const result = await gen.generate('no-lang-fence', UserSchema, 1, { useCache: false });
    expect(result).toHaveLength(1);
  });
});

// ─── file-based cache ─────────────────────────────────────────────────────────

describe('AIDataGenerator.generate() — caching', () => {
  it('writes a cache file on first call', async () => {
    const users = makeUsers(2);
    const gen = new AIDataGenerator({
      cacheDir: tempDir,
      provider: mockProvider(JSON.stringify(users)),
    });

    await gen.generate('cache-write test', UserSchema, 2);
    const files = fs.readdirSync(tempDir).filter((f) => f.endsWith('.json'));
    expect(files).toHaveLength(1);
  });

  it('reads from cache on second call — provider not called again', async () => {
    const users = makeUsers(2);
    const provider = mockProvider(JSON.stringify(users));
    const gen = new AIDataGenerator({ cacheDir: tempDir, provider });

    await gen.generate('cache-hit test', UserSchema, 2);
    const callsAfterFirst = provider.calls.length;

    await gen.generate('cache-hit test', UserSchema, 2);
    // Provider should NOT have been called a second time
    expect(provider.calls.length).toBe(callsAfterFirst);
  });

  it('different prompts produce different cache files', async () => {
    const users = makeUsers(2);
    const gen = new AIDataGenerator({
      cacheDir: tempDir,
      provider: mockProvider(JSON.stringify(users)),
    });

    await gen.generate('prompt A', UserSchema, 2);
    await gen.generate('prompt B', UserSchema, 2);

    const files = fs.readdirSync(tempDir).filter((f) => f.endsWith('.json'));
    expect(files).toHaveLength(2);
  });

  it('same prompt but different count produces different cache key', async () => {
    const gen3 = new AIDataGenerator({
      cacheDir: tempDir,
      provider: mockProvider(JSON.stringify(makeUsers(3))),
    });
    const gen5 = new AIDataGenerator({
      cacheDir: tempDir,
      provider: mockProvider(JSON.stringify(makeUsers(5))),
    });

    await gen3.generate('same prompt', UserSchema, 3);
    await gen5.generate('same prompt', UserSchema, 5);

    const files = fs.readdirSync(tempDir).filter((f) => f.endsWith('.json'));
    expect(files).toHaveLength(2);
  });

  it('useCache: false bypasses the cache and calls provider every time', async () => {
    const users = makeUsers(1);
    const provider = mockProvider(JSON.stringify(users));
    const gen = new AIDataGenerator({ cacheDir: tempDir, provider });

    await gen.generate('no-cache', UserSchema, 1, { useCache: false });
    await gen.generate('no-cache', UserSchema, 1, { useCache: false });

    expect(provider.calls.length).toBe(2);
  });

  it('cache is deterministic — same items returned on re-run', async () => {
    const users = makeUsers(2);
    const gen = new AIDataGenerator({
      cacheDir: tempDir,
      provider: mockProvider(JSON.stringify(users)),
    });

    const first = await gen.generate('deterministic', UserSchema, 2);
    const second = await gen.generate('deterministic', UserSchema, 2);

    expect(first).toEqual(second);
  });
});

// ─── clearCache() ─────────────────────────────────────────────────────────────

describe('AIDataGenerator.clearCache()', () => {
  it('removes all cache JSON files', async () => {
    const users = makeUsers(2);
    const gen = new AIDataGenerator({
      cacheDir: tempDir,
      provider: mockProvider(JSON.stringify(users)),
    });

    await gen.generate('clear-test', UserSchema, 2);
    gen.clearCache();

    const files = fs.readdirSync(tempDir).filter((f) => f.endsWith('.json'));
    expect(files).toHaveLength(0);
  });

  it('clearCache() on empty dir does not throw', () => {
    const gen = new AIDataGenerator({ cacheDir: tempDir });
    expect(() => gen.clearCache()).not.toThrow();
  });
});

// ─── error cases — parse failures ─────────────────────────────────────────────

describe('AIDataGenerator.generate() — parse errors', () => {
  it('throws AIDataParseError when LLM returns plain text (not JSON)', async () => {
    const gen = new AIDataGenerator({
      cacheDir: tempDir,
      provider: mockProvider('Sorry, I cannot generate that.'),
    });

    await expect(
      gen.generate('non-json response', UserSchema, 3, { useCache: false }),
    ).rejects.toBeInstanceOf(AIDataParseError);
  });

  it('throws AIDataParseError when LLM returns a JSON object (not array)', async () => {
    const gen = new AIDataGenerator({
      cacheDir: tempDir,
      provider: mockProvider('{"error": "bad request"}'),
    });

    await expect(
      gen.generate('object-not-array', UserSchema, 3, { useCache: false }),
    ).rejects.toBeInstanceOf(AIDataParseError);
  });

  it('throws AIDataParseError for truncated/partial JSON', async () => {
    const gen = new AIDataGenerator({
      cacheDir: tempDir,
      provider: mockProvider('[{"email": "a@b.com", "name":'),
    });

    await expect(
      gen.generate('partial-json', UserSchema, 1, { useCache: false }),
    ).rejects.toBeInstanceOf(AIDataParseError);
  });

  it('AIDataParseError exposes the raw LLM output', async () => {
    const rawOutput = 'This is not JSON at all';
    const gen = new AIDataGenerator({
      cacheDir: tempDir,
      provider: mockProvider(rawOutput),
    });

    let caught: AIDataParseError | null = null;
    try {
      await gen.generate('raw-output-check', UserSchema, 1, { useCache: false });
    } catch (err) {
      caught = err as AIDataParseError;
    }

    expect(caught).toBeInstanceOf(AIDataParseError);
    expect(caught?.rawOutput).toContain(rawOutput.slice(0, 30));
  });
});

// ─── error cases — schema validation failures ─────────────────────────────────

describe('AIDataGenerator.generate() — schema validation errors', () => {
  it('throws AIDataValidationError when LLM items fail schema', async () => {
    // Missing required fields — age is wrong type
    const badItems = [{ email: 'a@b.com', name: 'Alice', age: 'not-a-number' }];
    const gen = new AIDataGenerator({
      cacheDir: tempDir,
      provider: mockProvider(JSON.stringify(badItems)),
    });

    await expect(
      gen.generate('bad-schema items', UserSchema, 1, { useCache: false }),
    ).rejects.toBeInstanceOf(AIDataValidationError);
  });

  it('validation error lists which items failed', async () => {
    const mixed = [
      { email: 'good@test.com', name: 'Good', age: 25 }, // valid
      { email: 'bad', name: '', age: -1 }, // invalid email, empty name, negative age
    ];
    const gen = new AIDataGenerator({
      cacheDir: tempDir,
      provider: mockProvider(JSON.stringify(mixed)),
    });

    let caught: AIDataValidationError | null = null;
    try {
      await gen.generate('mixed-validity', UserSchema, 2, { useCache: false });
    } catch (err) {
      caught = err as AIDataValidationError;
    }

    expect(caught).toBeInstanceOf(AIDataValidationError);
    expect(caught?.fieldErrors.length).toBeGreaterThan(0);
    expect(caught?.message).toContain('failed schema validation');
  });

  it('throws AIDataValidationError when all items are empty objects', async () => {
    const gen = new AIDataGenerator({
      cacheDir: tempDir,
      provider: mockProvider('[{}, {}]'),
    });

    await expect(
      gen.generate('empty-objects', UserSchema, 2, { useCache: false }),
    ).rejects.toBeInstanceOf(AIDataValidationError);
  });

  it('does NOT write a cache file when schema validation fails', async () => {
    const gen = new AIDataGenerator({
      cacheDir: tempDir,
      provider: mockProvider('[{"bad": "data"}]'),
    });

    await gen.generate('no-cache-on-error', UserSchema, 1).catch(() => {
      /* expected */
    });

    const files = fs.readdirSync(tempDir).filter((f) => f.endsWith('.json'));
    expect(files).toHaveLength(0);
  });
});
