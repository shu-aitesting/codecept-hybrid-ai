export class DataContext {
  private store = new Map<string, unknown>();

  capture(key: string, value: unknown): void {
    this.store.set(key, value);
  }

  get(key: string): unknown {
    return this.store.get(key);
  }

  has(key: string): boolean {
    return this.store.has(key);
  }

  resolve<T>(template: T): T {
    return this.resolveValue(template) as T;
  }

  clear(): void {
    this.store.clear();
  }

  private resolveValue(value: unknown): unknown {
    if (typeof value === 'string') {
      // If the entire string is a single ${key} expression, return the raw stored value (preserves type)
      const single = /^\$\{([^}]+)\}$/.exec(value);
      if (single) {
        const stored = this.store.get(single[1].trim());
        return stored !== undefined ? stored : value;
      }
      // Otherwise interpolate as string (multiple placeholders or surrounding text)
      return value.replace(/\$\{([^}]+)\}/g, (_, key: string) => {
        const stored = this.store.get(key.trim());
        return stored !== undefined ? String(stored) : `\${${key}}`;
      });
    }
    if (Array.isArray(value)) {
      return value.map((v) => this.resolveValue(v));
    }
    if (value !== null && typeof value === 'object') {
      const result: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        result[k] = this.resolveValue(v);
      }
      return result;
    }
    return value;
  }
}
