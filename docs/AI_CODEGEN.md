# AI Code Generation

Three agents that convert real-world inputs into working TypeScript test code. Each agent uses the shared `GenerationPipeline` (LLM → validate → retry-with-errors → cache) so they all benefit from idempotency, circuit-breaking, and budget control automatically.

---

## Agent comparison

| Agent | Input | Output | Cost (est.) | When to use |
|---|---|---|---|---|
| `HtmlToFragmentAgent` | HTML / URL | Fragment + Page + Test (3 files) | ~$0.03–0.08 | New page/component — auto-generate the skeleton |
| `CurlToApiAgent` | cURL command | Zod Schema + Service + Test (3 files) | ~$0.02–0.05 | New API endpoint — convert Postman/curl to typed service with schema validation |
| `ScenarioGeneratorAgent` | User story text | Gherkin feature + step defs (2 files) | ~$0.02–0.04 | BA story → draft test scenarios with edge cases |
| `OpenApiSuiteAgent` | OpenAPI/Swagger spec | N×(Service + Test) per tag | ~$0.05/run (cached) | Bulk gen entire API test suite from Swagger spec |

---

## Quick start

```bash
# Fragment + Page + Test from a local HTML file
npm run gen:page -- --html-file ./samples/login.html --name LoginForm

# Fragment + Page + Test from a URL (live fetch)
npm run gen:page -- --url https://your-app.local/login --name LoginForm

# Zod Schema + Service + Test from a cURL command (3 files)
npm run gen:api -- --curl "curl -X POST https://api.example.com/users -H 'Content-Type: application/json' -d '{\"name\":\"Alice\"}'" --name User

# Zod Schema + Service + Test from a cURL file
npm run gen:api -- --curl-file ./samples/users.curl --name User

# Gherkin feature + step definitions from a user story
npm run gen:scenario -- --story "As a user I want to log in with email and password" --name Login

# Generate Zod schemas from OpenAPI/Swagger spec
npm run schemas:gen -- --spec ./openapi.json

# Bulk generate service classes + test suite from OpenAPI spec
npm run gen:suite -- --spec ./openapi.json [--tags users,orders] [--exclude-deprecated]

# Preview any command without writing files
npm run gen:page -- --url https://your-app.local/login --name Login --dry-run
```

---

## CLI reference

### `npm run gen:page`

```
Options:
  --url <url>          Fetch HTML from a live URL
  --html-file <path>   Read HTML from a local file (faster, no network)
  --name <name>        PascalCase class name (default: "GeneratedFragment")
  --output-dir <dir>   Root output dir (default: src/ui)
  --dry-run            Preview output in console, no files written
  --no-cache           Bypass idempotency cache (force LLM re-call)
  --max-retries <n>    TypeScript retry limit (default: 2)
```

Writes to:
- `{outputDir}/fragments/features/{Name}Fragment.ts`
- `{outputDir}/pages/{Name}Page.ts`
- `tests/ui/smoke/{name}.test.ts`

### `npm run gen:api`

```
Options:
  --curl <curl>        cURL command string
  --curl-file <path>   Read cURL from file
  --name <name>        Service class name without "Service" suffix (default: "Generated")
  --output-dir <dir>   Root output dir (default: src/api)
  --dry-run            Preview, no files
  --no-cache           Bypass cache
  --max-retries <n>    Retry limit (default: 2)
```

Writes to:
- `{outputDir}/schemas/{Name}Schema.ts` — Zod schema cho request/response
- `{outputDir}/services/{Name}Service.ts` — typed service class
- `tests/api/smoke/{name}.test.ts` — test với schema validation + SLA + error cases

---

### `npm run schemas:gen`

```
Options:
  --spec <path|url>    Path hoặc URL đến OpenAPI/Swagger spec (required)
  --out <dir>          Output dir (default: src/api/schemas)
  --force              Re-generate ngay cả khi spec không thay đổi
```

Writes to:
- `{out}/_generated.ts` — tất cả Zod schemas từ spec
- `{out}/index.ts` — barrel re-export (cập nhật)
- `{out}/.openapi-hash` — hash để idempotency check

---

### `npm run gen:suite`

