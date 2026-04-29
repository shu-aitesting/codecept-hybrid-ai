# Roadmap: Xây dựng Playwright + CodeceptJS + RestClient Framework (TypeScript)

## Context

**Vai trò**: Bạn là QA Automation Engineer muốn tự xây một framework Test Automation **từ con số 0**, phục vụ cả **UI (Web)**, **API**, và **Visual Testing**, với các tính năng **AI chuyên sâu** (self-healing, AI-driven test data, AI code generation).

**Tech Stack chốt**:
- **Playwright** v1.54+ — browser automation engine
- **CodeceptJS** v3.6+ — BDD-ready test runner với plugin AI + heal (self-healing)
- **RestClient** (Playwright-style API client, custom) — API testing layer
- **TypeScript** 5.x — ngôn ngữ chính
- **Pattern**: Hybrid — **Page Fragments** (UI components) + **Step Objects** (business workflows)
- **LLM**: Anthropic Claude (primary) + Cohere/HuggingFace/G4F (free tier fallback) → tối ưu chi phí

**Tham chiếu framework hiện có** tại `../playwright/`:
- Đã có sẵn `RestClient` Playwright-style: `playwright/src/helpers/api/rest/RestClient.ts`, `RestRequestBuilder.ts`, `CurlConverter.ts`
- 4 AI agents active + 3 drafts (Cohere-based) tại `playwright/src/helpers/ai/` — port 3 agents (web/api/scenario) + 1 util (`AiDetectElements` → `LocatorScorer`)
- Visual comparison service: `playwright/src/sevices/visual/ImageComparisonSevice.ts`
- Winston logger, hooks, Cucumber reports — **có thể tái sử dụng ~60% codebase** thay vì viết lại.

**Mục tiêu**: Học theo **14 bước có cấu trúc**, mỗi bước giải thích **WHY** để nắm được lý do thiết kế, không phải copy-paste mù quáng.

---

## Folder Structure đề xuất (cây dự án cuối cùng)

