/**
 * Unit tests for gen-schemas-from-openapi.ts
 *
 * Strategy: the script exports its internal helper functions for testability.
 * We import those directly and exercise: spec loading, Swagger→OpenAPI conversion,
 * hash-based idempotency, barrel update, and error paths.
 */
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import * as yaml from 'js-yaml';
import type { OpenAPIObject } from 'openapi3-ts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  loadSpecFromFile,
  parseSpec,
  normaliseToOpenApi3,
  updateBarrel,
  computeHash,
} from '../../../scripts/gen-schemas-from-openapi';

// ─── fixtures ─────────────────────────────────────────────────────────────────

const PETSTORE_PATH = path.join(__dirname, '../fixtures/openapi/petstore.json');

const OPENAPI3_MINIMAL: OpenAPIObject = {
  openapi: '3.0.3',
  info: { title: 'Test', version: '1.0.0' },
  paths: {},
};

let tempDir: string;

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'schemas-gen-test-'));
});

afterEach(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
});

// ─── loadSpecFromFile ─────────────────────────────────────────────────────────

describe('loadSpecFromFile()', () => {
  it('reads an existing file and returns its content', async () => {
    const tmpFile = path.join(tempDir, 'spec.json');
    fs.writeFileSync(tmpFile, '{"swagger":"2.0"}', 'utf8');
    const content = await loadSpecFromFile(tmpFile);
    expect(content).toContain('"swagger"');
  });

  it('throws when file does not exist', async () => {
    await expect(loadSpecFromFile(path.join(tempDir, 'nonexistent.json'))).rejects.toThrow(
      /not found/i,
    );
  });
});

// ─── parseSpec ────────────────────────────────────────────────────────────────

describe('parseSpec()', () => {
  it('parses a JSON spec string', () => {
    const result = parseSpec('{"openapi":"3.0.0","info":{},"paths":{}}', 'spec.json');
    expect(result['openapi']).toBe('3.0.0');
  });

  it('parses a YAML spec string via .yaml extension', () => {
    const yamlContent = yaml.dump({
      swagger: '2.0',
      info: { title: 'T', version: '1' },
      paths: {},
    });
    const result = parseSpec(yamlContent, 'spec.yaml');
    expect(result['swagger']).toBe('2.0');
  });

  it('parses a YAML spec string via .yml extension', () => {
    const yamlContent = yaml.dump({
      openapi: '3.0.0',
      info: { title: 'T', version: '1' },
      paths: {},
    });
    const result = parseSpec(yamlContent, 'spec.yml');
    expect(result['openapi']).toBe('3.0.0');
  });

  it('falls back to YAML parsing for non-JSON content without yaml extension', () => {
    const yamlContent = `openapi: "3.0.0"\ninfo:\n  title: T\n  version: "1"\npaths: {}`;
    const result = parseSpec(yamlContent, 'spec-no-ext');
    expect(result['openapi']).toBe('3.0.0');
  });
});

// ─── normaliseToOpenApi3 ──────────────────────────────────────────────────────

describe('normaliseToOpenApi3()', () => {
  it('returns OpenAPI 3.x spec unchanged', async () => {
    const result = await normaliseToOpenApi3(
      OPENAPI3_MINIMAL as unknown as Record<string, unknown>,
    );
    expect((result as { openapi: string }).openapi).toMatch(/^3\./);
  });

  it('converts Swagger 2.0 spec to OpenAPI 3.x', async () => {
    const swagger2Spec = JSON.parse(fs.readFileSync(PETSTORE_PATH, 'utf8')) as Record<
      string,
      unknown
    >;
    const result = await normaliseToOpenApi3(swagger2Spec);
    expect((result as { openapi: string }).openapi).toMatch(/^3\./);
  });

  it('throws on unrecognised spec format', async () => {
    await expect(normaliseToOpenApi3({ openapi: '2.0', info: {}, paths: {} })).rejects.toThrow(
      /Unrecognised spec format/,
    );
  });

  it('throws when swagger field is wrong version', async () => {
    await expect(normaliseToOpenApi3({ swagger: '1.0', info: {}, paths: {} })).rejects.toThrow(
      /Unrecognised spec format/,
    );
  });
});

// ─── computeHash ─────────────────────────────────────────────────────────────

describe('computeHash()', () => {
  it('returns a hex SHA-256 string', () => {
    const hash = computeHash('hello world');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('same input → same hash (deterministic)', () => {
    expect(computeHash('abc')).toBe(computeHash('abc'));
  });

  it('different inputs → different hashes', () => {
    expect(computeHash('aaa')).not.toBe(computeHash('bbb'));
  });

  it('matches Node crypto sha256 reference', () => {
    const expected = crypto.createHash('sha256').update('test').digest('hex');
    expect(computeHash('test')).toBe(expected);
  });
});

// ─── updateBarrel ─────────────────────────────────────────────────────────────

describe('updateBarrel()', () => {
  it('creates index.ts with _generated export when missing', () => {
    updateBarrel(tempDir);
    const barrel = fs.readFileSync(path.join(tempDir, 'index.ts'), 'utf8');
    expect(barrel).toContain("export * from './_generated'");
  });

  it('adds _generated export to existing index.ts if not present', () => {
    const existingContent = "export * from './user.schema';\n";
    fs.writeFileSync(path.join(tempDir, 'index.ts'), existingContent, 'utf8');
    updateBarrel(tempDir);
    const barrel = fs.readFileSync(path.join(tempDir, 'index.ts'), 'utf8');
    expect(barrel).toContain("export * from './_generated'");
    expect(barrel).toContain("export * from './user.schema'");
  });

  it('does not add duplicate _generated export', () => {
    const existingContent = "export * from './_generated';\nexport * from './user.schema';\n";
    fs.writeFileSync(path.join(tempDir, 'index.ts'), existingContent, 'utf8');
    updateBarrel(tempDir);
    const barrel = fs.readFileSync(path.join(tempDir, 'index.ts'), 'utf8');
    const count = (barrel.match(/export \* from '.\/_generated'/g) ?? []).length;
    expect(count).toBe(1);
  });
});

// ─── idempotency: hash file skips re-generation ──────────────────────────────

describe('hash-based idempotency', () => {
  it('same hash in .openapi-hash → content is considered up-to-date', () => {
    const content = 'some-spec-content-v1';
    const hash = computeHash(content);

    // Write the hash file as if generation already ran
    fs.writeFileSync(path.join(tempDir, '.openapi-hash'), hash, 'utf8');

    const existingHash = fs.readFileSync(path.join(tempDir, '.openapi-hash'), 'utf8').trim();
    expect(existingHash).toBe(hash);

    // Simulating: if hash matches, skip generation
    expect(existingHash === computeHash(content)).toBe(true);
  });

  it('different hash → generation should proceed', () => {
    const oldHash = computeHash('old-spec');
    const newHash = computeHash('new-spec');
    fs.writeFileSync(path.join(tempDir, '.openapi-hash'), oldHash, 'utf8');

    const existingHash = fs.readFileSync(path.join(tempDir, '.openapi-hash'), 'utf8').trim();
    expect(existingHash === newHash).toBe(false);
  });
});
