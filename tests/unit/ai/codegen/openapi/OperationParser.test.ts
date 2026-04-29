import * as fs from 'node:fs';
import * as path from 'node:path';

import type { OpenAPIObject } from 'openapi3-ts';
import { describe, expect, it } from 'vitest';

import {
  parseOperations,
  groupByTag,
  type Operation,
} from '../../../../../src/ai/codegen/openapi/OperationParser';

// ─── fixture helpers ──────────────────────────────────────────────────────────

function loadFixture(name: string): OpenAPIObject {
  const p = path.join(__dirname, '../../../fixtures/openapi', name);
  return JSON.parse(fs.readFileSync(p, 'utf8')) as OpenAPIObject;
}

function findOp(ops: Operation[], id: string): Operation {
  const op = ops.find((o) => o.operationId === id);
  if (!op) throw new Error(`Operation "${id}" not found`);
  return op;
}

const multiTagSpec = loadFixture('petstore-multi-tag.json');

// ─── parseOperations — basic extraction ───────────────────────────────────────

describe('parseOperations() — basic extraction', () => {
  it('extracts all operations from multi-tag spec', () => {
    const ops = parseOperations(multiTagSpec);
    // /pets GET+POST, /pets/{id} GET+DELETE, /users GET+POST, /users/{id} GET, /admin/config GET = 8
    expect(ops.length).toBe(8);
  });

  it('assigns first tag; defaults to "default" when no tags', () => {
    const spec: OpenAPIObject = {
      openapi: '3.0.3',
      info: { title: 'T', version: '1' },
      paths: {
        '/health': {
          get: {
            operationId: 'healthCheck',
            responses: { '200': { description: 'OK' } },
          },
        },
      },
    };
    const ops = parseOperations(spec);
    expect(ops[0].tag).toBe('default');
  });

  it('generates operationId from method+path when missing', () => {
    const spec: OpenAPIObject = {
      openapi: '3.0.3',
      info: { title: 'T', version: '1' },
      paths: {
        '/items/{id}': {
          get: {
            tags: ['items'],
            responses: { '200': { description: 'OK' } },
          },
        },
      },
    };
    const ops = parseOperations(spec);
    expect(ops[0].operationId).toContain('get');
    expect(ops[0].operationId).toContain('Id');
  });

  it('captures path and query parameters', () => {
    const ops = parseOperations(multiTagSpec);
    const listPets = findOp(ops, 'listPets');
    expect(listPets.parameters.some((p) => p.in === 'query' && p.name === 'limit')).toBe(true);

    const getPet = findOp(ops, 'getPetById');
    expect(getPet.parameters.some((p) => p.in === 'path' && p.name === 'id')).toBe(true);
  });

  it('marks deprecated operations', () => {
    const ops = parseOperations(multiTagSpec);
    expect(findOp(ops, 'deletePet').deprecated).toBe(true);
  });

  it('marks operations with security', () => {
    const ops = parseOperations(multiTagSpec);
    expect(findOp(ops, 'createPet').security).toBe(true);
    expect(findOp(ops, 'listPets').security).toBe(false);
  });

  it('extracts response schema ref', () => {
    const ops = parseOperations(multiTagSpec);
    expect(findOp(ops, 'getPetById').responseRef).toContain('Pet');
  });

  it('extracts requestBody schema ref for POST', () => {
    const ops = parseOperations(multiTagSpec);
    expect(findOp(ops, 'createPet').requestBodyRef).toContain('NewPet');
  });

  it('requestBodyRef is undefined for GET', () => {
    const ops = parseOperations(multiTagSpec);
    expect(findOp(ops, 'listPets').requestBodyRef).toBeUndefined();
  });
});

// ─── parseOperations — filters ────────────────────────────────────────────────

