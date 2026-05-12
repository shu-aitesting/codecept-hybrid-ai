# AI Code Generation

Three agents that convert real-world inputs into working TypeScript test code. Each agent uses the shared `GenerationPipeline` (LLM → validate → retry-with-errors → cache) so they all benefit from idempotency, circuit-breaking, and budget control automatically.

---

## Agent comparison

| Agent | Input | Output | Cost (est.) | When to use |
|---|---|---|---|---|
| `HtmlToFragmentAgent` | HTML / URL | Fragments + Page + Steps + Test (4 files) | $0 (Cohere) / ~$0.03–0.08 (Anthropic Sonnet fallback) | New page/component — auto-generate the skeleton |
| `CurlToApiAgent` | cURL command | Service class + API test (2 files) | $0 (Cohere) / ~$0.02–0.05 (Anthropic fallback) | New API endpoint — convert Postman/curl to typed service |
| `ScenarioGeneratorAgent` | User story text | CodeceptJS test + Step Object (2 files) | $0 (Cohere) / ~$0.02–0.04 (Anthropic fallback) | BA story → draft test scenarios + step object with edge cases |
| `SwaggerToApiAgent` | OpenAPI/Swagger spec | Service per tag group + tests | $0 (Cohere) / ~$0.05–0.20 (Anthropic — depends on spec size) | Bulk-generate service objects from existing API contract |

> **Cost note**: Profile `codegen` route Cohere primary (free 1000 calls/month). Cost chỉ phát sinh khi fallback sang Anthropic Sonnet 4.6 (`$3/1M input`, `$15/1M output`, hoặc `$0.30/1M` cho cached input). Theo dõi qua `npm run codegen:report`.

---

## Quick start

```bash
# Fragment + Page + Test from a local HTML file
npm run gen:page -- --html-file ./samples/login.html --page-name LoginForm

# Fragment + Page + Test from a URL (live fetch)
npm run gen:page -- --url https://your-app.local/login --page-name LoginForm

# Service + API Test from a cURL file (recommended on Windows)
npm run gen:api -- --curl-file ./samples/users.curl --service-name User

# Service + API Test from an inline cURL (macOS/bash only — see note below)
npm run gen:api -- --curl 'curl -X POST https://api.example.com/users -H "Content-Type: application/json"' --service-name User

# Gherkin feature + step definitions from a user story
npm run gen:scenario -- --story "As a user I want to log in with email and password" --feature-name Login

# Preview any command without writing files
npm run gen:page -- --url https://your-app.local/login --page-name Login --preview
```

> **Windows PowerShell note:** Use `--curl-file` instead of inline `--curl`.  
> Lý do: PowerShell mangle quotes khi truyền qua `npm run`, khiến curl string bị split.  
> Lưu cURL vào file `.curl` → truyền `--curl-file path/to/file.curl`.

---

## CLI reference

### `npm run gen:page`

```
Options:
  --url <url>           Fetch HTML from a live URL
  --html-file <path>    Read HTML from a local file (faster, no network)
  --page-name <name>    PascalCase class name (default: "GeneratedFragment")
  --output-dir <dir>    Root output dir (default: src/ui)
  --preview             Preview output in console, no files written
  --skip-cache          Bypass idempotency cache (force LLM re-call)
  --max-retries <n>     TypeScript retry limit (default: 2)
```

Writes to:
- `{outputDir}/fragments/features/{Name}Fragment.ts`
- `{outputDir}/pages/{Name}Page.ts`
- `tests/ui/smoke/{name}.test.ts`

### `npm run gen:api`

```
Options:
  --curl <curl>          cURL command string (macOS/bash) hoặc dùng --curl-file
  --curl-file <path>     Read cURL from file (recommended — works on all platforms)
  --service-name <name>  Service class name without "Service" suffix (default: "Generated")
  --output-dir <dir>     Root output dir (default: src/api)
  --preview              Preview, no files
  --skip-cache           Bypass cache
  --max-retries <n>      Retry limit (default: 2)
```

Writes to:
- `{outputDir}/services/{Name}Service.ts` — URL dùng `config.apiUrl` + relative endpoint constant, không hardcode absolute URL
- `tests/api/smoke/{name}.test.ts`

### `npm run gen:scenario`

```
Options:
  --story <story>        User story text
  --story-file <path>    Read story from file
  --feature-name <name>  PascalCase feature name (default: "GeneratedFeature")
  --output-dir <dir>     Output dir cho test file (default: tests/ui/regression)
  --preview              Preview, no files
  --skip-cache           Bypass cache
  --max-retries <n>      Retry limit (default: 2)
```

Writes to:
- `{outputDir}/{kebab-name}.test.ts` — CodeceptJS format (`Feature(...)`, `Scenario(...)`, `.tag('@smoke')`)
- `src/ui/steps/{Name}Steps.ts` — Step Object skeleton (không phải Cucumber step defs)

### `npm run gen:swagger`

```
Options:
  --input <path|url>     Path to swagger.json file hoặc https:// URL của spec
  --output <dir>         Root output dir cho Service files (default: src/api)
  --test-output <dir>    Output dir cho test files (default: tests/api/smoke)
  --group <name>         Chỉ generate group theo PascalCase tag name
  --preview              Preview, no files
  --skip-cache           Bypass cache
  --max-retries <n>      Retry limit (default: 2)
```

Writes to:
- `{output}/services/{GroupName}Service.ts` — một file per Swagger tag group
- `{testOutput}/{tag-slug}.test.ts`