```
codecept-hybrid/                            ← thư mục hiện tại
├── Jenkinsfile                             # CI/CD pipeline (PR trigger + nightly cron)
├── .husky/                                 # Git hooks
│   ├── pre-commit                          # lint + format
│   └── commit-msg                          # conventional commits
├── .vscode/
│   ├── settings.json
│   └── launch.json                         # Debug configs
├── config/
│   ├── codecept.conf.ts                    # CodeceptJS main config
│   ├── codecept.ci.conf.ts                 # Override cho CI (headless, parallel)
│   ├── environments/
│   │   ├── dev.env
│   │   ├── staging.env
│   │   └── prod.env
│   └── ai/
│       ├── providers.profiles.ts           # Task → provider/model mapping (heal/codegen/data-gen)
│       └── prompts/                        # Prompt templates (front-matter YAML + Mustache)
│           ├── heal.prompt.md              # Self-heal locator selection
│           ├── html-to-fragment.prompt.md  # HtmlToFragmentAgent
│           ├── curl-to-api.prompt.md       # CurlToApiAgent
│           └── scenario-gen.prompt.md      # ScenarioGeneratorAgent
├── src/
│   ├── core/                               # Framework internals (ít thay đổi)
│   │   ├── browser/
│   │   │   └── BrowserManager.ts           # ~ playwright/src/helpers/web/browsers/browserManager.ts
│   │   ├── logger/
│   │   │   └── Logger.ts                   # Winston wrapper
│   │   ├── config/
│   │   │   ├── ConfigLoader.ts             # Merge env + properties
│   │   │   └── EnvResolver.ts
│   │   └── utils/
│   │       ├── random.ts
│   │       ├── string.ts
│   │       ├── time.ts
│   │       └── file.ts
│   ├── api/                                # API testing layer
│   │   ├── rest/
│   │   │   ├── RestClient.ts               # Port từ playwright/src/helpers/api/rest/
│   │   │   ├── RestRequestBuilder.ts
│   │   │   ├── RestRequest.ts
│   │   │   ├── RestResponse.ts
│   │   │   ├── RestMethod.ts
│   │   │   └── CurlConverter.ts
│   │   ├── services/                       # API Service Objects (Fragments pattern cho API)
│   │   │   ├── AuthService.ts
│   │   │   ├── UserService.ts
│   │   │   └── ProductService.ts
│   │   └── schemas/                        # JSON Schema / Zod validation
│   │       └── user.schema.ts
│   ├── ui/                                 # UI Hybrid: Fragments + Step Objects
│   │   ├── fragments/                      # Fragments = autonomous components (root locator + within())
│   │   │   ├── common/
│   │   │   │   ├── HeaderFragment.ts
│   │   │   │   ├── NavbarFragment.ts
│   │   │   │   └── ModalFragment.ts
│   │   │   └── features/
│   │   │       ├── LoginFormFragment.ts
│   │   │       └── ProductCardFragment.ts
│   │   ├── pages/                          # Page Objects tổng hợp nhiều fragments
│   │   │   ├── LoginPage.ts
│   │   │   └── DashboardPage.ts
│   │   └── steps/                          # Step Objects = workflows ghép nhiều pages
│   │       ├── auth.steps.ts               # loginAs(role), logout(), ...
│   │       ├── checkout.steps.ts
│   │       └── onboarding.steps.ts
│   ├── visual/
│   │   ├── VisualComparator.ts             # Wrapper cho pixelmatch/resemblejs
│   │   ├── baselines/                      # Ảnh gốc
│   │   └── diffs/                          # Ảnh diff khi fail
│   ├── ai/
│   │   ├── providers/                      # LLM gateway (production-grade)
│   │   │   ├── BaseProvider.ts             # Retry + jitter + error classify
│   │   │   ├── AnthropicProvider.ts        # Haiku 4.5 + Sonnet 4.6 + prompt cache (ephemeral)
│   │   │   ├── CohereProvider.ts
│   │   │   ├── HuggingFaceProvider.ts
│   │   │   ├── G4FProvider.ts
│   │   │   ├── MockProvider.ts             # Fixture-based, cho unit test
│   │   │   ├── CircuitBreaker.ts           # Open/half-open/closed state per provider
│   │   │   ├── RateLimitTracker.ts         # Đếm calls/tokens/ngày, chặn khi gần limit
│   │   │   ├── CostMeter.ts                # Log $$$/call → output/llm-cost.jsonl
│   │   │   ├── BudgetGuard.ts              # Daily budget cap, throw nếu vượt
│   │   │   ├── StructuredOutputParser.ts   # zod schema + auto-fix retry
│   │   │   ├── TaskAwareRouter.ts          # Pick provider/model theo task profile
│   │   │   └── types.ts                    # LLMProvider interface, ChatMessage, ChatResult
│   │   ├── prompts/
│   │   │   └── PromptLibrary.ts            # Mustache loader + few-shot front-matter parser
│   │   ├── utils/
│   │   │   └── DomSanitizer.ts             # Strip script/style/svg/noise → giảm 70-90% token
│   │   ├── heal/
│   │   │   ├── SelfHealEngine.ts           # v2: cache → sanitize → LLM → DOM verify
│   │   │   ├── LocatorRepository.ts        # v2: SQLite + decay + success/fail stats
│   │   │   └── HealTelemetry.ts            # Append output/heal-events.jsonl
│   │   ├── data/
│   │   │   ├── AIDataGenerator.ts          # Natural language → test data
│   │   │   └── SchemaDrivenFaker.ts        # Sinh data theo JSON Schema
│   │   └── codegen/                        # Code generation pipeline + agents
│   │       ├── GenerationPipeline.ts       # Shared: load → render → LLM → validate → retry
│   │       ├── GenerationCache.ts          # SQLite idempotency (input hash → output)
│   │       ├── LocatorScorer.ts            # Port AiDetectElements (Cheerio scoring)
│   │       ├── HtmlToFragmentAgent.ts      # HTML → Fragment + Page + Test (Hybrid output)
│   │       ├── CurlToApiAgent.ts           # cURL → Service Object + API test
│   │       └── ScenarioGeneratorAgent.ts   # User story → Gherkin + step skeletons
│   ├── fixtures/                           # Reusable test data
│   │   ├── users.json
│   │   └── products.json
│   └── hooks/
│       ├── globalSetup.ts
│       ├── globalTeardown.ts
│       └── scenarioHooks.ts                # Before/After/BeforeAll
├── tests/
│   ├── ui/
│   │   ├── smoke/
│   │   │   └── login.test.ts
│   │   ├── regression/
│   │   └── features/                       # .feature files (BDD/Gherkin — optional)
│   │       └── auth.feature
│   ├── api/
│   │   ├── smoke/
│   │   │   └── health.test.ts
│   │   └── regression/
│   │       └── user-crud.test.ts
│   └── visual/
│       └── homepage.visual.test.ts
├── output/                                 # Test artifacts
│   ├── logs/
│   ├── reports/
│   │   ├── allure/
│   │   └── html/
│   ├── screenshots/
│   ├── videos/
│   ├── traces/
│   └── visual-diffs/
├── scripts/
│   ├── gen.ts                              # Commander CLI entry: gen page|api|scenario
│   ├── heal-report.ts                      # Tổng hợp heal-events.jsonl → HTML dashboard
│   └── codegen-report.ts                   # Tổng hợp codegen telemetry (cost/retry rate)
├── docs/
│   ├── ARCHITECTURE.md
│   ├── ONBOARDING.md
│   └── AI_FEATURES.md
├── .env.example
├── .eslintrc.json
├── .prettierrc
├── .gitignore
├── tsconfig.json
├── package.json
├── ROADMAP.md                              # Roadmap tóm tắt (file hiện có)
└── t-i-l-m-t-qa-unified-rain.md           # Roadmap chi tiết 14 bước (file này)
```

