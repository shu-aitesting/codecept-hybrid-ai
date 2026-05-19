# AI Codegen — Developer Guide

Four agents that convert real-world inputs into working TypeScript test code. Each agent uses the shared `GenerationPipeline` (LLM → validate → retry-with-errors → cache) so they all benefit from idempotency, circuit-breaking, and budget control automatically.

| Agent | Input | Output | When to use |
|---|---|---|---|
| `HtmlToFragmentAgent` | HTML / URL | Fragments + Page + Steps + Test (4 files) | New page/component — auto-generate the skeleton |
| `CurlToApiAgent` | cURL command | Service class + API test (2 files) | New API endpoint — convert Postman/curl to typed service |
| `ScenarioGeneratorAgent` | User story text | CodeceptJS test + Step Object (2 files) | BA story → draft test scenarios + step object |
| `SwaggerToApiAgent` | OpenAPI/Swagger spec | Service per tag group + tests | Bulk-generate service objects from existing API contract |

> **Cost note**: Profile `codegen` routes Cohere primary (free 1000 calls/month). Cost only occurs when falling back to Anthropic Sonnet 4.6. Track via `npm run codegen:report`.

---

## Architecture — Hybrid Codegen

The pipeline is **hybrid**: deterministic rendering + narrow LLM enrichment.

```
Swagger/cURL
    │
    ▼
Adapter (SwaggerEndpointAdapter / CurlEndpointAdapter)
    │  → EndpointModel (unified internal representation)
    ▼
TestCasePlanner + Strategy (SwaggerNegative / CurlNegative)
    │  → TestCasePlan[] (deterministic, tagged, stable IDs)
    ▼
DataFactory (json-schema-faker, seed-deterministic)
    │  → payload per plan (idempotent)
    ▼
ScenarioEnricher (LLM — title only, < 12 words per scenario)
    │  → EnrichedPlan[] (planId + title)
    ▼
ServiceTemplate + TestTemplate (deterministic renderers)
    │  → serviceTs + testTs strings
    ▼
ApiPostValidator (regex rules + tsc --noEmit)
    │  → errors → retry loop → write files
```

**Key design decisions:**
- LLM only generates *scenario titles* — all structure, payload, and assertions are deterministic.
- `DataFactory` uses `json-schema-faker` with a fixed seed → same input always yields same payload (F.4 idempotency).
- `x-depends-on` Swagger extension wires cross-endpoint dependencies for `Before()` prerequisite chains.

---

## Test Taxonomy

Every generated test file follows this tag scheme:

| Tag | Applied to | When |
|-----|------------|------|
| `@api` | Feature | Always — identifies API test suite |
| `@regression` | Feature | Always |
| `@positive` | Scenario | Happy path |
| `@smoke` | Scenario | On `@positive` unless endpoint is deprecated |
| `@contract` | Scenario | On `@positive` |
| `@schema` | Scenario | On `@positive` when 2xx response has a schema |
| `@negative-validation` | Scenario | Missing required field / invalid format |
| `@negative-auth-missing` | Scenario | No token header sent |
| `@negative-auth-invalid` | Scenario | Invalid token value sent |
| `@negative-headers` | Scenario | Missing required header (e.g. Lng or Tz) |
| `@deprecated` | Scenario | Endpoint marked deprecated in spec |

---

## Generating Tests from Swagger

```bash
npm run gen:swagger -- --input <path|url> [options]
```

**Options:**

| Flag | Default | Description |
|------|---------|-------------|
| `--input <path\|url>` | — | Path to swagger.json / YAML or https:// URL |
| `--output <dir>` | `src/api` | Root dir for Service files |
| `--test-output <dir>` | `tests/api/smoke` | Dir for test files |
| `--group <name>` | all | Generate only this tag group (PascalCase) |
| `--preview` | false | Print output, do not write files |
| `--exclude <patterns>` | — | Comma-separated operationId globs to skip |
| `--required-headers <names>` | — | Headers that must appear in every request |
| `--auth-negative-cases <mode>` | `both` | `missing` / `invalid` / `both` |
| `--seed <n>` | hash(input) | Fix DataFactory seed for deterministic payloads |
| `--include-optional` | false | Include optional fields in generated payloads |
| `--no-llm` | false | Skip ScenarioEnricher; use auto-generated titles |
| `--dry-data` | false | Print payloads to stdout, do not write files |
| `--skip-cache` | false | Re-call LLM even if cache hit exists |

