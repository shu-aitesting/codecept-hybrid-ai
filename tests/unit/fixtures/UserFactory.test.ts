import { describe, expect, it } from 'vitest';

import { UserFactory } from '../../../src/fixtures/factories/UserFactory';
import type { User } from '../../../src/fixtures/factories/UserFactory';

// ─── helpers ─────────────────────────────────────────────────────────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ─── UserFactory.create() ─────────────────────────────────────────────────────

describe('UserFactory.create()', () => {
  it('returns a complete User object with all required fields', () => {
    const user = UserFactory.create();
    expect(user.email).toMatch(EMAIL_RE);
    expect(user.password).toBeTruthy();
    expect(user.firstName).toBeTruthy();
    expect(user.lastName).toBeTruthy();
    expect(user.phone).toBeTruthy();
    expect(user.role).toBe('customer');
  });

  it('email is always lowercase', () => {
    for (let i = 0; i < 10; i++) {
      const { email } = UserFactory.create();
      expect(email).toBe(email.toLowerCase());
    }
  });

  it('password starts with the complexity prefix "Aa1!"', () => {
    const { password } = UserFactory.create();
    expect(password).toMatch(/^Aa1!/);
  });

  it('password total length >= 12 characters', () => {
    const { password } = UserFactory.create();
    expect(password.length).toBeGreaterThanOrEqual(12);
  });

  it('overrides a single field while keeping others faker-generated', () => {
    const user = UserFactory.create({ email: 'pinned@test.com' });
    expect(user.email).toBe('pinned@test.com');
    expect(user.firstName).toBeTruthy();
    expect(user.lastName).toBeTruthy();
  });

  it('overrides role to admin', () => {
    const { role } = UserFactory.create({ role: 'admin' });
    expect(role).toBe('admin');
  });

  it('overrides role to viewer', () => {
    const { role } = UserFactory.create({ role: 'viewer' });
    expect(role).toBe('viewer');
  });

  it('multiple overrides applied simultaneously', () => {
    const user = UserFactory.create({
      email: 'multi@override.com',
      role: 'admin',
      firstName: 'Alice',
    });
    expect(user.email).toBe('multi@override.com');
    expect(user.role).toBe('admin');
    expect(user.firstName).toBe('Alice');
  });

  it('generates different emails across independent calls (uniqueness)', () => {
    const emails = Array.from({ length: 20 }, () => UserFactory.create().email);
    const unique = new Set(emails);
    // Faker may collide in a tiny sample — require >50% unique as a loose guard
    expect(unique.size).toBeGreaterThan(10);
  });

  it('returns a plain object — not a class instance', () => {
    const user = UserFactory.create();
    expect(Object.getPrototypeOf(user)).toBe(Object.prototype);
  });
});

// ─── UserFactory.createVietnamese() ──────────────────────────────────────────

describe('UserFactory.createVietnamese()', () => {
  it('phone number starts with +84 (Vietnamese country code)', () => {
    const { phone } = UserFactory.createVietnamese();
    expect(phone).toMatch(/^\+84\d{9}$/);
  });

  it('firstName is a known Vietnamese surname', () => {
    const vnSurnames = ['Nguyễn', 'Trần', 'Lê', 'Phạm', 'Hoàng'];
    const { firstName } = UserFactory.createVietnamese();
    expect(vnSurnames).toContain(firstName);
  });

  it('overrides still work in the Vietnamese variant', () => {
    const user = UserFactory.createVietnamese({ role: 'admin', email: 'vn@test.com' });
    expect(user.role).toBe('admin');
    expect(user.email).toBe('vn@test.com');
    expect(user.phone).toMatch(/^\+84/);
  });

  it('satisfies the full User interface', () => {
    const user: User = UserFactory.createVietnamese();
    expect(user.email).toMatch(EMAIL_RE);
    expect(user.password).toBeTruthy();
  });
});

// ─── UserFactory.createMany() ─────────────────────────────────────────────────

describe('UserFactory.createMany()', () => {
  it('returns exactly N items', () => {
    expect(UserFactory.createMany(5)).toHaveLength(5);
    expect(UserFactory.createMany(1)).toHaveLength(1);
    expect(UserFactory.createMany(100)).toHaveLength(100);
  });

  it('returns empty array for n = 0', () => {
    expect(UserFactory.createMany(0)).toEqual([]);
  });

  it('returns empty array for negative n (guard against bad callers)', () => {
    expect(UserFactory.createMany(-1)).toEqual([]);
    expect(UserFactory.createMany(-999)).toEqual([]);
  });

  it('applies overrides to every item in the batch', () => {
    const users = UserFactory.createMany(5, { role: 'viewer' });
    users.forEach((u) => expect(u.role).toBe('viewer'));
  });

  it('each item is independently generated (not the same reference)', () => {
    const [a, b] = UserFactory.createMany(2);
    // Different objects
    expect(a).not.toBe(b);
  });

  it('generates mostly unique emails in a large batch', () => {
    const users = UserFactory.createMany(50);
    const unique = new Set(users.map((u) => u.email));
    expect(unique.size).toBeGreaterThan(40);
  });

  it('all items have valid email format', () => {
    UserFactory.createMany(10).forEach(({ email }) => expect(email).toMatch(EMAIL_RE));
  });

  it('all items have the default role "customer" when no override', () => {
    UserFactory.createMany(5).forEach(({ role }) => expect(role).toBe('customer'));
  });
});