---

## Roadmap 14 bước

### Bước 1 — Khởi tạo Project & Tooling Foundation

**Làm gì**:
```bash
npm init -y
npm i -D typescript ts-node @types/node tsx
npx tsc --init
```
Tạo `tsconfig.json` với `strict: true`, `target: ES2022`, `moduleResolution: node`, `paths` cho alias (`@core/*`, `@ui/*`, `@api/*`, `@ai/*`).

**Why quan trọng**: Nền móng TypeScript strict + path aliases giúp tránh import dài `../../../`, bắt lỗi type sớm, IDE auto-complete chuẩn — là tiền đề để team scale codebase mà không bị nợ kỹ thuật.

---

### Bước 2 — Linting, Formatting, Git Hooks

**Làm gì**:
- Cài `eslint`, `@typescript-eslint/parser`, `@typescript-eslint/eslint-plugin`, `prettier`, `husky`, `lint-staged`, `commitlint`.
- Cấu hình `.eslintrc.json` (airbnb-typescript hoặc tự định nghĩa).
- `husky init` → pre-commit chạy `lint-staged` (format + lint files changed); commit-msg enforce conventional commits.

**Why quan trọng**: Code QA automation **chính là code production** — không có lint + format = debate style endless, PR review chậm. Git hooks chặn lỗi ở local trước khi tới CI → nhanh & rẻ hơn.

---

### Bước 3 — Thiết lập CodeceptJS với Playwright Helper

**Làm gì**:
```bash
npm i -D codeceptjs playwright @codeceptjs/helper
npx codeceptjs init
```
Chọn `Playwright` làm helper. Tạo `config/codecept.conf.ts` (dùng TS thay vì JS):
```typescript
export const config: CodeceptJS.MainConfig = {
  tests: './tests/ui/**/*.test.ts',
  output: './output',
  helpers: {
    Playwright: { url: process.env.BASE_URL, show: true, browser: 'chromium' },
    REST: { endpoint: process.env.API_URL },
    // Custom helpers sẽ add ở bước sau
  },
  include: {
    I: './steps_file.ts',
    // Fragments + Step Objects inject ở bước 7
  },
  plugins: {
    retryFailedStep: { enabled: true },
    screenshotOnFail: { enabled: true },
    tryTo: { enabled: true },
    heal: { enabled: false }, // Sẽ bật ở bước 11
  },
  bootstrap: './src/hooks/globalSetup.ts',
  teardown: './src/hooks/globalTeardown.ts',
};
```

**Why quan trọng**: CodeceptJS cung cấp **action syntax cao cấp** (`I.click`, `I.fillField`, `within()` cho Fragments) + hệ plugin giàu (heal, retryFailedStep, AI copilot) mà không phải viết lại. Playwright làm engine bên dưới → nhanh, cross-browser, có trace viewer. Chọn TS config để tận dụng auto-complete cho config.

---

### Bước 4 — Config & Environment Management

