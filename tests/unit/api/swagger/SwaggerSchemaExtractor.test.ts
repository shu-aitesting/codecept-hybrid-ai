import { describe, expect, it } from 'vitest';

import {
  SwaggerSchemaExtractor,
  type FieldConstraint,
} from '../../../../src/api/swagger/SwaggerSchemaExtractor';

// Helper to find a constraint by path
const find = (cs: FieldConstraint[], p: string) => cs.find((c) => c.path === p);

describe('SwaggerSchemaExtractor.extractConstraints', () => {
  it('returns empty array for empty schema', () => {
    expect(SwaggerSchemaExtractor.extractConstraints({})).toEqual([]);
  });

  it('required field', () => {
    const schema = {
      type: 'object',
      properties: { name: { type: 'string' } },
      required: ['name'],
    };
    const cs = SwaggerSchemaExtractor.extractConstraints(schema);
    expect(find(cs, 'name')?.required).toBe(true);
  });

  it('optional field', () => {
    const schema = {
      type: 'object',
      properties: { note: { type: 'string' } },
    };
    const cs = SwaggerSchemaExtractor.extractConstraints(schema);
    expect(find(cs, 'note')?.required).toBe(false);
  });

  it('pattern constraint', () => {
    const schema = {
      properties: {
        email: { type: 'string', pattern: '^[^@]+@[^@]+$' },
      },
    };
    const cs = SwaggerSchemaExtractor.extractConstraints(schema);
    expect(find(cs, 'email')?.pattern).toBe('^[^@]+@[^@]+$');
  });

  it('enum constraint', () => {
    const schema = {
      properties: {
        role: { type: 'string', enum: ['admin', 'user', 'guest'] },
      },
    };
    const cs = SwaggerSchemaExtractor.extractConstraints(schema);
    expect(find(cs, 'role')?.enum).toEqual(['admin', 'user', 'guest']);
  });

  it('min / max numeric constraint', () => {
    const schema = {
      properties: {
        age: { type: 'integer', minimum: 0, maximum: 120 },
      },
    };
    const cs = SwaggerSchemaExtractor.extractConstraints(schema);
    const c = find(cs, 'age');
    expect(c?.min).toBe(0);
    expect(c?.max).toBe(120);
  });

  it('minLength / maxLength constraint', () => {
    const schema = {
      properties: {
        username: { type: 'string', minLength: 3, maxLength: 30 },
      },
    };
    const cs = SwaggerSchemaExtractor.extractConstraints(schema);
    const c = find(cs, 'username');
    expect(c?.minLength).toBe(3);
    expect(c?.maxLength).toBe(30);
  });

  it('format constraint', () => {
    const schema = {
      properties: {
        createdAt: { type: 'string', format: 'date-time' },
      },
    };
    const cs = SwaggerSchemaExtractor.extractConstraints(schema);
    expect(find(cs, 'createdAt')?.format).toBe('date-time');
  });

  it('nullable: true — type preserved as string', () => {
    const schema = {
      properties: {
        bio: { type: 'string', nullable: true },
      },
    };
    const cs = SwaggerSchemaExtractor.extractConstraints(schema);
    expect(find(cs, 'bio')?.type).toBe('string');
  });

  it('example field from property (2.11)', () => {
    const schema = {
      properties: {
        email: { type: 'string', format: 'email', example: 'test@example.com' },
      },
    };
    const cs = SwaggerSchemaExtractor.extractConstraints(schema);
    expect(find(cs, 'email')?.example).toBe('test@example.com');
  });

  it('example from OAS3 examples[0] when no example field (2.11)', () => {
    const schema = {
      properties: {
        code: { type: 'string', examples: ['ABC123'] },
      },
    };
    const cs = SwaggerSchemaExtractor.extractConstraints(schema);
    expect(find(cs, 'code')?.example).toBe('ABC123');
  });

  it('default field (2.11)', () => {
    const schema = {
      properties: {
        role: { type: 'string', enum: ['admin', 'user'], default: 'user' },
      },
    };
    const cs = SwaggerSchemaExtractor.extractConstraints(schema);
    expect(find(cs, 'role')?.default).toBe('user');
  });

  it('nested object — recurse and produce dot-path constraints', () => {
    const schema = {
      properties: {
        address: {
          type: 'object',
          properties: {
            street: { type: 'string', minLength: 1 },
            zip: { type: 'string', pattern: '^\\d{5}$' },
          },
          required: ['street'],
        },
      },
    };
    const cs = SwaggerSchemaExtractor.extractConstraints(schema);
    expect(find(cs, 'address')?.type).toBe('object');
    expect(find(cs, 'address.street')?.required).toBe(true);
    expect(find(cs, 'address.street')?.minLength).toBe(1);
    expect(find(cs, 'address.zip')?.pattern).toBe('^\\d{5}$');
  });

  it('array items — recurse into object items', () => {
    const schema = {
      properties: {
        tags: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'integer' },
              label: { type: 'string', maxLength: 50 },
            },
            required: ['id'],
          },
        },
      },
    };
    const cs = SwaggerSchemaExtractor.extractConstraints(schema);
    expect(find(cs, 'tags')?.type).toBe('array');
    expect(find(cs, 'tags[].id')?.required).toBe(true);
    expect(find(cs, 'tags[].label')?.maxLength).toBe(50);
  });

  it('circular marker — returns placeholder and stops recursion', () => {
    const schema = {
      properties: {
        self: { __circular__: true },
      },
    };
    const cs = SwaggerSchemaExtractor.extractConstraints(schema);
    expect(find(cs, 'self')?.type).toBe('object');
    expect(find(cs, 'self')?.required).toBe(false);
    // Only the placeholder, no deeper keys
    expect(cs.filter((c) => c.path.startsWith('self.'))).toHaveLength(0);
  });

  it('uses basePath prefix in paths', () => {
    const schema = {
      properties: { id: { type: 'integer' } },
      required: ['id'],
    };
    const cs = SwaggerSchemaExtractor.extractConstraints(schema, 'body');
    expect(find(cs, 'body.id')?.required).toBe(true);
  });
});

describe('SwaggerSchemaExtractor.flattenRequiredPaths', () => {
  it('returns empty array for no required fields', () => {
    expect(SwaggerSchemaExtractor.flattenRequiredPaths({})).toEqual([]);
  });

  it('returns top-level required fields', () => {
    const schema = {
      properties: { name: { type: 'string' }, email: { type: 'string' } },
      required: ['name', 'email'],
    };
    expect(SwaggerSchemaExtractor.flattenRequiredPaths(schema)).toEqual(['name', 'email']);
  });

  it('recurses into nested object required fields', () => {
    const schema = {
      properties: {
        address: {
          type: 'object',
          properties: { street: { type: 'string' }, city: { type: 'string' } },
          required: ['street'],
        },
      },
      required: ['address'],
    };
    const paths = SwaggerSchemaExtractor.flattenRequiredPaths(schema);
    expect(paths).toContain('address');
    expect(paths).toContain('address.street');
  });
});
