# AI Features Guide

Hướng dẫn setup và sử dụng 3 AI features: Self-Healing, Code Generation, và Cost Control.

---

## Setup API Keys

Thêm vào `.env.dev` (hoặc `.env.staging`, `.env.prod`):

```bash
# Primary (khuyến nghị) — free tier đủ cho hầu hết workflows
COHERE_API_KEY=...        # 1000 calls/month miễn phí trên command-a-03-2025

# Fallback (chất lượng cao + prompt caching, tốn $$$)
ANTHROPIC_API_KEY=sk-ant-...   # Haiku 4.5 cho heal/data-gen, Sonnet 4.6 cho codegen

# Last resort (free, quality kém hơn)
HF_TOKEN=hf_...           # Qwen2.5-Coder, ~30k tokens/day miễn phí
# G4F: no key needed — community gateway, uptime không ổn định
```

Tối thiểu cần `COHERE_API_KEY` để bật AI features (đủ cho dev/CI thông thường). Không có key nào → AI features tự disable; unit tests và E2E tests vẫn chạy bình thường (chỉ heal plugin và `gen:*` không hoạt động).

---

## Self-Healing

### Cách hoạt động

Khi Playwright không tìm được locator (vd: sau deploy làm thay đổi HTML structure), `SelfHealEngine` tự động:

1. **Cache lookup** — kiểm tra SQLite xem đã từng heal selector này chưa
2. **DOM sanitize** — rút gọn HTML xung quanh element (50KB → ~5KB, tiết kiệm 70-90% token)
3. **LLM gen candidates** — sinh 3-5 selector alternatives
4. **DOM verify** — kiểm tra từng candidate trên trang thật, chọn cái duy nhất match

### Bật self-healing

```bash
# Cách 1: env var
AI_HEAL_ENABLED=true ENV=dev npm run test:ui:ai

# Cách 2: trong .env.dev
AI_HEAL_ENABLED=true
ENV=dev npm run test:ui:ai
```

### Xem kết quả

Sau khi chạy với healing enabled:

```bash
npm run heal:report
# Mở output/heal-report.html (hoặc xem stdout)
```

Report hiển thị:
- Tổng heal attempts / success rate %
- Per-provider breakdown (Cohere vs Anthropic vs HF vs G4F)
- Top 10 selectors hay bị break nhất
- Chi phí LLM / heal call (chỉ tính cho Anthropic — Cohere/HF/G4F = $0)

### Locator cache (SQLite)

Cache lưu tại `output/heal-cache.db`:
- `success_count` / `fail_count` per selector
- `last_used_at` — decay sau 14 ngày không dùng
- Khi `success_count > 10` → xem xét update selector trong source code thay vì để heal mãi

### Tuning

```bash
# Tắt hoàn toàn (default)
AI_HEAL_ENABLED=false

# Chỉ bật cho 1 lần chạy debug
AI_HEAL_ENABLED=true ENV=dev npx codeceptjs run tests/ui/smoke/login.test.ts
```

---

## Code Generation

### gen page — Fragment + Page + Test từ HTML

```bash
# Fetch HTML từ URL
npm run gen:page -- --url https://app.example.com/checkout --page-name Checkout

# Đọc HTML từ file local
npm run gen:page -- --html-file /tmp/page.html --page-name ProductDetail

# Preview: xem output mà không write file
npm run gen:page -- --url https://example.com --page-name Example --preview

# Tắt cache (gọi LLM ngay cả khi input giống lần trước)
npm run gen:page -- --url https://example.com --page-name Example --skip-cache

# Giới hạn số lần retry khi LLM output invalid
npm run gen:page -- --url https://example.com --page-name Example --max-retries 1
```

**Output (3 files):**

```
src/ui/fragments/features/CheckoutFragment.ts   ← selectors + methods
src/ui/pages/CheckoutPage.ts                    ← compose fragment, sở hữu URL
tests/ui/smoke/checkout.smoke.test.ts           ← test cơ bản
```

**Sau khi gen:**

1. `npm run typecheck` — confirm compile OK
2. Review selectors với DevTools — LLM đoán từ HTML, không phải lúc nào cũng đúng 100%
3. Sửa selector sai nếu có
4. `ENV=dev npm run test:ui` — chạy thật

**Cách pipeline hoạt động:**
- Input hash → cache lookup → skip LLM nếu đã gen với input tương tự
- `DomSanitizer` rút gọn HTML trước khi feed LLM
- `LocatorScorer` pre-rank top-5 locator candidates (data-testid → id → text → attr) → LLM chỉ cần đặt tên + tổ chức, không cần "đoán" selector
- Output validate bằng `tsc --noEmit` → retry với error context nếu TypeScript lỗi (max 2 lần)