---

## Header handling — 4 tiers

`CurlToApiAgent` and `SwaggerToApiAgent` both run a deterministic **header classifier** ([src/ai/codegen/headerClassifier.ts](../src/ai/codegen/headerClassifier.ts)) over every parsed input. The classifier sorts each header into exactly one of four tiers, and the prompt template tells the LLM what to emit per tier.

| Tier | Examples | Generated code |
|------|----------|----------------|
| **1. Skipped** | `sec-ch-ua*`, `sec-fetch-*`, `user-agent`, `priority`, `cookie`, `host`, `referer`, `origin`, `content-length`, `accept-encoding` | Dropped entirely |
| **2. Ambient** | `Authorization` / `token` / `x-auth-token`, `Accept-Language` / `ln` / `lang`, `X-Timezone` / `tz` / `timezone`, plus header-typed `securitySchemes` (Bearer / apiKey-in-header) | **Not emitted in services.** Injected once by `RestClient.init()` via Playwright `extraHTTPHeaders` from `config.apiToken` / `config.apiLanguage` / `config.apiTimezone` |
| **3. Required params** (Swagger `required: true`, non-ambient) | `X-Request-ID: required`, `X-Tenant-Id: required` | Mandatory typed method argument + `.header(name, paramName)` |
| **4. Optional params** | `Accept`, `X-Trace`, custom non-required cURL/Swagger headers | Trailing `opts?: { paramName?: type }` arg + `.header(name, opts?.paramName ?? '<default>')` |

### Configure ambient headers

Set in `.env.{ENV}` (all optional):

```env
API_TOKEN=eyJhbGciOi...
API_LANGUAGE=en-US
API_TIMEZONE=Asia/Ho_Chi_Minh
```

`RestClient.init()` reads these via [`buildAmbientHeaders(config)`](../src/api/rest/ambientHeaders.ts) and passes them to Playwright's `apiRequest.newContext({ extraHTTPHeaders })`. Empty/unset values are skipped — unauthenticated APIs work with no `API_TOKEN`.

### Override per test

```ts
await client.init({
  baseURL: 'https://api.example.com',
  extraHTTPHeaders: { Authorization: 'Bearer test-only-token' },
});
```

Per-key override beats ambient — the rest of the ambient map still applies.

### Override per request

`RestRequestBuilder.header()` ghi đè extraHTTPHeaders ở Playwright level — useful for negative-scenario tests that need an invalid token on a single call without re-initializing the client.

### Why not hardcode auth in services?

- **Security**: tokens never live in the codebase
- **Multi-env**: same service code chạy được cả dev/staging/prod chỉ bằng cách swap `.env`
- **Multi-locale tests**: switch `API_LANGUAGE=vi` mà không cần sửa service
- **Audit**: 1 chỗ thấy được mọi ambient header (RestClient init log)

---

## Workflow: gen → validate → review → commit

1. **Generate** — run với `--dry-run` trước để preview
2. **Validate** — chạy qua [config/ai/AGENT_VALIDATION_CHECKLIST.md](../config/ai/AGENT_VALIDATION_CHECKLIST.md):
   - Fragment dùng `readonly selectors = { ... } as const`?
   - Step Object gọi fragment METHODS, không truy cập `.selectors` trực tiếp?
   - Service dùng `config.apiUrl` + relative endpoint (không hardcode URL)?
   - Tags chained sau callback: `.tag('@smoke')`, không trong title string?
3. **Review** — mở generated files; LLM output là draft:
   - Check locators match DOM thật (LocatorScorer pre-scores nhưng bạn quyết định cuối)
   - Check test scenarios cover acceptance criteria
   - Sửa class/method names theo team convention
4. **Typecheck** — `npm run typecheck` phải pass trước khi commit
5. **Commit** — treat generated code như PR thường; ghi "generated by AI" trong commit message

> **Caveat**: Generated code is a *draft*. Always review before committing. The `ScenarioGeneratorAgent` intentionally invents negative/boundary cases — some may not apply to your feature.

---

## Adding a new prompt template

1. Create `config/ai/prompts/{your-template}.prompt.md` with YAML front-matter:
   ```markdown
   ---
   task: your-template
   examples:
     - input: { key: "value" }
       output: { "outputField": "example content" }
   ---
   Your system prompt here.
   
   ## USER
   Input: {{{key}}}
   ```
   Note: model selection is driven by `providers.profiles.ts` (task → primary/fallback chain), not the prompt front-matter.
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

The `TaskAwareRouter` falls back through the provider chain automatically (Cohere → Anthropic Sonnet → Anthropic Haiku for `codegen`). If Cohere quota exceeded (1000/month) the router skips it and uses Anthropic — costs will appear in `output/llm-cost.jsonl`. If all providers are exhausted, wait for the cooldown (shown in `output/.rate-limits.json`) or rotate keys.

### Cache is stale

The idempotency cache (`output/codegen-cache.db`) has a 7-day TTL. To force a fresh LLM call:
```bash
npm run gen:page -- --html-file ./login.html --page-name Login --skip-cache
```

### Generated selectors don't match

`LocatorScorer` pre-ranks selectors deterministically but the LLM picks the final one. If a selector is wrong:
1. Open the generated Fragment file
2. Replace the selector with one from `src/ai/codegen/LocatorScorer.ts` scoring output
3. Run `npm run typecheck` to verify
