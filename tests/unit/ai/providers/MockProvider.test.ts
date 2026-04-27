import { describe, expect, it } from 'vitest';

import { MockProvider } from '../../../../src/ai/providers/MockProvider';
import { ChatMessage, NoMockResponseError } from '../../../../src/ai/providers/types';

describe('MockProvider', () => {
  it('returns the registered response for matching messages', async () => {
    const provider = new MockProvider();
    const messages: ChatMessage[] = [
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'hello' },
    ];
    provider.set(messages, '{"candidates":["#a"]}');
    const result = await provider.chat(messages);
    expect(result.text).toBe('{"candidates":["#a"]}');
    expect(provider.calls).toHaveLength(1);
  });

  it('falls back when no key matches', async () => {
    const provider = new MockProvider({ fallback: 'fallback-text' });
    const result = await provider.chat([{ role: 'user', content: 'unknown' }]);
    expect(result.text).toBe('fallback-text');
  });

  it('throws NoMockResponseError when nothing matches and no fallback', async () => {
    const provider = new MockProvider();
    await expect(provider.chat([{ role: 'user', content: 'x' }])).rejects.toBeInstanceOf(
      NoMockResponseError,
    );
  });

  it('supports function responses', async () => {
    const provider = new MockProvider({
      fallback: (msgs) => `echo:${msgs.at(-1)?.content}`,
    });
    const result = await provider.chat([{ role: 'user', content: 'ping' }]);
    expect(result.text).toBe('echo:ping');
  });

  it('estimates tokens roughly proportional to content length', async () => {
    const provider = new MockProvider({ fallback: 'a'.repeat(40) });
    const result = await provider.chat([{ role: 'user', content: 'b'.repeat(80) }]);
    expect(result.usage.outputTokens).toBe(10);
    expect(result.usage.inputTokens).toBe(20);
  });

  it('returns 0 cost', () => {
    const provider = new MockProvider();
    expect(provider.estimateCostUsd({ inputTokens: 1_000_000, outputTokens: 1_000_000 })).toBe(0);
  });
});