describe('parseOperations() — --tags filter', () => {
  it('keeps only operations matching specified tags', () => {
    const ops = parseOperations(multiTagSpec, { tags: ['pets'] });
    expect(ops.every((o) => o.tag === 'pets')).toBe(true);
    expect(ops.length).toBeGreaterThan(0);
  });

  it('returns empty when tag does not match any operation', () => {
    const ops = parseOperations(multiTagSpec, { tags: ['nonexistent'] });
    expect(ops).toHaveLength(0);
  });

  it('tag matching is case-insensitive', () => {
    const ops = parseOperations(multiTagSpec, { tags: ['PETS'] });
    expect(ops.length).toBeGreaterThan(0);
  });

  it('multiple tags keep ops from all matching tags', () => {
    const ops = parseOperations(multiTagSpec, { tags: ['pets', 'users'] });
    const tags = new Set(ops.map((o) => o.tag));
    expect(tags.has('pets')).toBe(true);
    expect(tags.has('users')).toBe(true);
    expect(tags.has('admin')).toBe(false);
  });
});

describe('parseOperations() — --include-paths filter', () => {
  it('keeps only paths matching glob pattern', () => {
    const ops = parseOperations(multiTagSpec, { includePaths: ['/pets*'] });
    expect(ops.every((o) => o.path.startsWith('/pets'))).toBe(true);
  });

  it('** glob matches nested paths', () => {
    const ops = parseOperations(multiTagSpec, { includePaths: ['/admin/**'] });
    expect(ops.some((o) => o.path.startsWith('/admin'))).toBe(true);
  });

  it('no matching path → empty result', () => {
    const ops = parseOperations(multiTagSpec, { includePaths: ['/unknown/**'] });
    expect(ops).toHaveLength(0);
  });
});

describe('parseOperations() — --exclude-deprecated filter', () => {
  it('removes deprecated operations', () => {
    const ops = parseOperations(multiTagSpec, { excludeDeprecated: true });
    expect(ops.every((o) => !o.deprecated)).toBe(true);
  });

  it('without flag, deprecated ops are included', () => {
    const ops = parseOperations(multiTagSpec);
    expect(ops.some((o) => o.deprecated)).toBe(true);
  });
});

describe('parseOperations() — combined filters', () => {
  it('tags + excludeDeprecated work together', () => {
    const ops = parseOperations(multiTagSpec, { tags: ['pets'], excludeDeprecated: true });
    expect(ops.every((o) => o.tag === 'pets' && !o.deprecated)).toBe(true);
  });
});

// ─── groupByTag ───────────────────────────────────────────────────────────────

describe('groupByTag()', () => {
  it('groups operations by their tag', () => {
    const ops = parseOperations(multiTagSpec);
    const grouped = groupByTag(ops);
    expect(grouped.has('pets')).toBe(true);
    expect(grouped.has('users')).toBe(true);
    expect(grouped.has('admin')).toBe(true);
  });

  it('each group contains only ops with that tag', () => {
    const ops = parseOperations(multiTagSpec);
    const grouped = groupByTag(ops);
    for (const [tag, tagOps] of grouped.entries()) {
      expect(tagOps.every((o: Operation) => o.tag === tag)).toBe(true);
    }
  });

  it('returns empty map for empty input', () => {
    expect(groupByTag([])).toEqual(new Map());
  });

  it('single-tag operations land in correct group', () => {
    const ops = parseOperations(multiTagSpec, { tags: ['admin'] });
    const grouped = groupByTag(ops);
    expect(grouped.size).toBe(1);
    expect(grouped.has('admin')).toBe(true);
  });
});

// ─── edge cases ───────────────────────────────────────────────────────────────

describe('parseOperations() — edge cases', () => {
  it('empty paths → returns empty array', () => {
    const spec: OpenAPIObject = {
      openapi: '3.0.3',
      info: { title: 'T', version: '1' },
      paths: {},
    };
    expect(parseOperations(spec)).toHaveLength(0);
  });

  it('operation with multiple tags uses only the first', () => {
    const spec: OpenAPIObject = {
      openapi: '3.0.3',
      info: { title: 'T', version: '1' },
      paths: {
        '/multi': {
          get: {
            operationId: 'getMulti',
            tags: ['alpha', 'beta'],
            responses: { '200': { description: 'OK' } },
          },
        },
      },
    };
    const ops = parseOperations(spec);
    expect(ops[0].tag).toBe('alpha');
  });
});
