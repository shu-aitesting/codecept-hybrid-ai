import { faker } from '@faker-js/faker';
import { Factory } from 'rosie';

/**
 * Rosie factory for ApiDataFactory helper.
 *
 * Usage in tests:
 *   const user = await I.have('user');                   // all defaults
 *   const admin = await I.have('user', { role: 'admin' }); // override role
 *   await I.haveMultiple('user', 5);                      // bulk create
 *
 * ApiDataFactory will POST to {endpoint}/users and DELETE {endpoint}/users/{id}
 * after the test completes when cleanup: true.
 */
export default new Factory()
  .attr('email', () => faker.internet.email().toLowerCase())
  .attr('name', () => faker.person.fullName())
  .attr('password', () => faker.internet.password({ length: 12, prefix: 'Aa1!' }))
  .attr('role', 'customer');
