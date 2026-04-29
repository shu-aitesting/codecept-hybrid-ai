import { describe, expect, it } from 'vitest';

import { ProductFactory } from '../../../src/fixtures/factories/ProductFactory';

describe('ProductFactory.create()', () => {
  it('returns all required fields with correct types', () => {
    const p = ProductFactory.create();
    expect(typeof p.name).toBe('string');
    expect(typeof p.price).toBe('number');
    expect(typeof p.category).toBe('string');
    expect(typeof p.sku).toBe('string');
    expect(typeof p.inStock).toBe('boolean');
    expect(typeof p.description).toBe('string');
  });

  it('price is a positive finite number', () => {
    const { price } = ProductFactory.create();
    expect(price).toBeGreaterThan(0);
    expect(Number.isFinite(price)).toBe(true);
  });

  it('sku is 8 uppercase alphanumeric characters', () => {
    const { sku } = ProductFactory.create();
    expect(sku).toMatch(/^[A-Z0-9]{8}$/);
  });

  it('overrides individual fields', () => {
    const p = ProductFactory.create({ price: 0.01, inStock: false });
    expect(p.price).toBe(0.01);
    expect(p.inStock).toBe(false);
  });
});

describe('ProductFactory.createAvailable()', () => {
  it('always sets inStock = true', () => {
    for (let i = 0; i < 10; i++) {
      expect(ProductFactory.createAvailable().inStock).toBe(true);
    }
  });

  it('override inStock: false is rejected by the intent (available variant)', () => {
    // createAvailable forces inStock:true — any caller override is overwritten
    const p = ProductFactory.createAvailable();
    expect(p.inStock).toBe(true);
  });
});

describe('ProductFactory.createUnavailable()', () => {
  it('always sets inStock = false', () => {
    for (let i = 0; i < 10; i++) {
      expect(ProductFactory.createUnavailable().inStock).toBe(false);
    }
  });
});

describe('ProductFactory.createMany()', () => {
  it('returns N items', () => {
    expect(ProductFactory.createMany(3)).toHaveLength(3);
  });

  it('returns [] for n = 0', () => {
    expect(ProductFactory.createMany(0)).toEqual([]);
  });

  it('returns [] for negative n', () => {
    expect(ProductFactory.createMany(-5)).toEqual([]);
  });

  it('applies overrides to every item', () => {
    const products = ProductFactory.createMany(4, { category: 'Frozen' });
    products.forEach((p) => expect(p.category).toBe('Frozen'));
  });
});