**Làm gì**:
- Tạo `.env.example` + `.env.dev`, `.env.staging`, `.env.prod` (git-ignore các file thật).
- `src/core/config/ConfigLoader.ts` đọc file theo biến `ENV`, merge với default, export object **immutable**.
- Validate bằng `zod` — thiếu biến → throw ngay khi boot, không chạy tới test rồi mới chết.

**Why quan trọng**: Framework real-world chạy trên nhiều môi trường. Config tập trung + validate schema giúp "fail fast" — bug config không lẻn xuống runtime được. Tham khảo `../playwright/src/config/env/env.ts` nhưng nâng cấp bằng zod.

---

### Bước 5 — Port RestClient (Playwright-style API Layer)

**Làm gì**: Copy và adapt từ `../playwright/src/helpers/api/rest/` sang `src/api/rest/`:
- `RestClient.ts` — khởi tạo qua `request.newContext()` (fix context bug đã document ở `../playwright/KE_HOACH_TUY_CHINH_FRAMEWORK.md` mục 5.2).
- `RestRequestBuilder.ts` — fluent API: `.url().method().headers().body().send()`.
- `CurlConverter.ts` — parse cURL string → RestRequest (hữu ích cho AI agent sau).
- Wrap thành CodeceptJS Helper `src/core/helpers/RestHelper.ts` để dùng trong scenario: `I.sendRestRequest(...)`.

**Why quan trọng**: Dùng `playwright.request` (thay vì axios) → cùng context cookies với browser → test "end-to-end từ UI sang API" không cần re-auth. Builder pattern giúp test case đọc như English: `I.api().get('/users').expectStatus(200)`. Fix bug context ngay từ đầu tránh nợ kỹ thuật.

---

### Bước 6 — Hybrid Pattern: Page Fragments

**Làm gì**: Tạo Fragments cho các UI components độc lập — mỗi fragment có **root locator** và dùng `within(root, () => ...)`:
```typescript
// src/ui/fragments/features/LoginFormFragment.ts
export = {
  root: '[data-testid="login-form"]',
  fields: { email: '#email', password: '#password' },
  submit: 'button[type="submit"]',

  fillCredentials(email: string, password: string) {
    within(this.root, () => {
      I.fillField(this.fields.email, email);
      I.fillField(this.fields.password, password);
    });
  },
  submitForm() { within(this.root, () => I.click(this.submit)); },
};
```
Inject vào CodeceptJS config dưới `include`. Page Objects (ví dụ `LoginPage`) **compose** nhiều Fragments thay vì chứa hết locators.

**Why quan trọng**: Fragment-based design **giảm trùng lặp 70%** khi cùng 1 component (modal, header, form) xuất hiện ở nhiều trang. Khác với POM cổ điển (1 page = 1 class chứa tất cả), Fragments modular hơn, test được riêng, dễ tái sử dụng. Framework cũ dùng POM thuần — đây là nâng cấp rõ rệt.

---

### Bước 7 — Hybrid Pattern: Step Objects (Business Workflows)

**Làm gì**: Step Objects ghép nhiều Page Objects / Fragments thành **business actions** tái sử dụng:
```typescript
// src/ui/steps/auth.steps.ts
const { I, loginPage, dashboardPage } = inject();
export = {
  async loginAs(role: 'admin' | 'customer') {
    const user = getUserByRole(role); // từ fixtures
    loginPage.open();
    loginPage.loginForm.fillCredentials(user.email, user.password); // dùng fragment
    loginPage.loginForm.submitForm();
    I.seeInCurrentUrl('/dashboard');
  },
  async logout() { dashboardPage.header.clickUserMenu(); I.click('Logout'); },
};
```
Trong test chỉ cần `I.loginAs('admin')` — không care low-level locators.

**Why quan trọng**: Step Objects nâng abstraction từ "click this button" lên **ngôn ngữ nghiệp vụ** ("login as admin"). Test ngắn gọn, dev đọc như đọc kịch bản. Khi UI đổi, chỉ sửa 1 chỗ trong step — toàn bộ test ăn theo. Đây chính là linh hồn của pattern **Hybrid** mà bạn chọn.

---

### Bước 8 — Visual Testing Integration

**Làm gì**:
- Port `../playwright/src/sevices/visual/ImageComparisonSevice.ts` sang `src/visual/VisualComparator.ts` (fix typo `sevices` → `visual`).
- Dùng `pixelmatch` + `pngjs` (nhẹ) hoặc `resemblejs` (có threshold).
- Thêm CodeceptJS helper `I.checkVisualMatch('homepage', { threshold: 0.01 })`.
- Lưu baselines vào `src/visual/baselines/`, diffs vào `output/visual-diffs/`.
- CLI command update baselines: `npm run visual:update`.

