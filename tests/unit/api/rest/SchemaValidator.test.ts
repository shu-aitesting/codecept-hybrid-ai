import { describe, expect, it } from 'vitest';

import { SchemaValidator, schemaValidator } from '../../../../src/api/rest/SchemaValidator';

describe('SchemaValidator', () => {
  describe('singleton', () => {
    it('getInstance returns the same instance each time', () => {
      expect(SchemaValidator.getInstance()).toBe(SchemaValidator.getInstance());
    });

    it('schemaValidator export is the same singleton', () => {
      expect(schemaValidator).toBe(SchemaValidator.getInstance());
    });
  });

  describe('validate — positive cases', () => {
    it('passes valid object with required property', () => {
      const schema = { type: 'object', properties: { id: { type: 'number' } }, required: ['id'] };
      const result = schemaValidator.validate(schema, { id: 1 });
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('passes valid email format', () => {
      const schema = { type: 'string', format: 'email' };
      const result = schemaValidator.validate(schema, 'user@example.com');
      expect(result.valid).toBe(true);
    });

    it('passes valid date-time format', () => {
      const schema = { type: 'string', format: 'date-time' };
      const result = schemaValidator.validate(schema, '2024-01-15T10:30:00Z');
      expect(result.valid).toBe(true);
    });

    it('passes valid uuid format', () => {
      const schema = { type: 'string', format: 'uuid' };
      const result = schemaValidator.validate(schema, '550e8400-e29b-41d4-a716-446655440000');
      expect(result.valid).toBe(true);
    });

    it('passes pattern constraint', () => {
      const schema = { type: 'string', pattern: '^[A-Z]{3}$' };
      const result = schemaValidator.validate(schema, 'ABC');
      expect(result.valid).toBe(true);
    });

    it('passes enum constraint', () => {
      const schema = { type: 'string', enum: ['active', 'inactive'] };
      const result = schemaValidator.validate(schema, 'active');
      expect(result.valid).toBe(true);
    });

    it('passes nullable field when value is null', () => {
      const schema = { type: ['string', 'null'] };
      const result = schemaValidator.validate(schema, null);
      expect(result.valid).toBe(true);
    });
  });

  describe('validate — negative cases', () => {
    it('fails when required field is missing', () => {
      const schema = { type: 'object', properties: { id: { type: 'number' } }, required: ['id'] };
      const result = schemaValidator.validate(schema, {});
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('fails invalid email format', () => {
      const schema = { type: 'string', format: 'email' };
      const result = schemaValidator.validate(schema, 'not-an-email');
      expect(result.valid).toBe(false);
    });

    it('fails invalid date-time format', () => {
      const schema = { type: 'string', format: 'date-time' };
      const result = schemaValidator.validate(schema, 'not-a-date');
      expect(result.valid).toBe(false);
    });

    it('fails pattern mismatch', () => {
      const schema = { type: 'string', pattern: '^[A-Z]{3}$' };
      const result = schemaValidator.validate(schema, 'abc');
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('pattern');
    });

    it('fails enum mismatch', () => {
      const schema = { type: 'string', enum: ['active', 'inactive'] };
      const result = schemaValidator.validate(schema, 'pending');
      expect(result.valid).toBe(false);
    });

    it('returns all errors when allErrors is on', () => {
      const schema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
          age: { type: 'number' },
        },
        required: ['name', 'age'],
      };
      const result = schemaValidator.validate(schema, {});
      // Both name and age are missing — should report 2 errors
      expect(result.errors.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('schema caching', () => {
    it('compiles same schema object only once (uses WeakMap cache)', () => {
      const schema = { type: 'string' };
      // Both calls should succeed without error (cache hit path)
      const r1 = schemaValidator.validate(schema, 'hello');
      const r2 = schemaValidator.validate(schema, 42);
      expect(r1.valid).toBe(true);
      expect(r2.valid).toBe(false);
    });
  });
});
