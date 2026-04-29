# AI Features Guide

Hướng dẫn setup và sử dụng 3 AI features: Self-Healing, Code Generation, và Cost Control.

---

## Setup API Keys

Thêm vào `.env.dev` (hoặc `.env.staging`, `.env.prod`):

```bash
# Primary (khuyến nghị)
ANTHROPIC_API_KEY=sk-ant-...

# Free-tier fallbacks (optional)
COHERE_API_KEY=...        # 1000 calls/month miễn phí
HF_TOKEN=hf_...           # ~30k tokens/day miễn phí

# G4F (no key needed, last resort, quality không ổn định)
# Tự động dùng nếu 3 provider trên đều không available
```

Không có key nào → AI features bị disable; unit tests và E2E tests thông thường vẫn chạy bình thường.

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
- Per-provider breakdown (Anthropic vs Cohere vs ...)
- Top 10 selectors hay bị break nhất
- Chi phí LLM / heal call

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
npm run gen:page -- --url https://app.example.com/checkout --name Checkout

# Đọc HTML từ file local
npm run gen:page -- --html-file /tmp/page.html --name ProductDetail

# Dry-run: preview pipeline không gọi LLM, không write files
npm run gen:page -- --url https://example.com --name Example --dry-run

# Tắt cache (gọi LLM ngay cả khi input giống lần trước)
npm run gen:page -- --url https://example.com --name Example --no-cache

# Giới hạn số lần retry khi LLM output invalid
npm run gen:page -- --url https://example.com --name Example --max-retries 1
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

### gen api — Zod Schema + Service Object + Test từ cURL

```bash
# Copy cURL từ browser DevTools → Network tab → chuột phải request → Copy as cURL
npm run gen:api -- \
  --curl 'curl -X POST https://api.example.com/orders \
    -H "Authorization: Bearer token" \
    -H "Content-Type: application/json" \
    -d "{\"productId\":1,\"quantity\":2}"' \
  --name Order

# Từ file
npm run gen:api -- --curl-file /tmp/create-order.curl --name Order

# Dry-run
npm run gen:api -- --curl 'curl ...' --name Order --dry-run
```

**Output (3 files):**

```
src/api/schemas/OrderSchema.ts      ← Zod schema cho request/response
src/api/services/OrderService.ts    ← typed service object với RestResponse assertions
tests/api/smoke/order.test.ts       ← test: happy path + schema validation + SLA + error cases
```

**Sau khi gen:**
1. `npm run typecheck`
2. Điền base URL nếu service dùng endpoint khác `API_URL`
3. `ENV=dev npm run test:api`

---

### schemas:gen — Zod schemas từ OpenAPI/Swagger spec

```bash
# Sinh schemas từ local spec file
npm run schemas:gen -- --spec path/to/swagger.json

# Từ URL
npm run schemas:gen -- --spec https://api.example.com/openapi.json

# Force re-generate (bỏ qua idempotency cache)
npm run schemas:gen -- --spec swagger.json --force
```

**Output:**

```
src/api/schemas/_generated.ts   ← ALL schemas từ spec (AUTO-GENERATED — do not edit)
src/api/schemas/index.ts        ← barrel re-export (cập nhật để include _generated)
```

**Idempotent:** SHA-256 hash của spec được lưu tại `src/api/schemas/.openapi-hash`. Re-run cùng spec → "Schema file is up-to-date", không re-generate.

**Swagger 2.0 hỗ trợ:** tự động convert qua `swagger2openapi` trước khi xử lý.

```bash
# Sau khi gen, verify không có TypeScript lỗi
npm run typecheck
```

---

### gen:suite — Service classes + Test suite từ OpenAPI spec (bulk)

```bash
# Sinh toàn bộ suite (tất cả tags trong spec)
npm run gen:suite -- --spec swagger.json

# Chỉ sinh cho 1 số tags cụ thể
npm run gen:suite -- --spec swagger.json --tags users,orders

# Bỏ qua deprecated operations
npm run gen:suite -- --spec swagger.json --exclude-deprecated

# Preview không write files
npm run gen:suite -- --spec swagger.json --dry-run

# Filter path pattern
npm run gen:suite -- --spec swagger.json --include-paths "/api/v2/*"
```

**Output (2 files per tag):**

```
src/api/services/_generated/UsersService.ts    ← deterministic (no LLM), typed methods
tests/api/_generated/users.test.ts             ← LLM-generated scenarios per operation
```