**Why quan trọng**: Visual regression bắt được lỗi **CSS/layout/branding** mà functional test không thấy (nút đổi màu, font sai, element lệch). Threshold config được giúp tránh false positives từ anti-aliasing. Cực kỳ quan trọng cho sản phẩm user-facing.

---

### Bước 9 — Logging, Reporting & Traceability

**Làm gì**:
- `Logger` = Winston (file + console), format JSON cho machine-readable log → `../playwright/src/helpers/logger/Log.ts` làm mẫu.
- Reports: **Allure** (`allure-codeceptjs`) + **HTML** (`mochawesome` hoặc CodeceptJS native).
- Artifacts mỗi scenario: screenshot on fail, video, **Playwright trace** (`.zip`) → mở bằng `npx playwright show-trace`.
- Optional: **ReportPortal** integration như framework cũ (`@reportportal/agent-js-playwright`) nếu có server.

**Why quan trọng**: Khi test fail ở CI lúc 3am, bạn không ngồi cạnh máy — **trace + video + screenshot** là vũ khí duy nhất để debug. Allure cho PM/BA xem pass/fail theo feature. Log JSON để grep/aggregate.

---

### Bước 10 — Test Data Management (Faker + ApiDataFactory + AI-Driven)

**Làm gì**:
- **Static fixtures**: `src/fixtures/*.json` cho data cố định (admin user, test products).
- **Faker**: `@faker-js/faker` sinh email, phone, address random.
- **ApiDataFactory** *(CodeceptJS built-in)*: tạo/xóa test data qua REST API tự động trong lifecycle test — lý tưởng cho hybrid testing (tạo user qua API → test UI → auto cleanup). Dùng `rosie` factories + `I.have('user', {...})` / `I.haveMultiple('post', 3)`.
- **Schema-driven**: `src/ai/data/SchemaDrivenFaker.ts` — input Zod/JSON Schema → output data hợp lệ.
- **AI-driven (bước nâng cao)**: `AIDataGenerator.ts` — prompt: "Generate 5 edge-case user registrations in Vietnam" → Claude/Cohere trả JSON array → validate schema → dùng trong test.
- Store generated data vào cache (file hoặc Redis) để test deterministic khi re-run.

**Why quan trọng**: Hardcoded data = test fragile (duplicate email → insert fail). Faker giải quyết 80%, nhưng **edge cases phức tạp** (user có tên Unicode dài, address nhiều dòng, credit card hợp lệ theo Luhn) thì AI sinh nhanh và thực tế hơn. `ApiDataFactory` giải quyết vấn đề test isolation — mỗi test có data riêng, không phụ thuộc vào state DB từ test trước. Cache để đảm bảo reproducible.

---

### Bước 11 — AI Self-Healing & LLM Gateway production-grade

