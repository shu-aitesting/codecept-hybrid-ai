#!/usr/bin/env ts-node
import * as fs from 'node:fs';
import * as path from 'node:path';

import chalk from 'chalk';
import { Command } from 'commander';
import ora from 'ora';

import '../src/core/config/ConfigLoader';
import { CurlToApiAgent } from '../src/ai/codegen/CurlToApiAgent';
import { HtmlToFragmentAgent } from '../src/ai/codegen/HtmlToFragmentAgent';
import { ScenarioGeneratorAgent } from '../src/ai/codegen/ScenarioGeneratorAgent';

// ─── helpers ────────────────────────────────────────────────────────────────

/** Insert `line` after the last regex match in `text`. Returns updated text or null if no match. */
function insertAfterLast(text: string, pattern: RegExp, line: string): string | null {
  const last = [...text.matchAll(pattern)].at(-1);
  if (last?.index === undefined) return null;
  const at = last.index + last[0].length;
  return `${text.slice(0, at)}\n${line}${text.slice(at)}`;
}

function updateStepsDts(dtsPath: string, key: string, relImport: string): boolean {
  let dts = fs.readFileSync(dtsPath, 'utf8');
  let changed = false;

  if (!dts.includes(`type ${key} =`)) {
    const updated = insertAfterLast(
      dts,
      /^type \w+Steps = .+;$/gm,
      `type ${key} = typeof import('${relImport}');`,
    );
    if (updated) {
      dts = updated;
      changed = true;
    }
  }
  if (!dts.includes(`${key}:`)) {
    const updated = insertAfterLast(dts, /^ {4}\w+Steps: \w+Steps;$/gm, `    ${key}: ${key};`);
    if (updated) {
      dts = updated;
      changed = true;
    }
  }

  if (changed) fs.writeFileSync(dtsPath, dts, 'utf8');
  return changed;
}

function updateCodeceptConf(confPath: string, key: string, relFile: string): boolean {
  const conf = fs.readFileSync(confPath, 'utf8');
  if (conf.includes(`${key}:`)) return false;

  const updated = insertAfterLast(
    conf,
    /^ {4}\w+Steps: '\.\/src\/ui\/steps\/.+',$/gm,
    `    ${key}: '${relFile}',`,
  );
  if (!updated) return false;

  fs.writeFileSync(confPath, updated, 'utf8');
  return true;
}

/**
 * After generating a Steps file, automatically register it in:
 *   - steps.d.ts       (type alias + SupportObject property)
 *   - codecept.conf.ts (include section)
 *
 * Both edits are idempotent — safe to run multiple times for the same name.
 * Returns the list of files that were actually modified.
 */
function registerStepObject(fragmentName: string, root: string): string[] {
  const key = fragmentName.charAt(0).toLowerCase() + fragmentName.slice(1) + 'Steps';
  const className = `${fragmentName}Steps`;
  const modified: string[] = [];

  const dtsPath = path.join(root, 'steps.d.ts');
  if (fs.existsSync(dtsPath) && updateStepsDts(dtsPath, key, `./src/ui/steps/${className}`)) {
    modified.push('steps.d.ts');
  }

  const confPath = path.join(root, 'codecept.conf.ts');
  if (
    fs.existsSync(confPath) &&
    updateCodeceptConf(confPath, key, `./src/ui/steps/${className}.ts`)
  ) {
    modified.push('codecept.conf.ts');
  }

  return modified;
}

// ─── program ────────────────────────────────────────────────────────────────

const program = new Command();
program.name('gen').description('AI Code Generation CLI for codecept-hybrid').version('1.0.0');

// ─── gen page ───────────────────────────────────────────────────────────────
program
  .command('page')
  .description('Generate Fragment + Page + Test from HTML or a URL')
  .option('--url <url>', 'Fetch HTML from URL (requires live network)')
  .option('--html-file <path>', 'Read HTML from local file')
  .option('--name <name>', 'Fragment/Page class name (PascalCase)', 'GeneratedFragment')
  .option('--output-dir <dir>', 'Root output directory', path.join(process.cwd(), 'src', 'ui'))
  .option('--dry-run', 'Preview output without writing files')
  .option('--no-cache', 'Skip idempotency cache (re-call LLM)')
  .option('--max-retries <n>', 'Max LLM retries on validation failure', '2')
  .action(async (opts: Record<string, string | boolean>) => {
    let html = '';

    if (opts['htmlFile']) {
      const filePath = opts['htmlFile'] as string;
      if (!fs.existsSync(filePath)) {
        console.error(chalk.red(`File not found: ${filePath}`));
        process.exit(1);
      }
      html = fs.readFileSync(filePath, 'utf8');
    } else if (opts['url']) {
      const spinner = ora(`Fetching ${opts['url']}…`).start();
      try {
        const res = await fetch(opts['url'] as string);
        html = await res.text();
        spinner.succeed(`Fetched ${Math.round(html.length / 1024)} KB raw HTML`);
      } catch (err) {
        spinner.fail(`Fetch failed: ${(err as Error).message}`);
        process.exit(1);
      }
    } else {
      console.error(chalk.red('Provide --url or --html-file'));
      process.exit(1);
    }

    const spinner = ora('Generating Fragment + Page + Test…').start();
    try {
      const agent = new HtmlToFragmentAgent();
      const fragmentName = opts['name'] as string;
      const result = await agent.run(
        {
          html,
          fragmentName,
          outputDir: opts['outputDir'] as string,
        },
        {
          dryRun: !!opts['dryRun'],
          skipCache: !opts['cache'],
          maxRetries: Number(opts['maxRetries'] ?? 2),
        },
      );
      spinner.succeed(`Generated ${result.fragments.length} fragment(s)`);

      if (opts['dryRun']) {
        for (const frag of result.fragments) {
          console.log('\n' + chalk.cyan(`── ${frag.name}Fragment.ts ──`));
          console.log(frag.fragmentTs);
        }
        console.log('\n' + chalk.cyan('── pageTs ──'));
        console.log(result.pageTs);
        console.log('\n' + chalk.cyan('── stepsTs ──'));
        console.log(result.stepsTs);
        console.log('\n' + chalk.cyan('── testTs ──'));
        console.log(result.testTs);
      } else {
        const fragNames = result.fragments.map((f) => `${f.name}Fragment`).join(', ');
        console.log(chalk.green(`Files written: ${fragNames}, Page, Test.`));

        // Auto-register the new Steps file in codecept.conf.ts and steps.d.ts
        const registered = registerStepObject(fragmentName, process.cwd());
        if (registered.length > 0) {
          console.log(chalk.green(`Registered ${fragmentName}Steps in: ${registered.join(', ')}`));
        }

        console.log(chalk.dim('Run `npm run typecheck` to verify.'));
      }
    } catch (err) {
      spinner.fail(`Generation failed: ${(err as Error).message}`);
      process.exit(1);
    }
  });

