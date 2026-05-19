#!/usr/bin/env ts-node
import * as fs from 'node:fs';
import * as path from 'node:path';

import chalk from 'chalk';
import { Command } from 'commander';
import ora from 'ora';

import { CurlToApiAgent } from '../src/ai/codegen/CurlToApiAgent';
import { HtmlToFragmentAgent } from '../src/ai/codegen/HtmlToFragmentAgent';
import { ScenarioGeneratorAgent } from '../src/ai/codegen/ScenarioGeneratorAgent';
import { SwaggerToApiAgent } from '../src/ai/codegen/SwaggerToApiAgent';
import { SwaggerParser } from '../src/api/swagger/SwaggerParser';
import { config } from '../src/core/config/ConfigLoader';

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
  .option('--page-name <name>', 'Fragment/Page class name (PascalCase)', 'GeneratedFragment')
  .option('--output-dir <dir>', 'Root output directory', path.join(process.cwd(), 'src', 'ui'))
  .option('--preview', 'Preview output without writing files')
  .option('--skip-cache', 'Skip idempotency cache (re-call LLM)')
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
      const fragmentName = opts['pageName'] as string;
      const result = await agent.run(
        {
          html,
          fragmentName,
          outputDir: opts['outputDir'] as string,
        },
        {
          dryRun: !!opts['preview'],
          skipCache: !!opts['skipCache'],
          maxRetries: Number(opts['maxRetries'] ?? 2),
        },
      );
      spinner.succeed(`Generated ${result.fragments.length} fragment(s)`);

      if (opts['preview']) {
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
  .option(
    '--service-name <name>',
    'Service class name (PascalCase, without "Service" suffix)',
    'Generated',
  )
  .option('--output-dir <dir>', 'Root output directory', path.join(process.cwd(), 'src', 'api'))
  .option('--preview', 'Preview output without writing files')
  .option('--skip-cache', 'Skip idempotency cache')
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
          serviceName: opts['serviceName'] as string,
          outputDir: opts['outputDir'] as string,
        },
        {
          dryRun: !!opts['preview'],
          skipCache: !!opts['skipCache'],
          maxRetries: Number(opts['maxRetries'] ?? 2),
        },
      );
      spinner.succeed('Generated');
      if (opts['preview']) {
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
  .option('--feature-name <name>', 'Feature name (PascalCase)', 'GeneratedFeature')
  .option(
    '--output-dir <dir>',
    'Output directory for .feature and .steps.ts',
    path.join(process.cwd(), 'tests', 'bdd'),
  )
  .option('--preview', 'Preview output without writing files')
  .option('--skip-cache', 'Skip idempotency cache')
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
          featureName: opts['featureName'] as string,
          outputDir: opts['outputDir'] as string,
        },
        {
          dryRun: !!opts['preview'],
          skipCache: !!opts['skipCache'],
          maxRetries: Number(opts['maxRetries'] ?? 2),
        },
      );
      spinner.succeed('Generated');
      if (opts['preview']) {
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

// ─── gen swagger ─────────────────────────────────────────────────────────────
program
  .command('swagger')
  .description('Generate Service + API Tests for ALL endpoints from a Swagger/OpenAPI spec')
  .option('--input <path|url>', 'Path to swagger.json file or https:// URL of the spec')
  .option(
    '--output <dir>',
    'Root output dir for Service files',
    path.join(process.cwd(), 'src', 'api'),
  )
  .option(
    '--test-output <dir>',
    'Output dir for test files',
    path.join(process.cwd(), 'tests', 'api', 'smoke'),
  )
  .option('--group <name>', 'Generate only the named group (PascalCase tag name)')
  .option('--preview', 'Preview output without writing files')
  .option('--skip-cache', 'Skip idempotency cache (re-call LLM)')
  .option('--max-retries <n>', 'Max LLM retries on validation failure', '2')
  // ── New flags (PR-8) ─────────────────────────────────────────────────────
  .option('--exclude <patterns>', 'Comma-separated operationId glob patterns to skip')
  .option(
    '--required-headers <names>',
    'Comma-separated header names that must appear in every request',
  )
  .option(
    '--auth-negative-cases <mode>',
    'Which auth-negative plans to emit: missing | invalid | both',
    'both',
  )
  .option('--seed <n>', 'Fixed integer seed for DataFactory (default: hash of input)')
  .option('--include-optional', 'Include optional fields in generated payloads')
  .option('--no-llm', 'Skip ScenarioEnricher LLM call; use deterministic auto-titles')
  .option(
    '--flexible-status',
    'negative-validation scenarios accept any 4xx status instead of the exact code from spec',
  )
  .option('--dry-data', 'Print generated payloads to stdout and exit without writing files')
  .action(async (opts: Record<string, string | boolean>) => {
    const input = opts['input'] as string | undefined;
    if (!input) {
      console.error(chalk.red('Provide --input <path|url>'));
      process.exit(1);
    }

    // ── Step 1: Parse swagger spec ──────────────────────────────────────────
    const parseSpinner = ora(`Parsing Swagger spec: ${input}…`).start();
    let parsed;
    try {
      parsed = await SwaggerParser.parse(input);
      parseSpinner.succeed(
        `Parsed "${parsed.title}" v${parsed.version} — ${parsed.groups.length} tag group(s) found`,
      );
    } catch (err) {
      parseSpinner.fail(`Swagger parse failed: ${(err as Error).message}`);
      process.exit(1);
    }

    // ── Step 2: Filter to specific group if requested ───────────────────────
    let groups = parsed.groups;
    const groupFilter = opts['group'] as string | undefined;
    if (groupFilter) {
      groups = groups.filter((g) => g.groupName === groupFilter);
      if (groups.length === 0) {
        const available = parsed.groups.map((g) => g.groupName).join(', ');
        console.error(chalk.red(`Group "${groupFilter}" not found. Available: ${available}`));
        process.exit(1);
      }
    }

    console.log(
      chalk.dim(
        `Groups to generate: ${groups.map((g) => `${g.groupName} (${g.endpoints.length} endpoints)`).join(', ')}`,
      ),
    );

    // ── Step 3: Build agent opts from CLI flags ─────────────────────────────
    const excludeStr = opts['exclude'] as string | undefined;
    const requiredHeadersStr = opts['requiredHeaders'] as string | undefined;
    const authNegativeCases = opts['authNegativeCases'] as 'missing' | 'invalid' | 'both';
    const seedRaw = opts['seed'] as string | undefined;

    const agentOpts = {
      exclude: excludeStr ? excludeStr.split(',').map((s) => s.trim()) : undefined,
      requiredHeaders: requiredHeadersStr
        ? requiredHeadersStr.split(',').map((s) => s.trim())
        : undefined,
      authNegativeCases,
      seed: seedRaw !== undefined ? Number(seedRaw) : undefined,
      includeOptional: !!opts['includeOptional'],
      noLlm: opts['llm'] === false,
      flexibleStatus: !!opts['flexibleStatus'],
    };

    const dryData = !!opts['dryData'];
    const dryRun = !!opts['preview'] || dryData;
    const skipCache = !!opts['skipCache'];
    const maxRetries = Number(opts['maxRetries'] ?? 2);
    const outputDir = opts['output'] as string;
    const testOutputDir = opts['testOutput'] as string;
    const generatedParsed = { ...parsed, groups };

    // ── Step 4: Generate per group ──────────────────────────────────────────
    const agent = new SwaggerToApiAgent({ apiHeaderNames: config.apiHeaderNames }, agentOpts);
    let groupSpinner: ReturnType<typeof ora> | null = null;

    const results = await agent
      .runAll(generatedParsed, {
        outputDir,
        testOutputDir,
        dryRun,
        skipCache,
        maxRetries,
        onGroupStart: (groupName, index, total) => {
          groupSpinner = ora(`[${index + 1}/${total}] Generating ${groupName}…`).start();
        },
        onGroupDone: (groupName) => {
          groupSpinner?.succeed(`[done] ${groupName}`);
          groupSpinner = null;
        },
      })
      .catch((err) => {
        groupSpinner?.fail(`Generation failed: ${(err as Error).message}`);
        process.exit(1);
      });

    // ── Step 5: Output results ──────────────────────────────────────────────
    if (!results) return;

    if (dryData) {
      for (const [groupName, output] of results) {
        console.log('\n' + chalk.cyan(`══ ${groupName} — serviceTs ══`));
        console.log(output.serviceTs);
        console.log('\n' + chalk.cyan(`══ ${groupName} — testTs ══`));
        console.log(output.testTs);
      }
    } else if (dryRun) {
      for (const [groupName, output] of results) {
        console.log('\n' + chalk.cyan(`══ ${groupName}Service.ts ══`));
        console.log(output.serviceTs);
        console.log('\n' + chalk.cyan(`══ ${groupName.toLowerCase()}.test.ts ══`));
        console.log(output.testTs);
      }
    } else {
      console.log('\n' + chalk.green(`✔ Generated ${results.size} group(s):`));
      for (const [groupName] of results) {
        const svcFile = path.join(outputDir, 'services', `${groupName}Service.ts`);
        const testFile = path.join(testOutputDir, `${SwaggerParser.toSlug(groupName)}.test.ts`);
        console.log(`  ${chalk.dim('service')}  ${svcFile}`);
        console.log(`  ${chalk.dim('test   ')}  ${testFile}`);
      }
      console.log(chalk.dim('\nRun `npm run typecheck` to verify.'));
    }
  });

// ─── gen curl ────────────────────────────────────────────────────────────────
program
  .command('curl')
  .description('Generate Service + API Test from a single cURL command')
  .option('--input <path>', 'Read cURL command from file (preferred on Windows PowerShell)')
  .option('--curl <curl>', 'Inline cURL command string')
  .option(
    '--service-name <name>',
    'Service class name (PascalCase, without "Service" suffix)',
    'Generated',
  )
  .option(
    '--output-dir <dir>',
    'Root output directory for Service files',
    path.join(process.cwd(), 'src', 'api'),
  )
  .option('--preview', 'Preview output without writing files')
  .option('--skip-cache', 'Skip idempotency cache')
  // ── New flags (PR-8) ─────────────────────────────────────────────────────
  .option('--exclude <patterns>', 'Comma-separated operationId patterns to skip')
  .option('--required-headers <names>', 'Comma-separated required header names')
  .option(
    '--auth-negative-cases <mode>',
    'Which auth-negative plans to emit: missing | invalid | both',
    'both',
  )
  .option('--seed <n>', 'Fixed integer seed for DataFactory')
  .option('--include-optional', 'Include optional fields in generated payloads')
  .option('--no-llm', 'Skip ScenarioEnricher LLM call; use deterministic auto-titles')
  .option('--dry-data', 'Print generated payloads to stdout and exit without writing files')
  .option('--with-response <path>', 'JSON file containing an example response body')
  .option('--expected-status <code>', 'Expected HTTP status code for --with-response mode', '200')
  .option(
    '--path-template <pattern>',
    'Override URL path tokenization, e.g. /users/{userId}/orders/{orderId}',
  )
  .action(async (opts: Record<string, string | boolean>) => {
    let curl = '';
    const inputFile = opts['input'] as string | undefined;
    if (inputFile) {
      if (!fs.existsSync(inputFile)) {
        console.error(chalk.red(`File not found: ${inputFile}`));
        process.exit(1);
      }
      curl = fs.readFileSync(inputFile, 'utf8').trim();
    } else if (opts['curl']) {
      curl = opts['curl'] as string;
    } else {
      console.error(chalk.red('Provide --input <path> or --curl <command>'));
      process.exit(1);
    }

    // ── Build agent opts ────────────────────────────────────────────────────
    const excludeStr = opts['exclude'] as string | undefined;
    const requiredHeadersStr = opts['requiredHeaders'] as string | undefined;
    const seedRaw = opts['seed'] as string | undefined;

    let withResponse: unknown;
    const withResponsePath = opts['withResponse'] as string | undefined;
    if (withResponsePath) {
      if (!fs.existsSync(withResponsePath)) {
        console.error(chalk.red(`--with-response file not found: ${withResponsePath}`));
        process.exit(1);
      }
      try {
        withResponse = JSON.parse(fs.readFileSync(withResponsePath, 'utf8'));
      } catch {
        console.error(chalk.red(`--with-response file is not valid JSON: ${withResponsePath}`));
        process.exit(1);
      }
    }

    const agentOpts = {
      exclude: excludeStr ? excludeStr.split(',').map((s) => s.trim()) : undefined,
      requiredHeaders: requiredHeadersStr
        ? requiredHeadersStr.split(',').map((s) => s.trim())
        : undefined,
      authNegativeCases: opts['authNegativeCases'] as 'missing' | 'invalid' | 'both',
      seed: seedRaw !== undefined ? Number(seedRaw) : undefined,
      includeOptional: !!opts['includeOptional'],
      noLlm: opts['llm'] === false,
      withResponse,
      expectedStatus: Number(opts['expectedStatus'] ?? 200),
      pathTemplate: opts['pathTemplate'] as string | undefined,
    };

    const dryData = !!opts['dryData'];
    const dryRun = !!opts['preview'] || dryData;
    const outputDir = opts['outputDir'] as string;

    const spinner = ora('Generating Service + API Test from cURL…').start();
    try {
      const agent = new CurlToApiAgent({}, agentOpts);
      const result = await agent.run(
        { curl, serviceName: opts['serviceName'] as string, outputDir },
        { dryRun, skipCache: !!opts['skipCache'] },
      );
      spinner.succeed('Generated');
      if (dryData || dryRun) {
        console.log('\n' + chalk.cyan('── serviceTs ──'));
        console.log(result.serviceTs);
        console.log('\n' + chalk.cyan('── testTs ──'));
        console.log(result.testTs);
      } else {
        console.log(chalk.green('Files written.'));
        console.log(chalk.dim('Run `npm run typecheck` to verify.'));
      }
    } catch (err) {
      spinner.fail(`Generation failed: ${(err as Error).message}`);
      process.exit(1);
    }
  });

program.parse(process.argv);