**Mỗi operation có ≥3 test scenarios:**
- `happy` — valid input, expectStatus 200/201
- `schema` — expectMatchesSchema(ResponseSchema)
- `sla` — expectResponseTime(2000)
- `404` (GET với `{id}` path param) — invalid id
- `400` (POST/PUT với required body) — missing field
- `401` (secured endpoint) — no auth header

**Cost estimate:** ~$0.25/run (5 tags × Sonnet), ~$0.05 sau prompt caching. Idempotent — re-run không gọi LLM nếu spec không đổi.

**Workflow sau gen:**

```bash
npm run typecheck       # verify generated code compile OK
# Review output trong _generated/
# Promote file ra folder chính khi đã review và customise xong
```

---

### gen scenario — Test scenarios từ mô tả

```bash
npm run gen:scenario -- --description "User đăng nhập với email sai thì thấy thông báo lỗi"

# Mô tả chi tiết hơn → output tốt hơn
npm run gen:scenario -- --description \
  "Checkout flow: user thêm sản phẩm vào cart, nhập địa chỉ giao hàng, chọn phương thức thanh toán, và hoàn thành đơn hàng"
```

**Output:**

```
tests/ui/regression/<scenario-name>.test.ts
```

Prompt template được cấu hình để generate ít nhất:
- 3 negative test cases
- 2 boundary cases
- Happy path

---

## API Attachment trong Allure

`RestHelper` tự động attach request/response JSON vào mỗi Allure test case:

```
API Request — POST /users    { method, url, headers (redacted), body }
API Response — 201 (123ms)   { status, durationMs, headers, body }
```

Headers nhạy cảm (Authorization, Cookie, X-Api-Key) tự động bị thay bằng `***redacted***`.

**Tắt attachment** (hữu ích khi cần performance trong CI):

```bash
ATTACH_API_TO_REPORT=false npm run test:api
```

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

### Prompt caching (Anthropic)

Anthropic Provider tự động bật **prompt caching** (`cache_control: ephemeral`, TTL 5 phút):
- System prompt + few-shot examples được cache phía Anthropic
- Cached input tokens tính $0.08/1M (vs $0.80/1M regular) — giảm 90% chi phí cho input

Để xem cache hit rate, check `output/llm-cost.jsonl` field `cachedInputTokens`.

---

## Provider Fallback Logic

Framework tự động chọn provider theo thứ tự ưu tiên (cấu hình tại `config/ai/providers.profiles.ts`):

```
heal task:    Anthropic Haiku 4.5 → Cohere → HuggingFace → G4F
codegen task: Anthropic Sonnet 4.6 → Cohere → HuggingFace → G4F
data-gen:     Cohere → HuggingFace → Anthropic Haiku → G4F
```

Provider bị skip khi:
- Circuit breaker đang **open** (3 failures liên tiếp → cooldown)
- **Rate limit** đạt ngưỡng (Cohere 1000 calls/month, HF ~30k tokens/day)
- **Budget** vượt `MAX_DAILY_BUDGET_USD`
- Key không được cấu hình

Nếu tất cả providers bị skip → throw error, không gọi LLM.

---

## Troubleshooting

**"BudgetExceededError" ngay lần đầu chạy?**
Tăng `MAX_DAILY_BUDGET_USD` hoặc chạy `npm run report:clean` để reset (CostMeter dùng ngày UTC hiện tại).

**Self-healing không kick in?**
1. Kiểm tra `AI_HEAL_ENABLED=true` trong env
2. Kiểm tra `ANTHROPIC_API_KEY` không trống
3. Xem console: "heal plugin disabled" nghĩa là key missing

**Gen page output compile lỗi?**
Pipeline tự retry 2 lần với TypeScript error làm feedback. Nếu vẫn fail sau 2 lần:
1. Check `npm run typecheck` output
2. Sửa tay phần bị lỗi (thường là import path hoặc type mismatch nhỏ)

**LLM gọi timeout?**
Anthropic `BaseProvider` retry exponential-backoff (30s timeout/call, max 3 attempts). Nếu vẫn timeout → circuit breaker mở → tự fallback sang Cohere. Check `output/llm-cost.jsonl` để xem provider nào được dùng.

**G4F trả output không dùng được?**
G4F là community gateway, chất lượng không ổn định. Nếu thấy logs "G4F response malformed" thường xuyên → bỏ G4F khỏi fallback chain trong `config/ai/providers.profiles.ts`.
