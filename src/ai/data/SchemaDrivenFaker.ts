import { faker } from '@faker-js/faker';
import { z } from 'zod';

/**
 * Generate a valid fake value for any ZodSchema.
 *
 * Works recursively — nested ZodObject, ZodArray, ZodUnion etc. are all
 * handled. The output is validated by the schema itself before being
 * returned, so callers are guaranteed to receive a value that passes
 * `schema.parse()`.
 *
 * Supported types: ZodObject, ZodArray, ZodString, ZodNumber, ZodBoolean,
 * ZodDate, ZodEnum, ZodLiteral, ZodUnion, ZodOptional, ZodNullable,
 * ZodDefault.
 *
 * Throws `UnsupportedZodTypeError` for types not in the list above.
 */
export function fakeFromSchema<T>(schema: z.ZodSchema<T>): T {
  const value = generateValue(schema, '');
  return schema.parse(value) as T;
}

// ─── internal helpers ──────────────────────────────────────────────────────

export class UnsupportedZodTypeError extends Error {
  constructor(typeName: string, key: string) {
    super(`SchemaDrivenFaker: unsupported Zod type "${typeName}" at key "${key}"`);
    this.name = 'UnsupportedZodTypeError';
  }
}

function generateValue(schema: z.ZodSchema, key: string): unknown {
  // Unwrappers — order matters: Default before Optional so defaults are used
  if (schema instanceof z.ZodDefault) {
    return generateValue(schema._def.innerType as z.ZodSchema, key);
  }
  if (schema instanceof z.ZodOptional) {
    return generateValue(schema.unwrap(), key);
  }
  if (schema instanceof z.ZodNullable) {
    return generateValue(schema.unwrap(), key);
  }

  if (schema instanceof z.ZodObject) {
    return generateObject(schema as z.ZodObject<z.ZodRawShape>);
  }
  if (schema instanceof z.ZodArray) {
    const count = faker.number.int({ min: 1, max: 3 });
    return Array.from({ length: count }, () =>
      generateValue((schema as z.ZodArray<z.ZodSchema>).element, `${key}[]`),
    );
  }
  if (schema instanceof z.ZodEnum) {
    return faker.helpers.arrayElement(
      (schema as z.ZodEnum<[string, ...string[]]>).options as string[],
    );
  }
  if (schema instanceof z.ZodLiteral) {
    return (schema as z.ZodLiteral<unknown>).value;
  }
  if (schema instanceof z.ZodUnion) {
    const options = (schema as z.ZodUnion<[z.ZodSchema, ...z.ZodSchema[]]>)
      .options as z.ZodSchema[];
    return generateValue(faker.helpers.arrayElement(options), key);
  }
  if (schema instanceof z.ZodDiscriminatedUnion) {
    const options = [
      ...(
        schema as z.ZodDiscriminatedUnion<string, z.ZodDiscriminatedUnionOption<string>[]>
      ).options.values(),
    ] as z.ZodSchema[];
    return generateValue(faker.helpers.arrayElement(options), key);
  }
  if (schema instanceof z.ZodString) return generateString(key, schema as z.ZodString);
  if (schema instanceof z.ZodNumber) return generateNumber(schema as z.ZodNumber);
  if (schema instanceof z.ZodBoolean) return faker.datatype.boolean();
  if (schema instanceof z.ZodDate) return faker.date.recent();

  throw new UnsupportedZodTypeError(schema.constructor.name, key);
}

function generateObject(schema: z.ZodObject<z.ZodRawShape>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, fieldSchema] of Object.entries(schema.shape)) {
    out[k] = generateValue(fieldSchema as z.ZodSchema, k);
  }
  return out;
}

function generateString(key: string, schema: z.ZodString): string {
  const k = key.toLowerCase();

  // Key-name hints — applied before schema checks so semantic intent wins
  if (k === 'email' || k.endsWith('email') || k.endsWith('_email')) {
    return faker.internet.email().toLowerCase();
  }
  if (k === 'phone' || k.includes('phone') || k.includes('mobile')) {
    return faker.phone.number();
  }
  if (k === 'firstname' || k === 'first_name') return faker.person.firstName();
  if (k === 'lastname' || k === 'last_name') return faker.person.lastName();
  if (k.includes('name')) return faker.person.fullName();
  if (k.includes('address') || k.includes('street')) return faker.location.streetAddress();
  if (k === 'city') return faker.location.city();
  if (k === 'country') return faker.location.country();
  if (k === 'postcode' || k === 'zipcode' || k === 'zip') return faker.location.zipCode();
  if (k.includes('url') || k.includes('website') || k.includes('link')) {
    return faker.internet.url();
  }
  if (k.includes('password')) {
    return faker.internet.password({ length: 12, prefix: 'Aa1!' });
  }
  if (k === 'description' || k.includes('bio') || k.includes('body') || k.includes('content')) {
    return faker.lorem.paragraph();
  }
  if (k.includes('title') || k.includes('subject')) {
    return faker.lorem.sentence({ min: 3, max: 8 });
  }
  if (k === 'id' || k.endsWith('_id') || k.endsWith('id')) {
    // Check for uuid constraint first
    const checks = schema._def.checks ?? [];
    if (checks.some((c: { kind: string }) => c.kind === 'uuid')) return faker.string.uuid();
    return faker.string.uuid();
  }

  // Zod string validation checks — semantic type overrides generic fallback
  const checks: Array<{ kind: string; value?: unknown; regex?: RegExp }> = schema._def.checks ?? [];
  for (const check of checks) {
    if (check.kind === 'uuid') return faker.string.uuid();
    if (check.kind === 'email') return faker.internet.email().toLowerCase();
    if (check.kind === 'url') return faker.internet.url();
    if (check.kind === 'datetime') return new Date().toISOString();
    if (check.kind === 'min' && typeof check.value === 'number') {
      const length = Math.max(check.value, 8);
      return faker.string.alphanumeric({ length });
    }
  }

  return faker.lorem.word();
}

function generateNumber(schema: z.ZodNumber): number {
  const checks: Array<{ kind: string; value?: number; inclusive?: boolean }> =
    schema._def.checks ?? [];

  let min = 0;
  let max = 1000;
  let isInt = false;

  for (const check of checks) {
    if (check.kind === 'min' && typeof check.value === 'number') {
      min = check.inclusive === false ? check.value + 1 : check.value;
    }
    if (check.kind === 'max' && typeof check.value === 'number') {
      max = check.inclusive === false ? check.value - 1 : check.value;
    }
    if (check.kind === 'int' || check.kind === 'multipleOf') {
      isInt = true;
    }
  }

  // Clamp to valid range in case caller passed inverted bounds
  if (min > max) [min, max] = [max, min];

  if (isInt) return faker.number.int({ min, max });
  return faker.number.float({ min, max, fractionDigits: 2 });
}
