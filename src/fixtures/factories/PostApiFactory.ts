import { faker } from '@faker-js/faker';
import { Factory } from 'rosie';

/**
 * Rosie factory for ApiDataFactory helper.
 *
 * Usage in tests:
 *   const post = await I.have('post');
 *   const post = await I.have('post', { userId: 1, title: 'My Post' });
 *   await I.haveMultiple('post', 3);
 *
 * ApiDataFactory will POST to {endpoint}/posts and DELETE {endpoint}/posts/{id}.
 */
export default new Factory()
  .attr('userId', () => faker.number.int({ min: 1, max: 10 }))
  .attr('title', () => faker.lorem.sentence({ min: 3, max: 8 }))
  .attr('body', () => faker.lorem.paragraphs({ min: 1, max: 3 }));