**Example:**
```bash
npm run gen:swagger -- \
  --input tests/api/_fixtures/system-health.yaml \
  --output src/api \
  --test-output tests/api/smoke \
  --no-llm
```

---

## Generating Tests from cURL

```bash
npm run gen:curl -- --input <path> [options]
```

**Options:**

| Flag | Default | Description |
|------|---------|-------------|
| `--input <path>` | — | File containing the cURL command (preferred on Windows) |
| `--curl <cmd>` | — | Inline cURL command string |
| `--service-name <name>` | `Generated` | PascalCase class name (without "Service") |
| `--output-dir <dir>` | `src/api` | Root dir for Service files |
| `--preview` | false | Print output, do not write files |
| `--with-response <path>` | — | JSON file with example response body |
| `--expected-status <code>` | `200` | HTTP status to assert in positive test |
| `--path-template <pattern>` | — | Override URL tokenization, e.g. `/users/{userId}` |
| `--exclude <patterns>` | — | Comma-separated operationId patterns to skip |
| `--auth-negative-cases <mode>` | `both` | `missing` / `invalid` / `both` |
| `--seed <n>` | hash(input) | Fixed DataFactory seed |
| `--include-optional` | false | Include optional fields in payload |
| `--no-llm` | false | Skip enricher; use auto-titles |
| `--dry-data` | false | Print payloads to stdout, do not write files |

> **Windows PowerShell note:** Use `--input` with a `.curl` file instead of inline `--curl`.
> PowerShell mangles quotes when passing inline curl commands through `npm run`.

**Example:**
```bash
npm run gen:curl -- \
  --input samples/create-user.curl \
  --service-name User \
  --with-response samples/create-user-response.json \
  --expected-status 201
```

---

## Daily System Health Check

The generated API test suite *is* the daily system health check. Every endpoint tagged `@api` gets exercised daily.

```bash
# Quick PR gate — smoke scenarios only
npm run test:api:smoke

# Daily system health check — full @api suite
npm run test:api:daily

# Debug error paths — negative scenarios only
npm run test:api:negative
```

The CI cron job at `.github/workflows/api-daily-health.yml` runs `test:api:daily` at 2 AM UTC every day and uploads Allure results as artifacts (14-day retention).

---

## Test Data Layer

Generated tests use `DataFactory` + `DataContext` for all payload data:

- **`DataFactory.build(endpoint, { seed })`** — generates payload from JSON Schema using `json-schema-faker`. Same seed always produces the same output.
- **`DataContext`** — key-value store shared across a test group; supports `${key.nested}` template resolution for cross-endpoint data passing.
- **Seed override**: pass `--seed <n>` to pin the seed for debugging or snapshot testing.

### Cross-endpoint dependency chains (`x-depends-on`)

Add `x-depends-on: [createUser]` to a Swagger operation to declare that it depends on another operation. The planner emits a `Before()` block to create the prerequisite resource and capture its ID:

```yaml
# In your Swagger spec:
/users/{id}:
  get:
    operationId: getUser
    x-depends-on: [createUser]
```

Generated test output:
```ts
Before(async () => {
  const created = await svc.createUser(/* DataFactory payload */);
  dataCtx.capture('user.id', created.body.id);
});

Scenario('GET /users/{id} — positive', async () => {
  const res = await svc.getUser(dataCtx.get('user.id'));
  res.expectStatus(200);
}).tag('@positive').tag('@smoke');
```

---

## Ambient Headers Configuration

Ambient headers are injected by `RestClient.init()` automatically. Generated service files must **never** emit these headers via `.header()`.

### Default ecosystem (Token raw, no Bearer)

| Header | Default name | Config env var |
|--------|-------------|----------------|
| Auth token | `Token` | `API_HEADER_TOKEN` |
| Language | `Lng` | `API_HEADER_LANGUAGE` |
| Timezone | `Tz` | `API_HEADER_TIMEZONE` |