---

### gen:curl — Service Object + Test từ cURL

```bash
# Copy cURL từ browser DevTools → Network tab → chuột phải request → Copy as cURL
npm run gen:curl -- \
  --input 'curl -X POST https://api.example.com/orders \
    -H "Content-Type: application/json" \
    -d "{\"productId\":1,\"quantity\":2}"' \
  --service-name Order

# Từ file
npm run gen:curl -- --input /tmp/create-order.curl --service-name Order

# Dry-run (hiển thị nội dung file mà không ghi)
npm run gen:curl -- --input /tmp/order.curl --service-name Order --dry-run

# Không dùng LLM để đặt tiêu đề scenario (auto-title, tiết kiệm token)
npm run gen:curl -- --input /tmp/order.curl --service-name Order --no-llm

# In test data payload ra stdout mà không ghi file
npm run gen:curl -- --input /tmp/order.curl --service-name Order --dry-data
```

> `gen:api` là alias cũ của `gen:curl` — vẫn hoạt động nhưng không còn được khuyến nghị.

**Output (2 files):**

```
src/api/services/OrderService.ts    ← service object với typed methods
tests/api/smoke/order.test.ts       ← positive + negative test cases
```

**Sau khi gen:**
1. `npm run typecheck`
2. Service tự dùng `config.apiUrl` + relative endpoint — không cần điền URL thủ công
3. `ENV=dev npm run test:api`

---

### gen:swagger — Service Objects + Tests từ Swagger spec

```bash
# Từ URL (OpenAPI JSON/YAML)
npm run gen:swagger -- --input https://api.example.com/swagger.json

# Từ file local
npm run gen:swagger -- --input ./docs/api-spec.yaml

# Lọc theo tag hoặc path
npm run gen:swagger -- --input ./docs/api-spec.yaml --exclude "/internal/*"

# Chỉ required fields trong test data (không gen optional)
npm run gen:swagger -- --input ./docs/api-spec.yaml --include-optional false

# Sinh cả auth negative cases (không có token + sai token)
npm run gen:swagger -- --input ./docs/api-spec.yaml --auth-negative-cases both

# Seed cố định để tái tạo cùng test data
npm run gen:swagger -- --input ./docs/api-spec.yaml --seed 12345

# Không dùng LLM (auto-title từ template)
npm run gen:swagger -- --input ./docs/api-spec.yaml --no-llm
```

**Output per endpoint:**

```
src/api/services/<Name>Service.ts   ← typed service class
tests/api/regression/<name>.test.ts ← positive + negative cases
```

**Negative test cases tự động sinh từ JSON Schema:**
- `missing-required` — thiếu field bắt buộc → expect 400
- `wrong-type` — sai type (`string` thay `number`) → expect 400
- `boundary-min` / `boundary-max` — giá trị vượt min/max → expect 400/422
- `@negative-auth-*` — no token / sai token → expect 401/403

---

### gen scenario — CodeceptJS test + Step Object từ User Story

```bash
npm run gen:scenario -- --story "As a user I want to log in with email and password so I can access my account" --name Login

# User story chi tiết hơn → output tốt hơn
npm run gen:scenario -- --story \
  "As a shopper, I want to add a product to cart and complete checkout so I can purchase items" \
  --name Checkout
```

**Output (2 files):**

```
tests/ui/regression/<kebab-name>.test.ts   ← CodeceptJS Feature()/Scenario() format, tagged .tag('@smoke')/.tag('@negative')
src/ui/steps/<Name>Steps.ts               ← Step Object skeleton (class + export = new X())
```

Prompt template được cấu hình để generate ít nhất:
- 1 happy path scenario (`.tag('@smoke')`)
- 3 negative test cases (`.tag('@negative')`)
- 2 boundary cases (`.tag('@negative')`)

**Lưu ý:** Output là CodeceptJS TypeScript, không phải Gherkin `.feature`. Step Object skeleton cần review để đảm bảo các method delegate đúng đến fragment methods (không truy cập `.selectors` trực tiếp).

---

## Daily API Health Check

GitHub Actions workflow `.github/workflows/api-daily-health.yml` chạy toàn bộ `@api` suite lúc 2am UTC mỗi ngày:

```bash
# Tương đương với workflow chạy
npm run test:api:daily        # codeceptjs run --grep @api (retry 2x per scenario)
npm run test:api:smoke        # quick smoke — chỉ @smoke
npm run test:api:negative     # debug error paths — chỉ @negative-
```

**Artifacts:** Allure report được upload với retention 14 ngày (`workflow_dispatch` để chạy thủ công bất cứ lúc nào).