**Làm gì**: Xây `src/ai/providers/` thành **gateway thật sự** chứ không phải thư mục chứa 4 file SDK wrapper:
- **`BaseProvider`** abstract — retry exponential-backoff + jitter, normalize lỗi (rate-limit / timeout / auth / server), token counting.
- **4 providers** kế thừa: Anthropic Claude (Haiku 4.5 default + Sonnet 4.6 cho task khó, **bật prompt caching `cache_control: ephemeral`** — TTL 5 phút), Cohere (command-r-plus), HuggingFace (Qwen2.5-Coder-32B), G4F (axios, last resort).
- **`CircuitBreaker`** — open sau 3 failures liên tiếp/provider, half-open sau 60s cooldown → tránh chờ Anthropic timeout 30s mỗi test khi API down.
- **`CostMeter` + `BudgetGuard`** — log $$$/call vào `output/llm-cost.jsonl`, abort run nếu vượt `MAX_DAILY_BUDGET_USD`.
- **`StructuredOutputParser`** — wrap LLM call với zod schema, retry với "fix this JSON" prompt nếu parse fail.
- **`TaskAwareRouter`** — config `providers.profiles.ts` định nghĩa `heal` (Haiku, temp 0, maxTokens 256), `codegen` (Sonnet, temp 0.2, maxTokens 4096), `data-gen` (Cohere, temp 0.7). Pick provider chain theo task name.
- **`MockProvider`** — fixture-based, zero API call, cho unit test agents.
- **`DomSanitizer`** (util dùng chung cho cả heal + codegen): strip `<script>`/`<style>`/`<svg>`/`<iframe>`/comments + tracking attrs (`data-gtm-*`, `on*`, inline `style`) + truncate base64 + collapse whitespace + trim long class chains. Raw DOM 50KB → ~5KB skeleton → tiết kiệm 70-90% token mỗi heal call.
- **`SelfHealEngine` v2**: 4-phase. Phase 0 = cache lookup. Phase 1 = sanitize DOM xung quanh failed selector (focused mode). Phase 2 = LLM gen 3-5 candidates. Phase 3 = verify từng candidate trên DOM thật (chọn unique match) → tránh hallucinated selector.
- **`LocatorRepository` v2**: SQLite (`better-sqlite3`) thay JSON file → schema có `success_count`, `fail_count`, `last_used_at`. Decay: invalidate sau 14 ngày no-use. Promotion script đề xuất PR thay healed selector vào source code khi `success_count > 10`.
- **`HealTelemetry`**: emit JSON lines → `output/heal-events.jsonl`. CLI `npm run heal:report` aggregate ra HTML dashboard với heal rate + cost + DOM size reduction.
- Bật plugin `heal` CodeceptJS với `fnResolveHealing` hook → inject `SelfHealEngine` v2 thay vì raw LLM.

**Why quan trọng**: Self-healing không có circuit-breaker = "Anthropic down 1 giờ → CI mất 30 phút chờ timeout × 100 test". Không có cost meter = "tháng đầu xài $50, tháng sau team spam test → $2000 hóa đơn". Không có 2-phase verification = "LLM bịa selector `[data-testid='login-button']` không tồn tại → heal pass nhưng test sau đó vẫn fail". Không có DOM sanitize = mỗi heal call feed nguyên 50KB raw DOM (script/style/svg/Tailwind classes) lên LLM → 12k token input × Haiku $0.80/1M = $0.01/heal × 1000 heal/tháng = $10. Sanitize → $1. Không có prompt cache = trả tiền 100% cho system prompt mỗi heal call (Anthropic giảm 90% chi phí cached input). Đây là sự khác biệt giữa **demo AI feature** và **AI feature dùng được trong production**.

---

### Bước 12 — AI Code Generation Pipeline (Hybrid output + validation)

**Làm gì**: Repo cũ thực ra có **4 active agents** (web/api/mobile/`AiDetectElements`) + 3 drafts, không phải "5 agents" như nói ban đầu. Tất cả đều Cohere-only, single-shot, regex extract code blocks (fragile), không validate output. Bước 12 mới xây **pipeline chung** + **3 core agents** + **1 deterministic util**:
- **`GenerationPipeline`** chuẩn cho mọi agent: load prompt → render Mustache với context → call LLM (qua `TaskAwareRouter('codegen')`) → parse với `StructuredOutputParser` (zod schema) → format Prettier → validate `tsc --noEmit` + ESLint → nếu fail → **retry với error feedback** (max 2 lần) → write file. **Idempotent cache** trên content-hash input → same input = no re-call LLM.
- **`LocatorScorer`** — port `AiDetectElements` (Cheerio scoring data-testid +80, id +75, text-match +60…) thành standalone util. Mọi UI agent **chạy LocatorScorer trước LLM** → top-5 candidates trong prompt context → LLM chỉ refine + name + organize. Đây là asset deterministic miễn phí trong repo cũ chưa được dùng.
- **`HtmlToFragmentAgent`** — input HTML/URL, output `Fragment + Page + Test` (Hybrid pattern, không phải Page+Steps+Feature như cũ). Dùng `DomSanitizer` (Bước 11) + `LocatorScorer` cho phần deterministic + LLM cho method naming + workflow.
- **`CurlToApiAgent`** v2 — input cURL, dùng `CurlConverter` (Bước 5) parse → AI fill in `Service Object` + scenarios (happy/error/edge). Output `src/api/services/XxxService.ts` + `tests/api/xxx.test.ts`.
- **`ScenarioGeneratorAgent`** — input user story, output Gherkin `.feature` + step skeletons. Prompt template ép gen ≥3 negative cases + 2 boundary cases.
- **CLI** dùng Commander: `npm run gen page --url <U>`, `gen api --curl <C>`, `gen scenario --story <S>`, hỗ trợ `--dry-run`, `--output-dir`, `--no-validate`, `--no-cache`.

