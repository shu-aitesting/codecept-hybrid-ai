import { faker } from '@faker-js/faker';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
const _jsf = require('json-schema-faker') as {
  generate: (schema: unknown) => unknown;
  option: (nameOrOpts: string | Record<string, unknown>, value?: unknown) => void;
  extend: (name: string, cb: () => unknown) => void;
};

_jsf.extend('faker', () => faker);
_jsf.option({ useExamplesValue: true, useDefaultValue: true, fixedProbabilities: true });

/**
 * Generates a fake object matching the provided Zod schema.
 * Converts Zod → JSON Schema via zod-to-json-schema → json-schema-faker, then validates with schema.parse().
 */
export function fakeFromSchema<T>(schema: z.ZodSchema<T>): T {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const jsonSchema = zodToJsonSchema(schema as any, { errorMessages: false });
  const data = _jsf.generate(jsonSchema);
  return schema.parse(data);
}
