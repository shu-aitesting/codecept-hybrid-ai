export interface FieldConstraint {
  path: string;
  type: string;
  required: boolean;
  format?: string;
  min?: number;
  max?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  enum?: unknown[];
  example?: unknown;
  default?: unknown;
}

export class SwaggerSchemaExtractor {
  static extractConstraints(schema: Record<string, unknown>, basePath = ''): FieldConstraint[] {
    if (!schema || typeof schema !== 'object') return [];

    // Self-ref guard: swagger-parser marks circular refs with __circular__
    if (schema['__circular__'] === true) {
      return [{ path: basePath || '.', type: 'object', required: false }];
    }

    const results: FieldConstraint[] = [];
    const requiredFields = Array.isArray(schema['required'])
      ? (schema['required'] as string[])
      : [];
    const properties = schema['properties'] as Record<string, Record<string, unknown>> | undefined;

    if (!properties) return results;

    for (const [fieldName, fieldSchema] of Object.entries(properties)) {
      if (!fieldSchema || typeof fieldSchema !== 'object') continue;

      const fs = fieldSchema as Record<string, unknown>;
      const fieldPath = basePath ? `${basePath}.${fieldName}` : fieldName;
      const isRequired = requiredFields.includes(fieldName);
      const fieldType = typeof fs['type'] === 'string' ? fs['type'] : 'string';

      // Circular marker on the property itself
      if (fs['__circular__'] === true) {
        results.push({ path: fieldPath, type: 'object', required: isRequired });
        continue;
      }

      // example precedence: property.example → examples[0] (OAS3) → undefined
      const exampleValue =
        fs['example'] !== undefined
          ? fs['example']
          : Array.isArray(fs['examples'])
            ? (fs['examples'] as unknown[])[0]
            : undefined;

      const constraint: FieldConstraint = {
        path: fieldPath,
        type: fieldType,
        required: isRequired,
      };

      if (typeof fs['format'] === 'string') constraint.format = fs['format'];
      if (typeof fs['minimum'] === 'number') constraint.min = fs['minimum'];
      if (typeof fs['maximum'] === 'number') constraint.max = fs['maximum'];
      if (typeof fs['minLength'] === 'number') constraint.minLength = fs['minLength'];
      if (typeof fs['maxLength'] === 'number') constraint.maxLength = fs['maxLength'];
      if (typeof fs['pattern'] === 'string') constraint.pattern = fs['pattern'];
      if (Array.isArray(fs['enum'])) constraint.enum = fs['enum'] as unknown[];
      if (exampleValue !== undefined) constraint.example = exampleValue;
      if (fs['default'] !== undefined) constraint.default = fs['default'];

      results.push(constraint);

      // Recurse into nested object
      if (fieldType === 'object' && fs['properties']) {
        results.push(
          ...SwaggerSchemaExtractor.extractConstraints(fs as Record<string, unknown>, fieldPath),
        );
      }

      // Recurse into array items if they are objects
      if (fieldType === 'array' && fs['items'] && typeof fs['items'] === 'object') {
        const items = fs['items'] as Record<string, unknown>;
        if (items['type'] === 'object' && items['properties']) {
          results.push(...SwaggerSchemaExtractor.extractConstraints(items, `${fieldPath}[]`));
        }
      }
    }

    return results;
  }

  static flattenRequiredPaths(schema: Record<string, unknown>, basePath = ''): string[] {
    if (!schema || typeof schema !== 'object') return [];

    const required = Array.isArray(schema['required']) ? (schema['required'] as string[]) : [];
    const properties = schema['properties'] as Record<string, Record<string, unknown>> | undefined;
    const paths: string[] = [];

    for (const field of required) {
      paths.push(basePath ? `${basePath}.${field}` : field);
    }

    if (properties) {
      for (const [fieldName, fieldSchema] of Object.entries(properties)) {
        if (!fieldSchema || typeof fieldSchema !== 'object') continue;
        const fs = fieldSchema as Record<string, unknown>;
        if (fs['type'] === 'object' && fs['properties']) {
          const nested = basePath ? `${basePath}.${fieldName}` : fieldName;
          paths.push(
            ...SwaggerSchemaExtractor.flattenRequiredPaths(fs as Record<string, unknown>, nested),
          );
        }
      }
    }

    return paths;
  }
}
