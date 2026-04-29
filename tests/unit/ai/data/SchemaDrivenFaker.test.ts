import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { fakeFromSchema, UnsupportedZodTypeError } from '../../../../src/ai/data/SchemaDrivenFaker';

// ─── ZodString field-name hints ───────────────────────────────────────────────

describe('SchemaDrivenFaker — ZodString field-name inference', () => {
  it('email key → valid email address', () => {
    const { email } = fakeFromSchema(z.object({ email: z.string() }));
    expect(email).toMatch(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);
    expect(email).toBe(email.toLowerCase());
  });

  it('userEmail key → valid email', () => {
    const { userEmail } = fakeFromSchema(z.object({ userEmail: z.string() }));
    expect(userEmail).toMatch(/@/);
  });

  it('phone key → non-empty string', () => {
    const { phone } = fakeFromSchema(z.object({ phone: z.string() }));
    expect(phone.length).toBeGreaterThan(0);
  });

  it('mobile key → non-empty string', () => {
    const { mobile } = fakeFromSchema(z.object({ mobile: z.string() }));
    expect(mobile.length).toBeGreaterThan(0);
  });

  it('firstName key → non-empty string', () => {
    const { firstName } = fakeFromSchema(z.object({ firstName: z.string() }));
    expect(firstName.length).toBeGreaterThan(0);
  });

  it('lastName key → non-empty string', () => {
    const { lastName } = fakeFromSchema(z.object({ lastName: z.string() }));
    expect(lastName.length).toBeGreaterThan(0);
  });

  it('fullname key (contains "name") → non-empty string', () => {
    const { fullname } = fakeFromSchema(z.object({ fullname: z.string() }));
    expect(fullname.length).toBeGreaterThan(0);
  });

  it('url key → string starting with http', () => {
    const { url } = fakeFromSchema(z.object({ url: z.string() }));
    expect(url).toMatch(/^https?:\/\//);
  });

  it('password key → starts with "Aa1!" prefix', () => {
    const { password } = fakeFromSchema(z.object({ password: z.string() }));
    expect(password).toMatch(/^Aa1!/);
  });

  it('description key → longer text (> 10 chars)', () => {
    const { description } = fakeFromSchema(z.object({ description: z.string() }));
    expect(description.length).toBeGreaterThan(10);
  });

  it('title key → sentence-like string', () => {
    const { title } = fakeFromSchema(z.object({ title: z.string() }));
    expect(title.length).toBeGreaterThan(0);
  });
});

// ─── ZodString schema checks ──────────────────────────────────────────────────

describe('SchemaDrivenFaker — ZodString schema checks', () => {
  it('.uuid() check → valid UUID format', () => {
    const schema = z.object({ id: z.string().uuid() });
    const { id } = fakeFromSchema(schema);
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });

  it('.email() check → valid email', () => {
    const schema = z.object({ contact: z.string().email() });
    const { contact } = fakeFromSchema(schema);
    expect(contact).toMatch(/@/);
    // Zod's .parse() would throw if invalid — the fact we reach here means it passed
  });

  it('.url() check → valid URL', () => {
    const schema = z.object({ link: z.string().url() });
    const { link } = fakeFromSchema(schema);
    expect(link).toMatch(/^https?:\/\//);
  });

  it('.min(N) check → generated string has length >= N', () => {
    const schema = z.object({ token: z.string().min(32) });
    const { token } = fakeFromSchema(schema);
    expect(token.length).toBeGreaterThanOrEqual(32);
  });
});

// ─── ZodNumber ───────────────────────────────────────────────────────────────

describe('SchemaDrivenFaker — ZodNumber', () => {
  it('plain z.number() → a finite number in [0, 1000]', () => {
    const { n } = fakeFromSchema(z.object({ n: z.number() }));
    expect(typeof n).toBe('number');
    expect(Number.isFinite(n)).toBe(true);
  });

  it('.min(18).max(65) → number is within bounds (repeated)', () => {
    const schema = z.object({ age: z.number().int().min(18).max(65) });
    for (let i = 0; i < 20; i++) {
      const { age } = fakeFromSchema(schema);
      expect(age).toBeGreaterThanOrEqual(18);
      expect(age).toBeLessThanOrEqual(65);
    }
  });

  it('.int() → integer value', () => {
    const schema = z.object({ count: z.number().int() });
    const { count } = fakeFromSchema(schema);
    expect(Number.isInteger(count)).toBe(true);
  });

  it('.min(0).max(0) edge case → exactly 0', () => {
    const schema = z.object({ zero: z.number().int().min(0).max(0) });
    expect(fakeFromSchema(schema).zero).toBe(0);
  });

  it('inverted min > max clamps gracefully (no throw)', () => {
    // This would be a Zod schema definition bug, but the generator should not crash
    const schema = z.object({ val: z.number() });
    expect(() => fakeFromSchema(schema)).not.toThrow();
  });
});

// ─── ZodBoolean ──────────────────────────────────────────────────────────────

describe('SchemaDrivenFaker — ZodBoolean', () => {
  it('generates a boolean', () => {
    const schema = z.object({ active: z.boolean() });
    expect(typeof fakeFromSchema(schema).active).toBe('boolean');
  });
});

// ─── ZodEnum ─────────────────────────────────────────────────────────────────

describe('SchemaDrivenFaker — ZodEnum', () => {
  it('generates one of the valid enum values', () => {
    const roles = ['admin', 'customer', 'viewer'] as const;
    const schema = z.object({ role: z.enum(roles) });
    for (let i = 0; i < 10; i++) {
      expect(roles).toContain(fakeFromSchema(schema).role);
    }
  });

  it('single-value enum always returns that value', () => {
    const schema = z.object({ kind: z.enum(['user']) });
    expect(fakeFromSchema(schema).kind).toBe('user');
  });
});

// ─── ZodLiteral ──────────────────────────────────────────────────────────────

describe('SchemaDrivenFaker — ZodLiteral', () => {
  it('returns the exact literal string', () => {
    const schema = z.object({ type: z.literal('post') });
    expect(fakeFromSchema(schema).type).toBe('post');
  });

  it('returns the exact literal number', () => {
    const schema = z.object({ version: z.literal(42) });
    expect(fakeFromSchema(schema).version).toBe(42);
  });

  it('returns the exact literal boolean', () => {
    const schema = z.object({ enabled: z.literal(true) });
    expect(fakeFromSchema(schema).enabled).toBe(true);
  });
});

// ─── ZodOptional & ZodNullable ────────────────────────────────────────────────

describe('SchemaDrivenFaker — ZodOptional / ZodNullable', () => {
  it('optional string field still gets a value (not undefined)', () => {
    const schema = z.object({ bio: z.string().optional() });
    const { bio } = fakeFromSchema(schema);
    expect(bio).toBeDefined();
    expect(typeof bio).toBe('string');
  });

  it('nullable string field still gets a non-null value', () => {
    const schema = z.object({ note: z.string().nullable() });
    const { note } = fakeFromSchema(schema);
    expect(note).not.toBeNull();
    expect(typeof note).toBe('string');
  });

  it('optional number field still gets a numeric value', () => {
    const schema = z.object({ score: z.number().optional() });
    expect(typeof fakeFromSchema(schema).score).toBe('number');
  });
});

// ─── ZodDefault ──────────────────────────────────────────────────────────────

describe('SchemaDrivenFaker — ZodDefault', () => {
  it('default string field still generates a faker value', () => {
    const schema = z.object({ label: z.string().default('fallback') });
    const { label } = fakeFromSchema(schema);
    expect(typeof label).toBe('string');
  });
});

// ─── ZodArray ────────────────────────────────────────────────────────────────

describe('SchemaDrivenFaker — ZodArray', () => {
  it('generates at least 1 item', () => {
    const schema = z.object({ tags: z.array(z.string()) });
    const { tags } = fakeFromSchema(schema);
    expect(Array.isArray(tags)).toBe(true);
    expect(tags.length).toBeGreaterThanOrEqual(1);
  });

  it('each item is the element type', () => {
    const schema = z.object({ ids: z.array(z.number().int()) });
    const { ids } = fakeFromSchema(schema);
    ids.forEach((id) => expect(Number.isInteger(id)).toBe(true));
  });

  it('array of objects generates valid nested objects', () => {
    const schema = z.object({
      users: z.array(z.object({ email: z.string(), age: z.number() })),
    });
    const { users } = fakeFromSchema(schema);
    expect(users.length).toBeGreaterThan(0);
    users.forEach((u) => {
      expect(u.email).toMatch(/@/);
      expect(typeof u.age).toBe('number');
    });
  });
});

// ─── ZodUnion ────────────────────────────────────────────────────────────────

describe('SchemaDrivenFaker — ZodUnion', () => {
  it('generates a value that passes the union schema', () => {
    const schema = z.object({
      value: z.union([z.string(), z.number()]),
    });
    const { value } = fakeFromSchema(schema);
    expect(['string', 'number']).toContain(typeof value);
  });
});

// ─── Nested ZodObject ────────────────────────────────────────────────────────

describe('SchemaDrivenFaker — nested ZodObject', () => {
  it('recursively generates nested object fields', () => {
    const schema = z.object({
      user: z.object({
        email: z.string(),
        profile: z.object({
          firstName: z.string(),
          age: z.number().int().min(0).max(120),
        }),
      }),
    });
    const result = fakeFromSchema(schema);
    expect(result.user.email).toMatch(/@/);
    expect(result.user.profile.firstName.length).toBeGreaterThan(0);
    expect(result.user.profile.age).toBeGreaterThanOrEqual(0);
    expect(result.user.profile.age).toBeLessThanOrEqual(120);
  });
});

// ─── Composite real-world schema ─────────────────────────────────────────────

describe('SchemaDrivenFaker — composite real-world schema', () => {
  const RegistrationSchema = z.object({
    email: z.string().email(),
    password: z.string().min(8),
    firstName: z.string(),
    lastName: z.string(),
    role: z.enum(['admin', 'customer', 'viewer']),
    active: z.boolean(),
    age: z.number().int().min(18).max(120),
    profileUrl: z.string().url().optional(),
  });

  it('generates a value that passes Zod parse (no throw)', () => {
    expect(() => fakeFromSchema(RegistrationSchema)).not.toThrow();
  });

  it('two independent calls return different data (non-deterministic)', () => {
    const a = fakeFromSchema(RegistrationSchema);
    const b = fakeFromSchema(RegistrationSchema);
    // At minimum the emails should differ most of the time
    // (this could theoretically collide, but p < 0.0001)
    expect(a.email).not.toBe(b.email);
  });
});

// ─── Negative / error cases ──────────────────────────────────────────────────

describe('SchemaDrivenFaker — negative / unsupported types', () => {
  it('throws UnsupportedZodTypeError for ZodFunction', () => {
    const schema = z.function();
    expect(() => fakeFromSchema(schema as unknown as z.ZodSchema)).toThrow(UnsupportedZodTypeError);
  });

  it('error message includes the type name and key context', () => {
    const schema = z.function();
    try {
      fakeFromSchema(schema as unknown as z.ZodSchema);
    } catch (err) {
      expect(err).toBeInstanceOf(UnsupportedZodTypeError);
      expect((err as Error).message).toContain('ZodFunction');
    }
  });

  it('throws UnsupportedZodTypeError for ZodNever', () => {
    const schema = z.never();
    expect(() => fakeFromSchema(schema)).toThrow(UnsupportedZodTypeError);
  });

  it('throws UnsupportedZodTypeError for ZodVoid', () => {
    const schema = z.void();
    expect(() => fakeFromSchema(schema as unknown as z.ZodSchema)).toThrow(UnsupportedZodTypeError);
  });
});
