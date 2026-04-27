import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { StructuredOutputParser } from '../../../../src/ai/providers/StructuredOutputParser';

describe('StructuredOutputParser', () => {
  const parser = new StructuredOutputParser();
  const schema = z.object({ candidates: z.array(z.string()).min(1) });

  it('parses clean JSON response', async () => {
    const raw = '{"candidates":["#a","#b"]}';
    const result = await parser.parse(raw, { schema });
    expect(result.candidates).toEqual(['#a', '#b']);
  });

  it('strips ```json fences', async () => {
    const raw = '```json\n{"candidates":["#x"]}\n```';
    const result = await parser.parse(raw, { schema });
    expect(result.candidates).toEqual(['#x']);
  });

  it('extracts JSON embedded in surrounding chatter', async () => {
    const raw = 'Sure! Here you go: {"candidates":["#y"]} Hope this helps.';
    const result = await parser.parse(raw, { schema });
    expect(result.candidates).toEqual(['#y']);
  });

  it('handles arrays at top level', async () => {
    const arrSchema = z.array(z.string()).min(1);
    const raw = '[ "a", "b" ]';
    expect(await parser.parse(raw, { schema: arrSchema })).toEqual(['a', 'b']);
  });

  it('throws when no JSON object present and no fixer', async () => {
    await expect(parser.parse('total nonsense', { schema })).rejects.toThrow();
  });

  it('throws when JSON does not match schema and no fixer', async () => {
    await expect(parser.parse('{"foo": 1}', { schema })).rejects.toThrow();
  });

  it('uses llmFix to repair invalid JSON', async () => {
    const fix = vi
      .fn<(err: string, raw: string) => Promise<string>>()
      .mockResolvedValueOnce('{"candidates":["fixed"]}');
    const result = await parser.parse('{"foo":1}', { schema, llmFix: fix, maxFixRetries: 1 });
    expect(result.candidates).toEqual(['fixed']);
    expect(fix).toHaveBeenCalledOnce();
  });

  it('respects maxFixRetries and rejects after exhaustion', async () => {
    const fix = vi
      .fn<(err: string, raw: string) => Promise<string>>()
      .mockResolvedValue('still wrong');
    await expect(
      parser.parse('garbage', { schema, llmFix: fix, maxFixRetries: 2 }),
    ).rejects.toThrow();
    expect(fix).toHaveBeenCalledTimes(2);
  });

  it('handles strings containing braces inside JSON values without breaking balance', async () => {
    const raw = '{"candidates":["a{b}c","d"]}';
    const result = await parser.parse(raw, { schema });
    expect(result.candidates).toEqual(['a{b}c', 'd']);
  });

  it('handles escaped quotes in JSON', async () => {
    const raw = '{"candidates":["he said \\"hi\\""]}';
    const result = await parser.parse(raw, { schema });
    expect(result.candidates).toEqual(['he said "hi"']);
  });

  it('returns null for empty input via extractJson', () => {
    expect(parser.extractJson('')).toBeNull();
    expect(parser.extractJson('   ')).toBeNull();
  });
});
