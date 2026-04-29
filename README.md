# codecept-hybrid

Hybrid UI + API + Visual test automation framework với AI features (self-healing, code generation).

**Stack:** CodeceptJS 3.7 · Playwright 1.59 · TypeScript 5 · Vitest · Allure · Winston · SQLite

---

## Quickstart (5 phút)

```bash
# 1. Clone & install
git clone <repo-url>
cd codecept-hybrid
npm install

# 2. Copy env template và điền URL ứng dụng đang test
cp .env.example .env.dev
# Sửa BASE_URL và API_URL trong .env.dev

# 3. Verify setup (không cần app chạy)
npm run typecheck   # TypeScript compile OK
npm run lint        # ESLint pass
npm run test:unit   # 100+ unit tests (không cần browser, không cần server)

# 4. Chạy E2E test (cần app đang chạy tại BASE_URL)
ENV=dev npm test
```

> **Lần đầu chạy E2E** mà chưa có app: xem phần [Chạy với demo app](#chạy-với-demo-app) bên dưới.

---

## Tech Stack

| Layer | Công nghệ | Vai trò |
|---|---|---|
| Test runner | CodeceptJS 3.7 | BDD-style actions, plugin ecosystem |
| Browser engine | Playwright 1.59 | Chromium / Firefox / WebKit |
| API client | RestRequestBuilder (custom) | Fluent Playwright-style API client |
| Language | TypeScript 5 strict | Type safety, path aliases |
| Unit tests | Vitest 4 | AI module unit tests (zero browser) |
| Reporting | Allure 2 + Winston | HTML report + structured logs |
| Visual diff | Pixelmatch + pngjs | Pixel-level screenshot comparison |
| AI — primary | Anthropic Claude (Haiku 4.5 / Sonnet 4.6) | Self-healing, code generation |
| AI — fallback | Cohere command-r-plus, HuggingFace Qwen2.5-Coder | Free-tier fallback |
| AI — last resort | G4F community gateway | No API key needed |
| Locator cache | SQLite (better-sqlite3) | Self-heal cache với decay/stats |
| Schema validation | Zod | Config, AI output, API responses |
| CI/CD | Jenkins + Docker (Playwright image) | Matrix build: Chromium × Firefox |

---

## Folder Structure

```
codecept-hybrid/
├── config/
│   ├── codecept.ci.conf.ts     # CI override (headless, no pauseOnFail)
│   ├── ai/providers.profiles.ts # Task→provider/model mapping
│   └── ai/prompts/             # Mustache prompt templates (*.prompt.md)
├── src/
│   ├── core/                   # Logger, ConfigLoader, utils, RestHelper
│   ├── api/
│   │   ├── rest/               # RestClient, RestRequestBuilder, RestResponse, CurlConverter
│   │   ├── services/           # Hand-written service classes
│   │   │   └── _generated/     # AUTO-GENERATED service classes từ OpenAPI (git-ignored or reviewed)
│   │   └── schemas/            # Zod schemas: user.schema.ts, post.schema.ts, common.schema.ts
│   │       └── _generated.ts   # AUTO-GENERATED từ OpenAPI spec (npm run schemas:gen)
│   ├── ui/
│   │   ├── fragments/          # Reusable UI components (root locator + within)
│   │   ├── pages/              # Compose nhiều fragments, sở hữu 1 screen
│   │   └── steps/              # Business workflows (loginAs, logout, ...)
│   ├── visual/                 # VisualComparator (pixelmatch wrapper)
│   └── ai/
│       ├── providers/          # LLM gateway: providers, circuit breaker, budget
│       ├── heal/               # SelfHealEngine, LocatorRepository, HealTelemetry
│       ├── codegen/            # GenerationPipeline, HtmlToFragmentAgent, CurlToApiAgent
│       │   └── openapi/        # OperationParser, ServiceTemplate (OpenAPI → service)
│       ├── prompts/            # PromptLibrary (Mustache + YAML front-matter)
│       └── utils/              # DomSanitizer
├── tests/
│   ├── ui/smoke/               # @smoke @ui — login, basic flows
│   ├── api/smoke/              # @smoke @api — health checks
│   ├── api/regression/         # @api — CRUD scenarios (với schema validation)
│   ├── api/_generated/         # AUTO-GENERATED test suites từ OpenAPI (npm run gen:suite)
│   ├── visual/                 # @visual — screenshot comparison
│   └── unit/                   # Vitest unit tests (100+ tests, zero browser)
│       ├── ai/                 # AI module tests (codegen, heal, providers)
│       ├── api/rest/           # RestResponse, CurlConverter tests
│       └── scripts/            # gen-schemas-from-openapi tests
├── scripts/
│   ├── gen.ts                  # CLI: gen page | gen api | gen scenario
│   ├── gen-schemas-from-openapi.ts  # OpenAPI/Swagger → Zod schemas
│   ├── gen-suite.ts            # OpenAPI → service classes + test suite (bulk gen)
│   ├── heal-report.ts          # HTML dashboard từ heal-events.jsonl
│   └── codegen-report.ts       # LLM cost breakdown report
├── docs/
│   ├── ARCHITECTURE.md         # Hybrid pattern, diagrams, AI flows
│   ├── ONBOARDING.md           # 1-week plan cho QA mới
│   ├── AI_FEATURES.md          # Hướng dẫn self-heal + codegen
│   ├── AI_CODEGEN.md           # Code generation CLI reference
│   └── JENKINS_SETUP.md        # Cài Jenkins: plugins, credentials, webhook
├── Dockerfile                  # playwright:v1.59.1-jammy, HUSKY=0 npm ci
├── Jenkinsfile                 # Declarative Pipeline: matrix chromium×firefox
├── codecept.conf.ts            # Main CodeceptJS config
└── .env.example                # Template env vars
```

---

## NPM Scripts

### Chạy test

| Script | Lệnh thực tế | Khi nào dùng |
|---|---|---|
| `npm test` | `codeceptjs run --steps` | Local — thấy từng step |
| `npm run test:headless` | `HEADLESS=true codeceptjs run` | Local headless |
| `npm run test:ci` | `CI=true HEADLESS=true codeceptjs run -c config/codecept.ci.conf.ts --retry 2` | CI / Jenkins |
| `npm run test:smoke` | `codeceptjs run --grep @smoke` | Chỉ smoke tests |
| `npm run test:ui` | `codeceptjs run --grep @ui` | Chỉ UI tests |
| `npm run test:api` | `codeceptjs run --grep @api` | Chỉ API tests |
| `npm run test:visual` | `codeceptjs run --grep @visual` | Chỉ visual tests |
| `npm run test:unit` | `vitest run` | Unit tests (không cần browser) |
| `npm run test:unit:watch` | `vitest` | Unit tests watch mode |
| `npm run test:debug` | `codeceptjs run --debug --steps` | Debug verbose |

### AI features

| Script | Mô tả |
|---|---|
| `npm run test:ui:ai` | Bật `AI_HEAL_ENABLED=true`, chạy UI tests với self-healing |
| `npm run heal:report` | Generate HTML dashboard từ `output/heal-events.jsonl` |
| `npm run gen:page -- --url <URL> --name <Name>` | Generate Fragment + Page + Test từ URL (3 files) |
| `npm run gen:api -- --curl '<curl>' --name <Name>` | Generate Zod Schema + Service + Test từ cURL (3 files) |
| `npm run gen:scenario -- --description '<mô tả>'` | Generate test scenario |
| `npm run schemas:gen -- --spec <path\|url>` | Generate Zod schemas từ OpenAPI/Swagger spec |
| `npm run gen:suite -- --spec <path\|url>` | Generate service classes + test suite từ OpenAPI spec (bulk) |
| `npm run codegen:report` | LLM cost breakdown (provider, tokens, $$$) |

### Reporting

| Script | Mô tả |
|---|---|
| `npm run report:allure` | Generate + mở Allure HTML report |
| `npm run report:generate` | Chỉ generate (không mở browser) |
| `npm run report:open` | Mở report đã generate |
| `npm run report:clean` | Xóa toàn bộ output artifacts |

### Dev tooling

| Script | Mô tả |
|---|---|
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint `.ts` files |
| `npm run lint:fix` | ESLint + auto-fix |
| `npm run format` | Prettier write |
| `npm run visual:update` | Cập nhật visual baselines |

> **Allure auto-clean**: Tất cả `test:*` scripts đều có `rimraf output/reports/allure` ở đầu — report chỉ chứa kết quả của lần chạy gần nhất, không tích lũy từ các lần trước.

---

## Chạy với demo app

Nếu chưa có app để test, dùng public endpoints cho API tests:

```bash
# .env.dev
BASE_URL=https://www.saucedemo.com   # demo UI app
API_URL=https://jsonplaceholder.typicode.com
```

```bash
ENV=dev npm run test:api      # API smoke test với JSONPlaceholder
ENV=dev npm run test:unit     # Unit tests — không cần URL
```

> UI tests (`@ui`) cần app thật vì chúng tìm `[data-testid="login-form"]` cụ thể.

---

## Environment Variables

Xem [.env.example](.env.example) để có đầy đủ danh sách. Các biến bắt buộc:

| Var | Bắt buộc | Mô tả |
|---|---|---|
| `ENV` | Có | `dev` / `staging` / `prod` |
| `BASE_URL` | Có | URL app đang test (phải là valid URL) |
| `API_URL` | Có | URL API endpoint |
| `BROWSER` | Không | `chromium` (default) / `firefox` / `webkit` |
| `HEADLESS` | Không | `false` (default local) / `true` (CI) |
| `ANTHROPIC_API_KEY` | Chỉ khi dùng AI | Claude API key |
| `AI_HEAL_ENABLED` | Không | `true` để bật self-healing |
| `MAX_DAILY_BUDGET_USD` | Không | Default: `5` |
| `ATTACH_API_TO_REPORT` | Không | `false` để tắt API request/response attachments trong Allure (mặc định: bật) |

---

## CI/CD

Jenkins Declarative Pipeline — xem [docs/JENKINS_SETUP.md](docs/JENKINS_SETUP.md) để setup.

```
Push/PR → GitHub webhook → Jenkins build
  ├── Install (npm ci)
  ├── Lint & Typecheck
  ├── Test Chromium  ┐ song song
  └── Test Firefox   ┘
        └── Allure report merge → Jenkins UI
```

Nightly regression: tự động 2am UTC (cấu hình trong `Jenkinsfile`).

---

## Xem thêm

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — Hybrid pattern, AI flows, Mermaid diagrams
- [docs/ONBOARDING.md](docs/ONBOARDING.md) — Kế hoạch 1 tuần cho QA mới
- [docs/AI_FEATURES.md](docs/AI_FEATURES.md) — Self-healing, code generation, cost control
- [docs/JENKINS_SETUP.md](docs/JENKINS_SETUP.md) — Setup Jenkins: plugins, credentials, webhook
