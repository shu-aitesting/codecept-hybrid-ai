import { faker } from '@faker-js/faker';

import type { FieldConstraint } from '@api/swagger/SwaggerSchemaExtractor';

import type { EndpointModel } from '@ai/codegen/shared/EndpointModel';

import { DataContext } from './DataContext';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface MutationSpec {
  path: string;
  kind:
    | 'missing-required'
    | 'invalid-pattern'
    | 'invalid-enum'
    | 'out-of-range'
    | 'over-length'
    | 'type-mismatch'
    | 'missing-header'
    | 'missing-token'
    | 'invalid-token';
  constraint?: FieldConstraint;
}

export interface BuildOpts {
  seed?: number;
  includeOptional?: boolean;
  ctx?: DataContext;
  mutation?: MutationSpec;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function hashCode(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function seededRandom(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) | 0;
    return (s >>> 0) / 0x100000000;
  };
}

function getByPath(obj: unknown, parts: string[]): unknown {
  let cur = obj;
  for (const part of parts) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

function setByPath(obj: unknown, parts: string[], value: unknown): void {
  if (parts.length === 0) return;
  const parent = parts.length === 1 ? obj : getByPath(obj, parts.slice(0, -1));
  if (parent !== null && typeof parent === 'object') {
    (parent as Record<string, unknown>)[parts[parts.length - 1]] = value;
  }
}

function deleteByPath(obj: unknown, parts: string[]): void {
  if (parts.length === 0) return;
  const parent = parts.length === 1 ? obj : getByPath(obj, parts.slice(0, -1));
  if (parent !== null && typeof parent === 'object') {
    delete (parent as Record<string, unknown>)[parts[parts.length - 1]];
  }
}

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function applyMutation(data: unknown, mutation?: MutationSpec): unknown {
  if (!mutation || data === undefined || data === null || typeof data !== 'object') {
    return data;
  }
  const cloned = deepClone(data);
  const parts = mutation.path.split('.');

  switch (mutation.kind) {
    case 'missing-required':
      deleteByPath(cloned, parts);
      break;
    case 'invalid-pattern':
      setByPath(cloned, parts, '###');
      break;
    case 'invalid-enum':
      setByPath(cloned, parts, '__INVALID__');
      break;
    case 'out-of-range':
      setByPath(cloned, parts, Number.MAX_SAFE_INTEGER);
      break;
    case 'type-mismatch': {
      const cur = getByPath(cloned, parts);
      setByPath(cloned, parts, typeof cur === 'string' ? 12345 : 'wrong-type');
      break;
    }
    case 'over-length': {
      const maxLen = mutation.constraint?.maxLength ?? 255;
      setByPath(cloned, parts, 'x'.repeat(maxLen + 1));
      break;
    }
    // auth mutations are handled at RestClient level — not body mutations
    case 'missing-header':
    case 'missing-token':
    case 'invalid-token':
      break;
  }
  return cloned;
}

// ---------------------------------------------------------------------------
// jsf singleton (CJS require for 0.5.x compat with module:commonjs)
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
const _jsf = require('json-schema-faker') as {
  generate: (schema: unknown) => unknown;
  resolve: (schema: unknown) => Promise<unknown>;
  option: (nameOrOpts: string | Record<string, unknown>, value?: unknown) => void;
  extend: (name: string, cb: () => unknown) => void;
};

_jsf.extend('faker', () => faker);

// ---------------------------------------------------------------------------
// DataFactory
// ---------------------------------------------------------------------------

export class DataFactory {
  async build(endpoint: EndpointModel, opts: BuildOpts = {}): Promise<unknown> {
    const schema = endpoint.requestBody?.schema;
    if (!schema) return undefined;
    const seed = opts.seed ?? hashCode(endpoint.operationId);
    return this.buildFromSchema(schema, { ...opts, seed });
  }

  async buildFromSchema(schema: Record<string, unknown>, opts: BuildOpts = {}): Promise<unknown> {
    const seed = opts.seed ?? 0;
    faker.seed(seed);
    _jsf.option({
      alwaysFakeOptionals: opts.includeOptional ?? false,
      useExamplesValue: true,
      useDefaultValue: true,
      fixedProbabilities: true,
      random: seededRandom(seed),
    });
    const data = await _jsf.resolve(schema);
    const resolved = opts.ctx ? opts.ctx.resolve(data) : data;
    return applyMutation(resolved, opts.mutation);
  }
}
