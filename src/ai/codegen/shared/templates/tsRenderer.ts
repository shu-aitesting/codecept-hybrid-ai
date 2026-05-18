export function toPascalCase(str: string): string {
  return str
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

export function toConstCase(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .replace(/[-\s]+/g, '_')
    .toUpperCase();
}

export function schemaPropertyToTsType(prop: Record<string, unknown>): string {
  const type = typeof prop['type'] === 'string' ? prop['type'] : 'unknown';
  switch (type) {
    case 'integer':
    case 'number':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'array': {
      const items = prop['items'] as Record<string, unknown> | undefined;
      if (items) return `${schemaPropertyToTsType(items)}[]`;
      return 'unknown[]';
    }
    case 'object':
      return 'Record<string, unknown>';
    case 'string':
      return 'string';
    default:
      return 'unknown';
  }
}

export function schemaToInterface(name: string, schema: Record<string, unknown>): string {
  const props = (schema['properties'] ?? {}) as Record<string, Record<string, unknown>>;
  const required = new Set<string>(
    Array.isArray(schema['required']) ? (schema['required'] as string[]) : [],
  );
  const lines: string[] = [`export interface ${name} {`];
  for (const [key, propSchema] of Object.entries(props)) {
    const tsType = schemaPropertyToTsType(propSchema);
    const opt = required.has(key) ? '' : '?';
    lines.push(`  ${key}${opt}: ${tsType};`);
  }
  lines.push('}');
  return lines.join('\n');
}