```
Options:
  --spec <path|url>          Path hoặc URL đến OpenAPI/Swagger spec (required)
  --tags <tags>              Comma-separated list of tags (e.g. "users,pets")
  --include-paths <globs>    Comma-separated path glob patterns (e.g. "/api/v2/*")
  --exclude-deprecated       Skip deprecated operations
  --out-services <dir>       Output dir cho service files (default: src/api/services/_generated)
  --out-tests <dir>          Output dir cho test files (default: tests/api/_generated)
  --dry-run                  Preview, no files
  --no-cache                 Bypass LLM idempotency cache
```

Writes to (per tag):
- `{outServices}/{Tag}Service.ts` — deterministic service class (no LLM)
- `{outTests}/{tag}.test.ts` — LLM-generated test scenarios

### `npm run gen:scenario`

```
Options:
  --story <story>      User story text
  --story-file <path>  Read story from file
  --name <name>        PascalCase feature name (default: "GeneratedFeature")
  --output-dir <dir>   Output dir for .feature and .steps.ts (default: tests/bdd)
  --dry-run            Preview, no files
  --no-cache           Bypass cache
  --max-retries <n>    Retry limit (default: 2)
```

Writes to:
- `{outputDir}/{kebab-name}.feature`
- `{outputDir}/{kebab-name}.steps.ts`

---

## Workflow: gen → review → commit

1. **Generate** — run `npm run gen:page --dry-run` first to preview
2. **Review** — open the generated files; the LLM output is a draft:
   - Check locators match real elements (LocatorScorer pre-scores them but you own the final choice)
   - Check test scenarios cover your acceptance criteria
   - Adjust class/method names to match team conventions
3. **Typecheck** — `npm run typecheck` must pass before committing
4. **Commit** — treat generated code like any PR; include a "generated by AI" note in the commit message

> **Caveat**: Generated code is a *draft*. Always review before committing. The `ScenarioGeneratorAgent` intentionally invents negative/boundary cases — some may not apply to your feature.

---

## Adding a new prompt template

1. Create `config/ai/prompts/{your-template}.prompt.md` with YAML front-matter:
   ```markdown
   ---
   task: your-template
   model: anthropic:sonnet
   examples:
     - input: { key: "value" }
       output: { "outputField": "example content" }
   ---
   Your system prompt here.
   
   ## USER
   Input: {{{key}}}
   ```
2. Create a Zod schema for the output shape
3. Create `src/ai/codegen/{YourAgent}.ts` using `GenerationPipeline` with your template name + schema
4. Add CLI sub-command in `scripts/gen.ts`

The pipeline handles caching, retries, circuit-breaking, and budget automatically.

---

## Telemetry

```bash
# Show per-agent cost and call count
npm run codegen:report
```

Sample output:
```
=== AI Codegen Report ===

Total entries : 5
Total cost    : $0.1234

Per-agent breakdown:
──────────────────────────────────────────────────────────────────────
Agent                     Calls   Cost USD  Avg In Tokens Avg Out Tokens
──────────────────────────────────────────────────────────────────────
curl-to-api                   2     $0.042           1823           1204
html-to-fragment              2     $0.068           3102           2811
scenario-gen                  1     $0.013           1412            987
──────────────────────────────────────────────────────────────────────
```

High retry rate (more LLM calls than files generated) means the prompt template needs improvement.

---

## Troubleshooting

### Typecheck fails after `gen:page`

The LLM occasionally imports non-existent helper methods. Run `npm run typecheck`, check the error, and either:
- Fix the import path in the generated file
- Add `--max-retries 2` (already the default) — the pipeline will re-ask the LLM with the tsc error

### LLM rate-limited

The `TaskAwareRouter` falls back through the provider chain automatically (Sonnet → Haiku → Cohere). If all providers are exhausted, wait for the cooldown (shown in `output/.rate-limits.json`) or set a different `ANTHROPIC_API_KEY`.

### Cache is stale

The idempotency cache (`output/codegen-cache.db`) has a 7-day TTL. To force a fresh LLM call:
```bash
npm run gen:page -- --html-file ./login.html --name Login --no-cache
```

### Generated selectors don't match

`LocatorScorer` pre-ranks selectors deterministically but the LLM picks the final one. If a selector is wrong:
1. Open the generated Fragment file
2. Replace the selector with one from `src/ai/codegen/LocatorScorer.ts` scoring output
3. Run `npm run typecheck` to verify