**Retry:** `codecept.conf.ts` cấu hình `retry: [{ grep: '@api', Scenario: 2 }]` — mỗi `@api` scenario tự retry 2 lần trước khi fail thật sự.

---

## Cost Control

### Budget Guard

```bash
# Trong .env.dev
MAX_DAILY_BUDGET_USD=2.00   # default: 5.00
```

Khi daily spend vượt ngưỡng → mọi LLM call throw `BudgetExceededError` → AI features tự disable cho phần còn lại của ngày. Tests thông thường vẫn chạy.

### Xem chi phí thực tế

```bash
# Per-call log (machine-readable)
cat output/llm-cost.jsonl | head -20

# Report tổng hợp codegen
npm run codegen:report
```

Output `codegen:report`:
```
Agent              Calls   Total Cost   Avg Input tok   Avg Output tok
HtmlToFragmentAgent   12   $0.032       1847            312
CurlToApiAgent         5   $0.008       923             188
ScenarioGenerator      3   $0.005       412             856
```

### Prompt caching (Anthropic only)

Khi router fallback sang Anthropic (vd: Cohere quota cạn), provider tự động bật **prompt caching** với `cache_control: { type: 'ephemeral' }` (TTL 5 phút) cho mọi system block — chỉ profile có `cacheSystem: true` (`codegen`, `review`):
- System prompt + few-shot examples được cache phía Anthropic
- Cached input tokens tính $0.08/1M (vs $0.80/1M regular cho Haiku 4.5) — giảm 90% chi phí cho input
- Sonnet 4.6: cached $0.30/1M vs $3/1M regular — vẫn giảm 90%

Cohere không có prompt caching API tương tự, nên `cacheSystem` flag bị provider bỏ qua khi route qua Cohere.

Để xem cache hit rate, check `output/llm-cost.jsonl` field `cachedTokens`.

---

## Provider Fallback Logic

Framework tự động chọn provider theo thứ tự ưu tiên (cấu hình tại [`config/ai/providers.profiles.ts`](../config/ai/providers.profiles.ts)):

```
heal task:     Cohere command-a → Anthropic Haiku → G4F
codegen task:  Cohere command-a → Anthropic Sonnet → Anthropic Haiku
data-gen:      Cohere command-a → Anthropic Haiku
review:        Anthropic Haiku → Cohere
```

Provider bị skip khi:
- Circuit breaker đang **open** (3 failures liên tiếp → cooldown 60s, gấp đôi mỗi lần fail half-open, max 5 phút)
- **Rate limit** đạt ngưỡng (Cohere 1000 calls/month, HF ~30k tokens/day) — kiểm tra qua `RateLimitTracker`
- **Budget** vượt `MAX_DAILY_BUDGET_USD` (chỉ tính cost Anthropic — Cohere/HF/G4F = $0)
- Key không được cấu hình (`isConfigured()` returns false)

Nếu tất cả providers bị skip → throw `ProviderError` "all providers failed for task=...".

---

## Troubleshooting

**"BudgetExceededError" ngay lần đầu chạy?**
Tăng `MAX_DAILY_BUDGET_USD` hoặc chạy `npm run report:clean` để reset (CostMeter dùng ngày UTC hiện tại).

**Self-healing không kick in?**
1. Kiểm tra `AI_HEAL_ENABLED=true` trong env
2. Kiểm tra ít nhất 1 trong `COHERE_API_KEY` / `ANTHROPIC_API_KEY` không trống
3. Xem console: "heal plugin disabled" nghĩa là `appConfig.ai.healEnabled === false` (env var chưa set)
4. Xem `output/heal-events.jsonl` — nếu có entry với `reason: "no provider configured"` → key thiếu

**Gen page output compile lỗi?**
Pipeline tự retry 2 lần với TypeScript error làm feedback. Nếu vẫn fail sau 2 lần:
1. Check `npm run typecheck` output
2. Sửa tay phần bị lỗi (thường là import path hoặc type mismatch nhỏ)

**LLM gọi timeout?**
`BaseProvider` retry exponential-backoff (30s timeout/call, max 3 attempts) cho mọi provider. Nếu vẫn timeout → circuit breaker mở → tự fallback sang provider tiếp theo trong chain (Cohere → Anthropic → HF/G4F). Check `output/llm-cost.jsonl` field `provider` để xem ai được dùng. Codegen task có timeout dài hơn (`timeoutMs: 120_000`) vì output dài.

**G4F trả output không dùng được?**
G4F là community gateway, chất lượng không ổn định. Nếu thấy logs "G4F response malformed" thường xuyên → bỏ G4F khỏi fallback chain trong `config/ai/providers.profiles.ts`.
