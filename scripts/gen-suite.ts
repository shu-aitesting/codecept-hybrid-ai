#!/usr/bin/env ts-node
/**
 * gen-suite — Generate typed service classes + CodeceptJS test files from an OpenAPI spec.
 *
 * Usage:
 *   npm run gen:suite -- \
 *     --spec <path|url> \
 *     [--tags users,pets] \
 *     [--include-paths "/api/v2/*"] \
 *     [--exclude-deprecated] \
 *     [--out-services src/api/services/_generated] \
 *     [--out-tests tests/api/_generated] \
 *     [--dry-run] \
 *     [--no-cache]
 */
import * as path from 'node:path';

import chalk from 'chalk';
import { Command } from 'commander';
import ora from 'ora';

import { OpenApiSuiteAgent } from '../src/ai/codegen/OpenApiSuiteAgent';

import { loadSpecFromFile, parseSpec, normaliseToOpenApi3 } from './gen-schemas-from-openapi';

// ─── CLI ─────────────────────────────────────────────────────────────────────

const program = new Command();
program
  .name('gen:suite')
  .description('Generate typed service + test suite from an OpenAPI/Swagger spec')
  .requiredOption('--spec <path|url>', 'Path or URL to the OpenAPI/Swagger spec file')
  .option('--tags <tags>', 'Comma-separated list of tags to include (e.g. "users,pets")')
  .option('--include-paths <globs>', 'Comma-separated path glob patterns (e.g. "/api/v2/*")')
  .option('--exclude-deprecated', 'Skip deprecated operations', false)
  .option(
    '--out-services <dir>',
    'Output dir for generated service files',
    path.join(process.cwd(), 'src', 'api', 'services', '_generated'),
  )
  .option(
    '--out-tests <dir>',
    'Output dir for generated test files',
    path.join(process.cwd(), 'tests', 'api', '_generated'),
  )
  .option('--schemas-import <path>', 'Import path for generated schemas', '@api/schemas/_generated')
  .option('--dry-run', 'Preview output without writing files', false)
  .option('--no-cache', 'Skip idempotency cache (re-call LLM every time)')
  .parse(process.argv);

const opts = program.opts<{
  spec: string;
  tags?: string;
  includePaths?: string;
  excludeDeprecated: boolean;
  outServices: string;
  outTests: string;
  schemasImport: string;
  dryRun: boolean;
  cache: boolean;
}>();

// ─── main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const spinner = ora('Loading spec…').start();

  try {
    // Load + normalise spec
    const rawSpec = await loadSpecFromFile(opts.spec);
    const parsed = parseSpec(rawSpec, opts.spec);
    const openApiDoc = await normaliseToOpenApi3(parsed);

    spinner.text = 'Generating suite…';

    const agent = new OpenApiSuiteAgent();
    const results = await agent.run(
      {
        openApiDoc,
        filterOpts: {
          tags: opts.tags ? opts.tags.split(',').map((t) => t.trim()) : undefined,
          includePaths: opts.includePaths
            ? opts.includePaths.split(',').map((p) => p.trim())
            : undefined,
          excludeDeprecated: opts.excludeDeprecated,
        },
        outServices: opts.outServices,
        outTests: opts.outTests,
        schemasImportPath: opts.schemasImport,
      },
      {
        dryRun: opts.dryRun,
        skipCache: !opts.cache,
      },
    );

    if (results.length === 0) {
      spinner.warn(chalk.yellow('No operations matched the given filters — nothing generated.'));
      return;
    }

    if (opts.dryRun) {
      spinner.succeed(chalk.cyan(`[dry-run] Would generate ${results.length} tag(s):`));
      for (const r of results) {
        console.log(chalk.cyan(`\n── ${r.tag} ──`));
        console.log(chalk.dim('Service:'));
        console.log(r.serviceTs.slice(0, 500) + (r.serviceTs.length > 500 ? '\n...' : ''));
        console.log(chalk.dim('\nTest (first 500 chars):'));
        console.log(r.testTs.slice(0, 500) + (r.testTs.length > 500 ? '\n...' : ''));
      }
    } else {
      spinner.succeed(chalk.green(`Generated ${results.length} tag(s):`));
      for (const r of results) {
        console.log(
          chalk.green(
            `  ✓ ${r.tag}: ${path.relative(process.cwd(), r.serviceFile)} + ${path.relative(process.cwd(), r.testFile)}`,
          ),
        );
      }
      console.log(chalk.dim('\nRun `npm run typecheck` to verify generated output.'));
    }
  } catch (err) {
    spinner.fail(chalk.red('Suite generation failed'));
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

if (require.main === module) {
  void main();
}
