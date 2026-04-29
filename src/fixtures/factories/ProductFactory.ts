import { faker } from '@faker-js/faker';

export interface Product {
  name: string;
  price: number;
  category: string;
  sku: string;
  inStock: boolean;
  description: string;
}

export const ProductFactory = {
  create(overrides: Partial<Product> = {}): Product {
    return {
      name: faker.commerce.productName(),
      price: parseFloat(faker.commerce.price({ min: 1, max: 9999, dec: 2 })),
      category: faker.commerce.department(),
      sku: faker.string.alphanumeric({ length: 8, casing: 'upper' }),
      inStock: faker.datatype.boolean(),
      description: faker.commerce.productDescription(),
      ...overrides,
    };
  },

  /** Build a product guaranteed to be in stock (for add-to-cart flows). */
  createAvailable(overrides: Partial<Product> = {}): Product {
    return this.create({ inStock: true, ...overrides });
  },

  /** Build a product that is out of stock (for negative add-to-cart tests). */
  createUnavailable(overrides: Partial<Product> = {}): Product {
    return this.create({ inStock: false, ...overrides });
  },

  createMany(n: number, overrides?: Partial<Product>): Product[] {
    if (n <= 0) return [];
    return Array.from({ length: n }, () => this.create(overrides));
  },
};