**Bỏ qua scope**: `AiAgentMobileFromXml` (Appium — ít user); `TestDataAgent` (đã có `SchemaDrivenFaker` ở Bước 10); `CodeReviewAgent` (TypeScript strict + ESLint + zod validate trong pipeline đã đủ guardrail). Có thể add backlog sau.

**Why quan trọng**: Repo cũ gen code rồi xong — **không validate**, regex extract code blocks fragile (LLM thêm 1 dòng giải thích là parse lỗi), không few-shot, không tận dụng `AiDetectElements` đã tự build. Pipeline mới = "gen code mà chắc chắn compile được" — nếu LLM trả TypeScript invalid, retry với error message → LLM tự fix → giảm "QA phải sửa tay" 70%. `LocatorScorer` deterministic là **cost-saver** lớn — không tốn token để LLM "đoán" data-testid mà có sẵn từ DOM. Đây là sự khác biệt giữa "AI viết draft cho QA sửa tay" (cũ) và "AI viết code production-ready, QA review high-level" (mới).

---

### Bước 13 — CI/CD + Docker (Jenkins + GitHub)

**Làm gì**:
- `Dockerfile` dựa trên `mcr.microsoft.com/playwright:v1.54.2-jammy` (có sẵn browsers + libs, Jenkins dùng làm Docker agent).
- `Jenkinsfile` ở root — Declarative Pipeline gộp cả PR trigger lẫn nightly schedule:
  - `triggers { githubPush() }` — GitHub webhook kích hoạt build khi push/PR.
  - `triggers { cron('H 2 * * *') }` — chạy regression đầy đủ mỗi đêm.
  - `agent { docker { image 'playwright:...' args '--ipc=host' } }` — mọi stage chạy trong container → không phụ thuộc máy Jenkins host.
  - `matrix { axis { name 'BROWSER'; values 'chromium', 'firefox' } }` — chạy song song 2 browser.
  - `credentials('id')` lấy secrets từ Jenkins Credentials Store (thay cho GitHub Secrets).
  - `post { always { allure ... archiveArtifacts ... } }` — Allure report + traces ngay trên Jenkins UI.
- Tách `config/codecept.ci.conf.ts` — headless, retries: 2, parallel workers cao.
- **Jenkins setup 1 lần**: cài 3 plugins (GitHub Integration, Docker Pipeline, Allure), thêm credentials, cấu hình webhook.

**Why quan trọng**: Framework không chạy được trên CI thì chỉ là đồ chơi local. Docker agent chuẩn hoá môi trường ("works on my machine" → "works everywhere") và đặc biệt quan trọng với Jenkins vì không có managed runner như GitHub Actions — `--ipc=host` là bắt buộc cho Chromium trên Docker. Gộp PR + nightly vào 1 Jenkinsfile duy nhất dễ maintain hơn 2 workflow files riêng. Credentials Store của Jenkins bảo vệ secrets tương đương GitHub Secrets. Allure Plugin hiển thị lịch sử pass/fail trực tiếp trên Jenkins UI — PM/BA xem được mà không cần download artifact thủ công.

---

### Bước 14 — Documentation & Onboarding

**Làm gì**:
- `README.md`: 5-minute quickstart (clone → install → run sample test).
- `docs/ARCHITECTURE.md`: giải thích Hybrid pattern, LLM router, flow self-heal (có diagram Mermaid).
- `docs/ONBOARDING.md`: 1-week plan cho QA mới — ngày 1 chạy test có sẵn, ngày 3 viết fragment đầu tiên, ngày 5 dùng AI agent sinh page mới.
- `docs/AI_FEATURES.md`: hướng dẫn set API keys, bật self-heal, dùng codegen.
- Code comments: **chỉ viết khi giải thích WHY**, không explain WHAT.
- Changelog + semver cho framework khi release nội bộ.

**Why quan trọng**: Framework không docs = **knowledge silo** (chỉ bạn hiểu, bạn nghỉ việc là tèo). Documentation tốt là món quà lớn nhất cho đồng đội. Dành 1 ngày viết docs tiết kiệm 5 ngày onboarding cho người mới.

