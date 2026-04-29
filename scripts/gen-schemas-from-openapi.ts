#!/usr/bin/env ts-node
/**
 * Generate Zod schemas from an OpenAPI / Swagger spec.
 *
 * Usage:
 *   npm run schemas:gen -- --spec <path|url> [--out src/api/schemas] [--force]
 *
 * Supports:
 *   - OpenAPI 3.x JSON/YAML files
 *   - Swagger 2.0 JSON/YAML files (auto-converted via swagger2openapi)
 *   - Remote URLs (fetched, parsed by content-type)
 *
 * Idempotency: hashes spec + library version; skips generation if output is up-to-date
 * (override with --force).
 */
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as http from 'node:http';
import * as https from 'node:https';
import * as path from 'node:path';

import chalk from 'chalk';
import { Command } from 'commander';
import * as yaml from 'js-yaml';
import { generateZodClientFromOpenAPI } from 'openapi-zod-client';
import type { OpenAPIObject } from 'openapi3-ts';
import ora from 'ora';

// ─── CLI ─────────────────────────────────────────────────────────────────────

// ─── main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const program = new Command();
  program
    .name('schemas:gen')
    .description('Generate Zod schemas from an OpenAPI/Swagger spec')
    .requiredOption('--spec <path|url>', 'Path or URL to the OpenAPI/Swagger spec file')
    .option('--out <dir>', 'Output directory for generated schemas', 'src/api/schemas')
    .option('--force', 'Regenerate even if the spec has not changed', false)
    .parse(process.argv);

  const opts = program.opts<{ spec: string; out: string; force: boolean }>();
  const spinner = ora('Loading spec…').start();

  try {
    // 1. Load spec
    const rawSpec = await loadSpec(opts.spec);

    // 2. Parse (JSON or YAML)
    const parsed = parseSpec(rawSpec, opts.spec);

    // 3. Detect version and normalise to OpenAPI 3.x
    const openApiDoc = await normaliseToOpenApi3(parsed);

    // 4. Idempotency check
    const { version: libVersion } = JSON.parse(
      fs.readFileSync(
        path.join(process.cwd(), 'node_modules/openapi-zod-client/package.json'),
        'utf8',
      ),
    ) as { version: string };

    const hash = computeHash(JSON.stringify(openApiDoc) + libVersion);
    const outDir = path.resolve(process.cwd(), opts.out);
    const hashFile = path.join(outDir, '.openapi-hash');
    const generatedFile = path.join(outDir, '_generated.ts');

    if (!opts.force && fs.existsSync(hashFile)) {
      const existing = fs.readFileSync(hashFile, 'utf8').trim();
      if (existing === hash) {
        spinner.succeed(
          chalk.green('Schemas are up-to-date (spec unchanged). Use --force to regenerate.'),
        );
        return;
      }
    }

    spinner.text = 'Generating Zod schemas…';

    // 5. Generate into a tmp file, then rename atomically
    fs.mkdirSync(outDir, { recursive: true });
    const tmpFile = generatedFile + '.tmp';

    await generateZodClientFromOpenAPI({
      openApiDoc,
      distPath: tmpFile,
      options: {
        withDescription: false,
        withDocs: false,
        // Emit only schemas, no zodios client boilerplate
        withoutPathParam: false,
        shouldExportAllSchemas: true,
      },
    });

    // Prepend auto-generated header
    const generated = fs.readFileSync(tmpFile, 'utf8');
    const withHeader =
      `// AUTO-GENERATED — do not edit. Run \`npm run schemas:gen\` to refresh.\n` + generated;
    fs.writeFileSync(tmpFile, withHeader, 'utf8');

    // Atomic rename
    fs.renameSync(tmpFile, generatedFile);

    // 6. Update/create barrel index.ts to re-export hand-written + generated schemas
    updateBarrel(outDir);

    // 7. Write hash
    fs.writeFileSync(hashFile, hash, 'utf8');

    spinner.succeed(
      chalk.green(`Schemas written to ${path.relative(process.cwd(), generatedFile)}`),
    );
    console.log(chalk.dim('  Run `npm run typecheck` to verify generated output.'));
  } catch (err) {
    spinner.fail(chalk.red('Schema generation failed'));
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

// ─── helpers ──────────────────────────────────────────────────────────────────

export async function loadSpecFromFile(specPath: string): Promise<string> {
  const abs = path.isAbsolute(specPath) ? specPath : path.resolve(process.cwd(), specPath);
  if (!fs.existsSync(abs)) throw new Error(`Spec file not found: ${abs}`);
  return fs.readFileSync(abs, 'utf8');
}

async function loadSpec(specPath: string): Promise<string> {
  if (specPath.startsWith('http://') || specPath.startsWith('https://')) {
    return fetchUrl(specPath);
  }
  return loadSpecFromFile(specPath);
}

function fetchUrl(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https://') ? https : http;
    client
      .get(url, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
        res.on('error', reject);
      })
      .on('error', reject);
  });
}

export function parseSpec(raw: string, specPath: string): Record<string, unknown> {
  const lower = specPath.toLowerCase();
  if (lower.endsWith('.yaml') || lower.endsWith('.yml')) {
    return yaml.load(raw) as Record<string, unknown>;
  }
  // Default: try JSON, fall back to YAML (handles URLs with no extension)
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return yaml.load(raw) as Record<string, unknown>;
  }
}

export async function normaliseToOpenApi3(parsed: Record<string, unknown>): Promise<OpenAPIObject> {
  if (typeof parsed['openapi'] === 'string' && parsed['openapi'].startsWith('3.')) {
    return parsed as unknown as OpenAPIObject;
  }
  if (parsed['swagger'] === '2.0') {
    // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
    const swagger2openapi = require('swagger2openapi') as {
      convertObj: (
        obj: Record<string, unknown>,
        opts: Record<string, unknown>,
        cb: (err: Error | null, result: { openapi: Record<string, unknown> }) => void,
      ) => void;
    };
    return new Promise((resolve, reject) => {
      swagger2openapi.convertObj(
        parsed,
        { warnOnly: true, resolveInternal: true },
        (err, result) => {
          if (err) return reject(new Error(`swagger2openapi conversion failed: ${err.message}`));
          resolve(result.openapi as unknown as OpenAPIObject);
        },
      );
    });
  }
  throw new Error(
    `Unrecognised spec format. Expected "openapi: 3.x" or "swagger: 2.0", ` +
      `got openapi=${String(parsed['openapi'])}, swagger=${String(parsed['swagger'])}`,
  );
}

export function updateBarrel(outDir: string): void {
  const barrel = path.join(outDir, 'index.ts');
  const generatedExport = `export * from './_generated';`;

  if (!fs.existsSync(barrel)) {
    fs.writeFileSync(barrel, `${generatedExport}\n`, 'utf8');
    return;
  }

  const existing = fs.readFileSync(barrel, 'utf8');
  if (!existing.includes(generatedExport)) {
    fs.writeFileSync(barrel, `${generatedExport}\n${existing}`, 'utf8');
  }
}

export function computeHash(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

// ─── run ─────────────────────────────────────────────────────────────────────

if (require.main === module) {
  void main();
}
