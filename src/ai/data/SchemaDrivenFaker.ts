import { faker } from '@faker-js/faker';
import { z } from 'zod';

/**
 * Generates a fake object matching the provided Zod schema by inferring
 * appropriate faker calls from field names and zod types.
 * Only ZodObject schemas are supported; nested objects are handled recursively.
 */
export function fakeFromSchema<T>(schema: z.ZodSchema<T>): T {
  if (schema instanceof z.ZodObject) {
    const shape = (schema as z.AnyZodObject).shape as Record<string, z.ZodSchema>;
    const out: Record<string, unknown> = {};
    for (const [key, fieldSchema] of Object.entries(shape)) {
      out[key] = inferFakerForKey(key, fieldSchema);
    }
    return schema.parse(out);
  }
  throw new Error('fakeFromSchema: only ZodObject schemas are supported');
}

function inferFakerForKey(key: string, schema: z.ZodSchema): unknown {
  // Unwrap Optional / Nullable so the inner type is inspectable
  const inner = unwrap(schema);
  const k = key.toLowerCase();

  if (k.includes('email')) return faker.internet.email().toLowerCase();
  if (k.includes('phone')) return faker.phone.number();
  if (k.includes('firstname') || k === 'first_name') return faker.person.firstName();
  if (k.includes('lastname') || k === 'last_name') return faker.person.lastName();
  if (k.includes('name')) return faker.person.fullName();
  if (k.includes('address')) return faker.location.streetAddress();
  if (k.includes('city')) return faker.location.city();
  if (k.includes('country')) return faker.location.country();
  if (k.includes('url') || k.includes('website')) return faker.internet.url();
  if (k.includes('avatar') || k.includes('photo') || k.includes('image')) return faker.image.url();
  if (k.includes('description') || k.includes('bio') || k.includes('about'))
    return faker.lorem.sentence();
  if (k.includes('password')) return faker.internet.password({ length: 12, prefix: 'Aa1!' });
  if (k.includes('username')) return faker.internet.userName();
  if (k.includes('id')) return faker.string.uuid();
  if (k.includes('date') || k.includes('_at')) return faker.date.recent().toISOString();

  // Fall back to type-based inference
  if (inner instanceof z.ZodNumber) return faker.number.int({ min: 1, max: 1000 });
  if (inner instanceof z.ZodBoolean) return faker.datatype.boolean();
  if (inner instanceof z.ZodArray) return [];
  if (inner instanceof z.ZodObject) return fakeFromSchema(inner);

  return faker.lorem.word();
}

/** Strips ZodOptional / ZodNullable / ZodDefault wrappers to expose the core type. */
function unwrap(schema: z.ZodSchema): z.ZodSchema {
  if (schema instanceof z.ZodOptional || schema instanceof z.ZodNullable) {
    return unwrap(schema.unwrap());
  }
  if (schema instanceof z.ZodDefault) {
    // removeDefault() is the public API to get the inner schema — avoids touching _def
    return unwrap(schema.removeDefault());
  }
  return schema;
}