> `Lng` and `Tz` are only emitted when `config.apiLanguage` / `config.apiTimezone` have a value. Endpoints that do not need them receive no such headers.

### Switching presets via environment variables

```bash
# Default — raw Token (ecosystem majority, no "Bearer " prefix)
API_HEADER_TOKEN=Token
API_HEADER_TOKEN_PREFIX=

# HTTP standard Bearer
API_HEADER_TOKEN=Authorization
API_HEADER_TOKEN_PREFIX=Bearer 

# Custom API key header (e.g. AWS-style)
API_HEADER_TOKEN=X-API-Key
API_HEADER_TOKEN_PREFIX=
```

### Precedence chain (4 tiers, resolved per endpoint)

```
final tokenHeaderName =
  endpoint.auth.headerName          // 1. Swagger securityScheme.name (e.g. "X-API-Key")
  ?? init.headerOverrides.token      // 2. per-test runtime override
  ?? config.apiHeaderNames.token     // 3. env config (API_HEADER_TOKEN)
  ?? AMBIENT_DEFAULTS.token          // 4. 'Token'
```

### Negative auth tests

Generated `@negative-auth-*` scenarios use `client.init()` overrides — not `.header()` calls — so the ambient injection path is the one being tested:

```ts
// @negative-auth-missing — no token injected
const client2 = new RestClient();
await client2.init({ skipAmbient: ['token'] });

// @negative-auth-invalid — wrong token value
const client2 = new RestClient();
await client2.init({
  headerOverrides: { token: 'X-API-Key' },
  extraHTTPHeaders: { 'X-API-Key': 'invalid-token-for-test' },
});
```

---

## Adding a New Test Type

1. **Implement a `PlannerStrategy`** in `src/ai/codegen/shared/strategies/`:
   ```ts
   export class MyStrategy implements PlannerStrategy {
     planNegative(ep: EndpointModel): TestCasePlan[] { ... }
   }
   ```

2. **Add a new `TestKind`** to [TestCasePlan.ts](../src/ai/codegen/shared/TestCasePlan.ts) if needed.

3. **Extend `TestTemplate.renderTest()`** with a new `case` branch for your kind.

4. **Add validator rules** in [ApiPostValidator.ts](../src/ai/codegen/ApiPostValidator.ts) (`checkTestRules`) if the new kind has structural requirements.

5. **Add unit tests** in `tests/unit/ai/codegen/shared/strategies/`.

---

## Workflow

1. **Generate** — run with `--preview` first to inspect output
2. **Validate** — `npm run typecheck` must pass
3. **Review** — LLM output is a draft; check scenarios cover acceptance criteria
4. **Commit** — treat generated code like a normal PR; note "generated by AI" in commit message

---

## CLI Quick Reference

```bash
npm run gen:page     -- --html-file ./samples/login.html --page-name LoginForm
npm run gen:page     -- --url https://app.local/login --page-name LoginForm --preview
npm run gen:curl     -- --input ./samples/users.curl --service-name User
npm run gen:swagger  -- --input swagger.yaml --no-llm
npm run gen:scenario -- --story "As a user I want to log in" --feature-name Login
npm run gen:api      -- --curl-file ./samples/users.curl --service-name User   # legacy alias
```

---

## Troubleshooting

**High retry rate in codegen report** — the prompt template needs improvement; open a PR against `config/ai/prompts/`.

**LLM imports non-existent helpers** — run `npm run typecheck`, copy the tsc error, add `--max-retries 2` (already default). The pipeline re-asks the LLM with the tsc error text.

**Provider quota exceeded** — `TaskAwareRouter` falls back through the chain automatically (Cohere → Anthropic Sonnet → Anthropic Haiku). If all providers exhausted, wait for the cooldown shown in `output/.rate-limits.json`.

**Force fresh LLM call** — pass `--skip-cache` to bypass the 7-day idempotency cache (`output/codegen-cache.db`).

**Air-gapped / no LLM key** — pass `--no-llm` to skip the enricher entirely. Titles are auto-generated as `${METHOD} ${path} — ${kind}`, output is fully deterministic.
