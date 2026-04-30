import { faker } from '@faker-js/faker';
import { Factory } from 'rosie';

/**
 * Rosie factory for ApiDataFactory helper.
 * Used via I.have('user') / I.have('user', { role: 'admin' }) in tests.
 * ApiDataFactory will POST to /users on create and DELETE /users/{id} on cleanup.
 */
export default new Factory()
  .attr('email', () => faker.internet.email().toLowerCase())
  .attr('name', () => faker.person.fullName())
  .attr('password', () => faker.internet.password({ length: 12, prefix: 'Aa1!' }));
