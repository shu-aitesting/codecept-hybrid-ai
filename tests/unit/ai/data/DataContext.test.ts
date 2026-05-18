import { describe, expect, it } from 'vitest';

import { DataContext } from '../../../../src/ai/data/DataContext';

describe('DataContext', () => {
  it('capture + get roundtrip', () => {
    const ctx = new DataContext();
    ctx.capture('user.id', 42);
    expect(ctx.get('user.id')).toBe(42);
  });

  it('has returns true for captured key, false otherwise', () => {
    const ctx = new DataContext();
    ctx.capture('token', 'abc');
    expect(ctx.has('token')).toBe(true);
    expect(ctx.has('missing')).toBe(false);
  });

  it('resolve — single ${key} expression returns raw stored value (preserves type)', () => {
    const ctx = new DataContext();
    ctx.capture('user.id', 42);
    expect(ctx.resolve('${user.id}')).toBe(42);
  });

  it('resolve — nested template ${user.profile.email}', () => {
    const ctx = new DataContext();
    ctx.capture('user.profile.email', 'test@example.com');
    expect(ctx.resolve('${user.profile.email}')).toBe('test@example.com');
  });

  it('resolve — string interpolation with surrounding text', () => {
    const ctx = new DataContext();
    ctx.capture('name', 'Alice');
    expect(ctx.resolve('Hello ${name}!')).toBe('Hello Alice!');
  });

  it('resolve — multiple placeholders in one string', () => {
    const ctx = new DataContext();
    ctx.capture('first', 'John');
    ctx.capture('last', 'Doe');
    expect(ctx.resolve('${first} ${last}')).toBe('John Doe');
  });

  it('resolve — unknown placeholder left as-is', () => {
    const ctx = new DataContext();
    expect(ctx.resolve('${missing}')).toBe('${missing}');
  });

  it('resolve — walks nested object', () => {
    const ctx = new DataContext();
    ctx.capture('user.id', 7);
    const result = ctx.resolve({ path: '/users/${user.id}', meta: { id: '${user.id}' } });
    expect(result).toEqual({ path: '/users/7', meta: { id: 7 } });
  });

  it('resolve — walks array', () => {
    const ctx = new DataContext();
    ctx.capture('tag', 'admin');
    expect(ctx.resolve(['${tag}', 'user'])).toEqual(['admin', 'user']);
  });

  it('resolve — non-string primitives pass through unchanged', () => {
    const ctx = new DataContext();
    expect(ctx.resolve(123)).toBe(123);
    expect(ctx.resolve(true)).toBe(true);
    expect(ctx.resolve(null)).toBe(null);
  });

  it('clear removes all stored entries', () => {
    const ctx = new DataContext();
    ctx.capture('a', 1);
    ctx.capture('b', 2);
    ctx.clear();
    expect(ctx.has('a')).toBe(false);
    expect(ctx.has('b')).toBe(false);
  });
});
