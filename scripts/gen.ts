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
        spinner.succeed('Fetched');
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
      const result = await agent.run(
        {
          html,
          fragmentName: opts['name'] as string,
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
        console.log('\n' + chalk.cyan('── fragmentTs ──'));
        console.log(result.fragmentTs);
        console.log('\n' + chalk.cyan('── pageTs ──'));
        console.log(result.pageTs);
        console.log('\n' + chalk.cyan('── testTs ──'));
        console.log(result.testTs);
      } else {
        console.log(chalk.green('Files written. Run `npm run typecheck` to verify.'));
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
