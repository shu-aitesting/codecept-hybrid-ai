import { faker } from '@faker-js/faker';

export interface User {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone: string;
}

export const UserFactory = {
  create(overrides: Partial<User> = {}): User {
    return {
      email: faker.internet.email().toLowerCase(),
      password: faker.internet.password({ length: 12, prefix: 'Aa1!' }),
      firstName: faker.person.firstName(),
      lastName: faker.person.lastName(),
      phone: faker.phone.number(),
      ...overrides,
    };
  },

  createMany(n: number, overrides?: Partial<User>): User[] {
    return Array.from({ length: n }, () => this.create(overrides));
  },
};