---

## Mapping nhanh tới Framework cũ (để tái sử dụng)

| Thành phần mới | File tham chiếu từ `../playwright/` | Mức độ |
|---|---|---|
| `src/api/rest/*` | `playwright/src/helpers/api/rest/*` | Copy + fix context bug |
| `src/visual/VisualComparator.ts` | `playwright/src/sevices/visual/ImageComparisonSevice.ts` | Copy + fix typo |
| `src/core/logger/Logger.ts` | `playwright/src/helpers/logger/Log.ts` | Copy |
| `src/core/browser/BrowserManager.ts` | `playwright/src/helpers/web/browsers/browserManager.ts` | Copy + adapt cho CodeceptJS |
| `src/ai/providers/BaseProvider.ts` (retry logic) | `_chatWithLlm` retry trong `playwright/src/helpers/ai/web/AiAgentWebFromXml.ts` | Generalize 3-attempt backoff + thêm jitter + classify error |
| `src/ai/codegen/LocatorScorer.ts` | `playwright/src/helpers/ai/element/AiDetectElements.ts` | Port + cleanup unused `query` param + thêm `topN` option |
| `src/ai/codegen/HtmlToFragmentAgent.ts` | `playwright/src/helpers/ai/web/AiAgentWebFromXml.ts` (`generatePageObjectCode` patterns) | Tham khảo naming convention (`inputXxx`, `clickXxxBtn`), output Hybrid Fragment thay vì POM |
| `src/ai/codegen/CurlToApiAgent.ts` | `playwright/src/helpers/ai/api/CurlToRestAgent.ts` (`_cleanTypescript`, fallback steps) | Port logic clean output, wrap vào `GenerationPipeline` thay single-shot |
| `config/ConfigLoader` | `playwright/src/config/env/env.ts` | Rewrite với zod |
| `src/core/utils/*` | `playwright/src/helpers/api/utils/*` | Copy (StringUtil, randomUtil, timeUtil) |

→ Ước tính **~60% codebase reuse**. Phần mới chủ yếu: CodeceptJS config, Fragments/Step Objects, LLM gateway (BaseProvider/CircuitBreaker/CostMeter/TaskAwareRouter), DomSanitizer, GenerationPipeline, heal plugin wiring.

---

## Verification (kiểm chứng cuối mỗi milestone)

| Milestone | Cách verify |
|---|---|
| Bước 1-2 | `npx tsc --noEmit` pass, `npm run lint` pass, git commit trigger hook |
| Bước 3-4 | `npx codeceptjs run` chạy được 1 dummy test, đổi `ENV=dev/prod` load đúng config |
| Bước 5 | Viết 1 API test `GET /users` → assert status 200 + schema |
| Bước 6-7 | Test login dùng Fragment `LoginFormFragment` + Step `I.loginAs('admin')` → pass |
| Bước 8 | Chạy visual test 2 lần → lần 2 so với baseline → generate diff khi có thay đổi CSS |
| Bước 9 | Fail 1 test cố ý → thấy screenshot + video + trace + Allure report |
| Bước 10 | Chạy test với AI-generated data → data match schema, deterministic trên 2 lần chạy |
| Bước 11 | Đổi locator ở UI → test vẫn pass nhờ heal plugin, `heal-report.json` ghi lại |
| Bước 12 | `npm run gen:page -- --url <demo>` → tạo file Fragment/Page/Test compile được |
| Bước 13 | Push PR → Jenkins build tự trigger, 2 parallel stages (chromium/firefox) xanh, Allure report hiển thị trên Jenkins build page |
| Bước 14 | QA mới clone repo, làm theo ONBOARDING.md → chạy được test trong <1h |

---

## Lộ trình thời gian gợi ý (cho 1 QA full-time)

- **Tuần 1**: Bước 1-5 (foundation + API layer)
- **Tuần 2**: Bước 6-8 (Hybrid UI + Visual)
- **Tuần 3**: Bước 9-10 (reporting + data)
- **Tuần 4**: Bước 11-12 (AI features — phần khó nhất, +2-3 ngày buffer cho LLM gateway tooling + DOM sanitization)
- **Tuần 5**: Bước 13-14 (CI/CD + docs) + buffer refactor

→ **~5 tuần** có framework production-ready cho team 3-5 QA.
