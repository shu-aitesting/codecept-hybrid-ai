# Onboarding: Kế hoạch 1 tuần cho QA mới

Sau 1 tuần bạn sẽ có thể: chạy test suite đầy đủ, viết fragment mới, dùng AI generation để bootstrap page object, và tạo API test từ cURL.

---

## Yêu cầu trước khi bắt đầu

- Node.js ≥ 20 (`node -v`)
- Git (`git -v`)
- VS Code (khuyến nghị) — có sẵn `.vscode/` trong repo

Không cần cài Playwright browsers thủ công — `playwright install` tự chạy khi cần.

---

## Ngày 1 — Clone, setup, hiểu cây thư mục

### Mục tiêu: chạy được test suite, thấy Allure report

```bash
git clone <repo-url>
cd codecept-hybrid
npm install

cp .env.example .env.dev
# Mở .env.dev và điền BASE_URL, API_URL (hỏi team lead nếu chưa có)
```

**Verify setup:**

```bash
npm run typecheck        # phải pass — không có lỗi TypeScript
npm run lint             # phải pass
npm run test:unit        # 100+ tests, không cần browser hay server
```

**Chạy E2E (cần app đang chạy):**

```bash
ENV=dev npm run test:smoke          # @smoke tests (~1-2 phút)
npm run report:allure               # mở Allure HTML report
```

**Đọc để hiểu:**
- [README.md](../README.md) — toàn bộ npm scripts và env vars
- `codecept.conf.ts` — xem helpers, plugins, include objects được đăng ký

**Checkpoint:** Bạn thấy test chạy được và report mở được.

---

## Ngày 2 — Đọc code: hiểu Fragment + Page

### Mục tiêu: hiểu tại sao framework dùng Fragment thay vì POM thuần

Đọc theo thứ tự:

1. `src/ui/fragments/base/BaseFragment.ts`
   - Chú ý `root` property và `within()` method — đây là nguyên tắc core

2. `src/ui/fragments/features/LoginFormFragment.ts`
   - Xem selectors được khai báo như thế nào
   - Xem `fillCredentials()` gọi `within(root)` để scope interactions

3. `src/ui/pages/LoginPage.ts`
   - Page chỉ compose fragments + quản lý URL path
   - Không có locator nào viết thẳng trong Page

4. `src/ui/steps/AuthSteps.ts`
   - Step Object gọi methods của Page/Fragment bằng ngôn ngữ nghiệp vụ
   - Test đọc `authSteps.loginAs('admin')` — không thấy selector nào

5. `tests/ui/smoke/login.test.ts`
   - Test file ngắn, chỉ gọi step object — đây là mục tiêu của pattern

**Thực hành:** Mở DevTools trên app đang test, tìm 1 component (ví dụ search bar, cart badge). Note lại:
- Root container CSS selector
- Các interactive elements bên trong
→ Ngày 3 bạn sẽ viết Fragment cho component đó.

---

## Ngày 3 — Viết Fragment đầu tiên

### Mục tiêu: tự tạo Fragment mới từ đầu

Tạo file `src/ui/fragments/common/SearchBarFragment.ts` (hoặc component bạn đã note ngày 2):

```typescript
import { BaseFragment } from '../base/BaseFragment';

class SearchBarFragment extends BaseFragment {
  root = '[data-testid="search-bar"]'; // thay bằng selector thật

  selectors = {
    input: 'input[type="search"]',
    clearBtn: '[data-testid="clear-search"]',
    resultsCount: '[data-testid="results-count"]',
  };

  async search(term: string): Promise<void> {
    await this.within(async () => {
      this.I.fillField(this.selectors.input, term);
      this.I.pressKey('Enter');
    });
  }

  async clear(): Promise<void> {
    await this.within(async () => {
      this.I.click(this.selectors.clearBtn);
    });
  }
}

export = new SearchBarFragment();
```

