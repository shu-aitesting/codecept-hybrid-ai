import * as child_process from 'node:child_process';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ApiFiles {
  serviceTs: string;
  testTs: string;
}

// ─── Service checklist rules ──────────────────────────────────────────────────

/**
 * Validates a generated Service file against the API Service Checklist.
 * Returns an array of human-readable error strings; empty = pass.
 */
export function checkServiceRules(serviceTs: string): string[] {
  const errors: string[] = [];

  // Relative endpoint constant: const X_ENDPOINT = '/...'
  if (!/const\s+\w+_ENDPOINT\s*=\s*['"`]\//.test(serviceTs)) {
    errors.push(
      "Service must define a relative endpoint constant (e.g. const X_ENDPOINT = '/api/path'). " +
        'NEVER hardcode an absolute URL as a constant.',
    );
  }

  // URL composed with config.apiUrl
  if (!serviceTs.includes('config.apiUrl')) {
    errors.push(
      'Service must compose URLs with config.apiUrl (e.g. `${config.apiUrl}${X_ENDPOINT}`). ' +
        'Import config from @core/config/ConfigLoader.',
    );
  }

  // .json() for bodies, not .body()
  if (/\.body\s*\(/.test(serviceTs)) {
    errors.push('Service must use .json() for JSON request bodies — NOT .body().');
  }

  // No browser-fingerprinting headers — allow arbitrary chars between prefix and closing quote
  if (/['"](?:sec-ch-ua|sec-fetch-|user-agent|priority)[^'"]*['"]/i.test(serviceTs)) {
    errors.push(
      'Service must NOT include browser-fingerprinting headers ' +
        '(sec-ch-ua*, sec-fetch-*, user-agent, priority).',
    );
  }

  // RestRequestBuilder shorthand, not old .url().method() pattern
  if (/\.url\s*\(/.test(serviceTs) && /RestMethod\./.test(serviceTs)) {
    errors.push(
      'Service must use RestRequestBuilder shorthands (.get(), .post(), …) ' +
        'instead of .url().method(RestMethod.*).',
    );
  }

  // Ban explicit emit of ambient headers — RestClient.init() injects them automatically.
  if (
    /\.header\s*\(\s*['"`](?:Token|Lng|Tz|Authorization|Accept-Language|X-Timezone)['"`]/i.test(
      serviceTs,
    )
  ) {
    errors.push(
      'Service must NOT emit ambient headers (Token, Lng, Tz, Authorization, Accept-Language, ' +
        'X-Timezone) via .header() — RestClient.init() injects them automatically from config.',
    );
  }

  // Ban Content-Type header — .json() sets it automatically for JSON bodies.
  if (/\.header\s*\(\s*['"`]Content-Type['"`]/i.test(serviceTs)) {
    errors.push(
      'Service must NOT emit Content-Type header via .header() — ' +
        'RestRequestBuilder.json() sets it automatically for JSON bodies.',
    );
  }

  return errors;
}

// ─── Test checklist rules ─────────────────────────────────────────────────────

function checkExpectSchemaRules(
  testTs: string,
  serviceTs: string | undefined,
  errors: string[],
): void {
  if (/\.expectSchema\s*\(\s*\{/.test(testTs)) {
    errors.push(
      'expectSchema() must receive an identifier (e.g. USER_RESPONSE_SCHEMA) — ' +
        'not an inline object literal. Export the schema const from the service file.',
    );
  }
  if (!serviceTs) return;
  for (const m of testTs.matchAll(/\.expectSchema\s*\(\s*(\w+)\s*\)/g)) {
    const identifier = m[1] ?? '';
    if (identifier && !serviceTs.includes(identifier)) {
      errors.push(
        `expectSchema() references '${identifier}' which is not exported by the service file. ` +
          'Add a matching *_RESPONSE_SCHEMA const to the service.',
      );
    }
  }
}

function checkNegativeAuthRules(testTs: string, errors: string[]): void {
  const blocks = testTs.match(/Scenario\s*\([^)]*\)[\s\S]*?(?=Scenario\s*\(|$)/g);
  if (!blocks) return;
  for (const block of blocks) {
    if (
      /\.tag\s*\(\s*['"`]@negative-auth-/.test(block) &&
      !/init\s*\(\s*\{[\s\S]*?(?:skipAmbient|headerOverrides)/.test(block)
    ) {
      errors.push(
        '@negative-auth-* Scenario must call client.init() with skipAmbient or headerOverrides ' +
          'to alter the token header — bare client calls will not test missing/invalid auth.',
      );
      return;
    }
  }
}

/**
 * Validates a generated Test file against the API Test Checklist.
 * Returns an array of human-readable error strings; empty = pass.
 * Pass `serviceTs` to enable cross-file checks (e.g. expectSchema identifier resolution).
 */
export function checkTestRules(testTs: string, serviceTs?: string): string[] {
  const errors: string[] = [];

  if (/import.*RestRequestBuilder/.test(testTs)) {
    errors.push(
      'Test must NOT import RestRequestBuilder. ' +
        'All HTTP calls must go through the service instance (svc).',
    );
  }

  if (/expect\s*\(.*\)\.toBe\s*\(/.test(testTs) || /I\.assertEqual\s*\(/.test(testTs)) {
    errors.push(
      'Test assertions must use res.expectStatus(code) — NOT expect().toBe() or I.assertEqual().',
    );
  }

  if (!testTs.includes('Before(')) {
    errors.push(
      'Test must have a Before() hook that calls client.init() and instantiates the service.',
    );
  }
  if (!testTs.includes('After(')) {
    errors.push('Test must have an After() hook that calls client.dispose().');
  }

  if (!testTs.includes("tag('@api')") && !testTs.includes('tag("@api")')) {
    errors.push("Test Feature must be tagged with .tag('@api').");
  }

  // Tags must be chained via .tag(), not embedded in the Scenario title string.
  if (/Scenario\s*\(\s*['"][^'"]*@(?:smoke|health|negative|deprecated)/.test(testTs)) {
    errors.push(
      'Scenario tags (@smoke, @health, @negative, @deprecated) must be chained via ' +
        ".tag('@smoke') after the callback — not embedded in the scenario title string.",
    );
  }

  checkExpectSchemaRules(testTs, serviceTs, errors);
  checkNegativeAuthRules(testTs, errors);

  // Ban unresolved ${...} template literals in svc call arguments.
  if (/svc\.\w+\s*\([^)]*\$\{(?!dataCtx\.)/.test(testTs)) {
    errors.push(
      'Raw ${...} template expressions in service call arguments must go through ' +
        'dataCtx.resolve() or dataCtx.get() — unresolved templates leak placeholder strings.',
    );
  }

  return errors;
}

// ─── tsc validation ───────────────────────────────────────────────────────────

/**
 * Writes the generated files into the project's include paths under a unique
 * `__validate_<uid>__` filename, runs `tsc --noEmit` via a minimal temp
 * tsconfig that extends the project's config, then cleans up.
 *
 * Returns an array of TypeScript compiler error strings; empty = pass.
 * Returns [] when `tsconfig.json` is not found at projectRoot (non-TS project).
 */
export async function runTscValidate(
  files: ApiFiles,
  projectRoot = process.cwd(),
): Promise<string[]> {
  const tsconfigPath = path.join(projectRoot, 'tsconfig.json');
  if (!fs.existsSync(tsconfigPath)) return [];

  const uid = crypto.randomBytes(4).toString('hex');
  const serviceFile = path.join(projectRoot, 'src', 'api', 'services', `__validate_${uid}__.ts`);
  const testFile = path.join(projectRoot, 'tests', 'api', 'smoke', `__validate_${uid}__.test.ts`);
  const tmpTsconfig = path.join(projectRoot, `__validate_${uid}__.tsconfig.json`);

  try {
    fs.mkdirSync(path.dirname(serviceFile), { recursive: true });
    fs.mkdirSync(path.dirname(testFile), { recursive: true });
    fs.writeFileSync(serviceFile, files.serviceTs, 'utf8');

    // The test file imports the service via its canonical alias path
    // (e.g. @api/services/SamsoniteService), but the service lives in a
    // temp file named __validate_<uid>__.ts. Rewrite those imports to a
    // relative path so tsc can resolve them without the real file on disk.
    const relToService = path
      .relative(path.dirname(testFile), path.dirname(serviceFile))
      .replaceAll('\\', '/');
    const testForValidation = files.testTs.replaceAll(
      /from\s+['"]@api\/services\/\w+['"]/g,
      `from '${relToService}/__validate_${uid}__'`,
    );
    fs.writeFileSync(testFile, testForValidation, 'utf8');

    // Extends the real tsconfig (inherits paths/compilerOptions) but only
    // includes our two temp files → fast, isolated, no noise from project errors.
    fs.writeFileSync(
      tmpTsconfig,
      JSON.stringify({
        extends: './tsconfig.json',
        include: [serviceFile.replace(/\\/g, '/'), testFile.replace(/\\/g, '/')],
      }),
      'utf8',
    );

    const tscBin = require.resolve('typescript/bin/tsc');
    const result = child_process.spawnSync(
      process.execPath, // node
      [tscBin, '--noEmit', '--project', tmpTsconfig],
      { encoding: 'utf8', cwd: projectRoot },
    );

    const raw = ((result.stdout ?? '') + (result.stderr ?? '')).trim();
    if (result.status === 0 || raw.length === 0) return [];

    // Strip the temp filenames so errors read naturally; cap at 20 lines.
    const uid_re = new RegExp(`__validate_${uid}__\\.(?:ts|test\\.ts)`, 'g');
    return raw
      .split('\n')
      .map((l) => l.replace(uid_re, '<generated>').trim())
      .filter(Boolean)
      .slice(0, 20);
  } finally {
    for (const f of [serviceFile, testFile, tmpTsconfig]) {
      try {
        fs.unlinkSync(f);
      } catch {
        // best-effort cleanup
      }
    }
  }
}

// ─── Combined factory ─────────────────────────────────────────────────────────

export interface PostValidateOpts {
  /**
   * Skip the `tsc --noEmit` subprocess. Defaults to false.
   * Can also be disabled project-wide via SKIP_TSC_VALIDATE=true env var.
   */
  skipTsc?: boolean;
  /** Override the project root used for tsc resolution. Defaults to cwd(). */
  projectRoot?: string;
}

/**
 * Creates a postValidate function for codegen agents that:
 *  1. Runs regex-based checklist rules (always, fast)
 *  2. Runs `tsc --noEmit` (unless skipTsc=true or SKIP_TSC_VALIDATE=true)
 *
 * Designed for injection into GenerationPipeline.postValidate.
 * Failures feed back into the LLM retry loop automatically.
 */
export function createApiPostValidate(
  opts: PostValidateOpts = {},
): (files: ApiFiles) => Promise<string[]> {
  return async (files: ApiFiles) => {
    // Phase 1: regex checklist — fast, no subprocess
    const regexErrors = [
      ...checkServiceRules(files.serviceTs),
      ...checkTestRules(files.testTs, files.serviceTs),
    ];
    if (regexErrors.length > 0) return regexErrors;

    // Phase 2: tsc — only if not suppressed
    const skipTsc = opts.skipTsc === true || process.env['SKIP_TSC_VALIDATE'] === 'true';
    if (!skipTsc) {
      return runTscValidate(files, opts.projectRoot ?? process.cwd());
    }

    return [];
  };
}
