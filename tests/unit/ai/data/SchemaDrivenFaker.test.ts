import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { fakeFromSchema } from '../../../../src/ai/data/SchemaDrivenFaker';
import { UserFactory } from '../../../../src/fixtures/factories/UserFactory';

describe('fakeFromSchema — Zod path regression', () => {
  it('generates a valid object for a simple ZodObject schema', () => {
    const schema = z.object({
      name: z.string(),
      age: z.number().int().min(0).max(120),
    });
    const result = fakeFromSchema(schema);
    expect(typeof result.name).toBe('string');
    expect(typeof result.age).toBe('number');
    expect(result.age).toBeGreaterThanOrEqual(0);
    expect(result.age).toBeLessThanOrEqual(120);
  });

  it('handles optional fields (zod .optional())', () => {
    const schema = z.object({
      name: z.string(),
      bio: z.string().optional(),
    });
    const result = fakeFromSchema(schema);
    expect(typeof result.name).toBe('string');
    // bio may or may not be present — just check type if present
    if (result.bio !== undefined) {
      expect(typeof result.bio).toBe('string');
    }
  });

  it('handles enum field', () => {
    const schema = z.object({
      role: z.enum(['admin', 'user', 'guest']),
    });
    const result = fakeFromSchema(schema);
    expect(['admin', 'user', 'guest']).toContain(result.role);
  });

  it('handles nested ZodObject', () => {
    const schema = z.object({
      user: z.object({ id: z.number().int().min(1), name: z.string() }),
    });
    const result = fakeFromSchema(schema);
    expect(typeof result.user.id).toBe('number');
    expect(result.user.id).toBeGreaterThanOrEqual(1);
    expect(typeof result.user.name).toBe('string');
  });

  it('output passes schema.parse — no ZodError thrown', () => {
    const schema = z.object({
      email: z.string().email(),
      count: z.number().int().min(0),
    });
    expect(() => fakeFromSchema(schema)).not.toThrow();
    const result = fakeFromSchema(schema);
    expect(() => schema.parse(result)).not.toThrow();
  });
});

describe('UserFactory regression — direct faker usage unaffected by SchemaDrivenFaker rewrite', () => {
  it('UserFactory.create returns valid user shape', () => {
    const user = UserFactory.create();
    expect(typeof user.email).toBe('string');
    expect(user.email).toContain('@');
    expect(typeof user.firstName).toBe('string');
    expect(typeof user.lastName).toBe('string');
    expect(typeof user.phone).toBe('string');
  });

  it('UserFactory.create respects overrides', () => {
    const user = UserFactory.create({ email: 'custom@test.com' });
    expect(user.email).toBe('custom@test.com');
  });

  it('UserFactory.createMany returns correct count', () => {
    const users = UserFactory.createMany(3);
    expect(users).toHaveLength(3);
    users.forEach((u) => expect(typeof u.email).toBe('string'));
  });
});