**Đăng ký vào `codecept.conf.ts`:**

```typescript
include: {
  // ...các fragment cũ
  searchBar: './src/ui/fragments/common/SearchBarFragment.ts',
}
```

**Viết unit test nhỏ:**

```bash
npm run typecheck       # verify không lỗi TypeScript
ENV=dev npm run test:ui # chạy UI tests, xem Fragment được gọi
```

---

## Ngày 4 — Viết Step Object + API test đầu tiên

### Mục tiêu: hiểu API layer, thêm business step mới

**Phần 1 — Xem API layer:**

Đọc `src/api/rest/RestRequestBuilder.ts` (phần đầu, khoảng 30 dòng đủ hiểu fluent pattern).

Đọc `src/api/schemas/user.schema.ts` để hiểu Zod schemas và cách dùng trong assertions.

Chạy API test có sẵn và xem output:
```bash
ENV=dev npm run test:api
```

**Phần 2 — Viết API test mới với schema validation:**

Tạo `tests/api/smoke/search.test.ts`:

```typescript
import { UserSchema } from '@api/schemas';

Feature('Search API @api @smoke');

Scenario('GET /users/1 returns valid user', async ({ I }) => {
  const res = await I.sendGet('/users/1');
  res
    .expectStatus(200)
    .expectMatchesSchema(UserSchema)     // validate cấu trúc response
    .expectResponseTime(2000)            // SLA: dưới 2 giây
    .expectContentType('application/json');
});
```

**Phần 3 — Thêm Step Object method:**

Mở `src/ui/steps/AuthSteps.ts`, xem pattern `loginAs()`. Thêm method tương tự cho workflow mới bạn cần (ví dụ `searchFor(term: string)`).

**Checkpoint:** API test pass, bạn có thể gọi `I.sendGet/sendPost` tự nhiên.

---

## Ngày 5 — Dùng AI generation (gen page)

### Mục tiêu: dùng `gen page` CLI để bootstrap Fragment + Page + Test từ HTML

**Yêu cầu:** cần `ANTHROPIC_API_KEY` trong `.env.dev`.

```bash
# Từ URL (fetch HTML tự động)
npm run gen:page -- --url https://example.com/checkout --name Checkout

# Hoặc từ HTML file
npm run gen:page -- --html-file /tmp/checkout.html --name Checkout
```

Output sẽ tạo 3 file:
- `src/ui/fragments/features/CheckoutFragment.ts`
- `src/ui/pages/CheckoutPage.ts`
- `tests/ui/smoke/checkout.smoke.test.ts`

**Review output:**
1. Kiểm tra selectors có đúng với DOM thật không (so sánh với DevTools)
2. Sửa bất kỳ selector nào sai
3. Chạy typecheck: `npm run typecheck`
4. Chạy test sinh ra: `ENV=dev npm run test:ui`

**Nếu không có Anthropic key:** dùng `--dry-run` để xem pipeline hoạt động mà không gọi LLM.

```bash
npm run gen:page -- --url https://example.com --name Example --dry-run
```

---

## Ngày 6 — Gen API test từ cURL + Visual test

### Mục tiêu: gen Service Object từ cURL, chạy visual baseline

**Gen API từ cURL:**

```bash
# Copy cURL từ browser DevTools Network tab
npm run gen:api -- \
  --curl 'curl -X POST https://api.example.com/orders -H "Content-Type: application/json" -d "{\"productId\":1}"' \
  --name Order
```

Output (3 files):
- `src/api/schemas/OrderSchema.ts` — Zod schema cho request/response
- `src/api/services/OrderService.ts` — typed service class
- `tests/api/smoke/order.test.ts` — test với schema validation + SLA assertions

Review và chạy `npm run typecheck`.

**Visual baseline:**

Chạy visual test lần đầu để tạo baseline:
```bash
ENV=dev npm run visual:update        # chụp và lưu baseline
ENV=dev npm run test:visual          # lần này so với baseline → pass
```

