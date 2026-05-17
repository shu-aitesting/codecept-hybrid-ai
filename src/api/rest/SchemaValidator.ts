import Ajv from 'ajv';
import addFormats from 'ajv-formats';

export interface SchemaValidationResult {
  valid: boolean;
  errors: string[];
}

export class SchemaValidator {
  private static _instance: SchemaValidator;

  private ajv: Ajv;
  private cache = new WeakMap<object, ReturnType<Ajv['compile']>>();

  private constructor() {
    this.ajv = new Ajv({ strict: false, allErrors: true });
    addFormats(this.ajv);
  }

  static getInstance(): SchemaValidator {
    if (!SchemaValidator._instance) {
      SchemaValidator._instance = new SchemaValidator();
    }
    return SchemaValidator._instance;
  }

  validate(schema: object, data: unknown): SchemaValidationResult {
    let compiled = this.cache.get(schema);
    if (!compiled) {
      compiled = this.ajv.compile(schema);
      this.cache.set(schema, compiled);
    }

    const valid = compiled(data) as boolean;
    if (valid) return { valid: true, errors: [] };

    const errors = (compiled.errors ?? []).map((e) =>
      `${e.instancePath || '(root)'} ${e.message ?? 'unknown error'}`.trim(),
    );
    return { valid: false, errors };
  }
}

export const schemaValidator = SchemaValidator.getInstance();