// ─── gen api ────────────────────────────────────────────────────────────────
program
  .command('api')
  .description('Generate Service + API Test from a cURL command')
  .option('--curl <curl>', 'cURL command string')
  .option('--curl-file <path>', 'Read cURL command from file')
  .option('--name <name>', 'Service class name (PascalCase, without "Service" suffix)', 'Generated')
  .option('--output-dir <dir>', 'Root output directory', path.join(process.cwd(), 'src', 'api'))
  .option('--dry-run', 'Preview output without writing files')
  .option('--no-cache', 'Skip idempotency cache')
  .option('--max-retries <n>', 'Max LLM retries on validation failure', '2')
  .action(async (opts: Record<string, string | boolean>) => {
    let curl = '';

    if (opts['curlFile']) {
      const filePath = opts['curlFile'] as string;
      if (!fs.existsSync(filePath)) {
        console.error(chalk.red(`File not found: ${filePath}`));
        process.exit(1);
      }
      curl = fs.readFileSync(filePath, 'utf8').trim();
    } else if (opts['curl']) {
      curl = opts['curl'] as string;
    } else {
      console.error(chalk.red('Provide --curl or --curl-file'));
      process.exit(1);
    }

    const spinner = ora('Generating Service + API Test…').start();
    try {
      const agent = new CurlToApiAgent();
      const result = await agent.run(
        {
          curl,
          serviceName: opts['name'] as string,
          outputDir: opts['outputDir'] as string,
        },
        {
          dryRun: !!opts['dryRun'],
          skipCache: !opts['cache'],
          maxRetries: Number(opts['maxRetries'] ?? 2),
        },
      );
      spinner.succeed('Generated');
      if (opts['dryRun']) {
        console.log('\n' + chalk.cyan('── serviceTs ──'));
        console.log(result.serviceTs);
        console.log('\n' + chalk.cyan('── testTs ──'));
        console.log(result.testTs);
      } else {
        console.log(chalk.green('Files written.'));
      }
    } catch (err) {
      spinner.fail(`Generation failed: ${(err as Error).message}`);
      process.exit(1);
    }
  });

// ─── gen scenario ────────────────────────────────────────────────────────────
program
  .command('scenario')
  .description('Generate Gherkin feature + step definitions from a user story')
  .option('--story <story>', 'User story text')
  .option('--story-file <path>', 'Read user story from file')
  .option('--name <name>', 'Feature name (PascalCase)', 'GeneratedFeature')
  .option(
    '--output-dir <dir>',
    'Output directory for .feature and .steps.ts',
    path.join(process.cwd(), 'tests', 'bdd'),
  )
  .option('--dry-run', 'Preview output without writing files')
  .option('--no-cache', 'Skip idempotency cache')
  .option('--max-retries <n>', 'Max LLM retries on validation failure', '2')
  .action(async (opts: Record<string, string | boolean>) => {
    let story = '';

    if (opts['storyFile']) {
      const filePath = opts['storyFile'] as string;
      if (!fs.existsSync(filePath)) {
        console.error(chalk.red(`File not found: ${filePath}`));
        process.exit(1);
      }
      story = fs.readFileSync(filePath, 'utf8').trim();
    } else if (opts['story']) {
      story = opts['story'] as string;
    } else {
      console.error(chalk.red('Provide --story or --story-file'));
      process.exit(1);
    }

    const spinner = ora('Generating Gherkin scenarios…').start();
    try {
      const agent = new ScenarioGeneratorAgent();
      const result = await agent.run(
        {
          userStory: story,
          featureName: opts['name'] as string,
          outputDir: opts['outputDir'] as string,
        },
        {
          dryRun: !!opts['dryRun'],
          skipCache: !opts['cache'],
          maxRetries: Number(opts['maxRetries'] ?? 2),
        },
      );
      spinner.succeed('Generated');
      if (opts['dryRun']) {
        console.log('\n' + chalk.cyan('── featureFile ──'));
        console.log(result.featureFile);
        console.log('\n' + chalk.cyan('── stepsTs ──'));
        console.log(result.stepsTs);
      } else {
        console.log(chalk.green('Files written.'));
      }
    } catch (err) {
      spinner.fail(`Generation failed: ${(err as Error).message}`);
      process.exit(1);
    }
  });

program.parse(process.argv);