Sau khi UI team deploy UI change:
```bash
ENV=dev npm run test:visual          # diff xuất hiện tại output/visual-diffs/
```

---

## Ngày 7 — PR đầu tiên + checklist

### Mục tiêu: tạo PR đúng quy trình, CI pass

**Trước khi push:**

```bash
npm run typecheck        # 0 errors
npm run lint             # 0 errors
npm run test:unit        # all pass
git add <files bạn thay đổi>
git commit -m "feat(ui): add SearchBarFragment"
```

Commit message format (bắt buộc bởi `commitlint`):
- `feat(scope): mô tả` — tính năng mới
- `fix(scope): mô tả` — bug fix
- `refactor(scope): mô tả` — refactor
- `test(scope): mô tả` — thêm/sửa test
- `docs(scope): mô tả` — docs

**Scope thường dùng:** `ui`, `api`, `ai`, `visual`, `core`, `ci`

**Sau khi push:** kiểm tra Jenkins build xanh, Allure report có test của bạn.

---

## Cheatsheet commands

```bash
# Chạy test theo nhóm
ENV=dev npm run test:smoke           # smoke suite
ENV=dev npm run test:ui              # UI tests
ENV=dev npm run test:api             # API tests
ENV=dev npm run test:visual          # Visual tests
npm run test:unit                    # Unit tests (offline)

# Debug khi test fail
ENV=dev npm run test:debug           # verbose steps
npx playwright show-trace output/trace/<file>.zip  # xem trace

# AI features
AI_HEAL_ENABLED=true ENV=dev npm run test:ui:ai    # self-healing mode
npm run heal:report                                 # xem heal stats

# Code gen
npm run gen:page -- --url <URL> --name <Name>
npm run gen:api -- --curl '<cURL>' --name <Name>        # 3 files: schema + service + test
npm run gen:scenario -- --description '<mô tả>'
npm run schemas:gen -- --spec <swagger.json>            # sinh Zod schemas từ OpenAPI spec
npm run gen:suite -- --spec <swagger.json>              # sinh toàn bộ service + test suite

# Xem report
npm run report:allure                # generate + mở
npm run report:clean                 # xóa output artifacts
```

---

## Câu hỏi thường gặp

**Q: Test fail với "Cannot find BASE_URL" hoặc ZodError?**
A: Chưa set env. Chạy `ENV=dev npm ...` hoặc check `.env.dev` có BASE_URL, API_URL đúng format `http://...` không.

**Q: Playwright báo "browser not found"?**
A: Chạy `npx playwright install chromium` một lần.

**Q: `npm install` báo lỗi `husky: command not found`?**
A: Node version cũ. Upgrade lên Node ≥ 20.

**Q: Self-healing không hoạt động?**
A: Kiểm tra `.env.dev` có `AI_HEAL_ENABLED=true` và `ANTHROPIC_API_KEY` không trống. Xem [docs/AI_FEATURES.md](AI_FEATURES.md).

**Q: Gen page output có selector sai?**
A: LLM đoán từ HTML — selectors không phải lúc nào cũng đúng 100%. Review output và sửa tay những selector sai trước khi commit.

**Q: Commit bị reject bởi commitlint?**
A: Dùng format `type(scope): message`. Ví dụ: `feat(ui): add CheckoutFragment`.

**Q: Allure report hiển thị kết quả từ các lần chạy trước?**
A: Không nên xảy ra — tất cả `test:*` scripts đã tự động xoá `output/reports/allure` trước khi chạy. Nếu dùng lệnh `codeceptjs run` trực tiếp (không qua npm scripts), chạy `npm run report:clean` trước.

**Q: API request/response không hiện trong Allure?**
A: Đây là tính năng mặc định bật — mỗi API call được attach vào Allure. Tắt bằng `ATTACH_API_TO_REPORT=false npm run test:api`.
