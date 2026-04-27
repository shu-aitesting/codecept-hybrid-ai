# Implementation Playbook: codecept-hybrid Framework

> **Cách dùng tài liệu này**: Đây là playbook chi tiết để Claude Code thực hiện từng micro-step. Mỗi sub-step nhỏ gọn (~1-3 file operations), có giải thích **Why/Học gì** để bạn học khái niệm trong khi implement. Sau mỗi step có **Verify** để confirm trước khi sang bước tiếp theo.
>
> **Đường dẫn project**: `c:\Users\Automation\AI_Study\AI_Automation\codecept-hybrid\`
> **Framework tham chiếu**: `c:\Users\Automation\AI_Study\AI_Automation\playwright\`
> **Ngày bắt đầu**: 2026-04-26

---

## Cách thức làm việc

1. **Bạn nói**: "Làm step X.Y" hoặc "Làm cả Bước X" hoặc "Tiếp tục".
2. **Claude Code**:
   - Đọc step tương ứng trong playbook này
   - Thực hiện file operations / commands
   - Giải thích ngắn (1-2 câu) "vừa làm gì + tại sao"
   - Chạy verify command
   - Báo kết quả + đề xuất step tiếp theo
3. **Bạn**: Hỏi nếu chưa hiểu, hoặc xác nhận tiếp tục.

**Quy ước ký hiệu**:
- 🎯 Goal — mục tiêu của step
- ⚙️ Action — file operations / commands cụ thể
- 💡 Why/Học gì — giải thích khái niệm để học
- ✅ Verify — cách confirm step đã xong

---

# PHẦN 1: FOUNDATION (Bước 1–4)

Thiết lập nền móng project: TypeScript, lint/format, CodeceptJS, env config.

---

## Bước 1: Khởi tạo Project & TypeScript

### 1.1 — Khởi tạo npm package
- 🎯 Tạo `package.json` cơ bản
- ⚙️ Run `npm init -y` trong `codecept-hybrid/`. Sau đó edit `package.json`: set `"name": "codecept-hybrid"`, `"version": "0.1.0"`, `"private": true`, `"description": "Hybrid UI+API+Visual test framework with AI features"`.
- 💡 **Học gì**: `package.json` là manifest của project Node.js — chứa metadata, dependencies, scripts. `"private": true` chặn vô tình `npm publish` lên registry công cộng.
- ✅ Verify: `cat package.json` thấy đúng tên + version.

### 1.2 — Cài TypeScript + ts-node
- 🎯 Cài compiler TypeScript và runtime ts-node để chạy `.ts` trực tiếp.
- ⚙️ Run `npm i -D typescript@^5.4 ts-node@^10.9 @types/node@^20 tsx@^4`.
- 💡 **Học gì**: `typescript` = compiler `tsc`. `ts-node` = chạy file `.ts` như node mà không cần build. `tsx` = phiên bản nhanh hơn (esbuild-based), CodeceptJS thường dùng. `-D` = devDependencies vì TS không cần ở runtime production.
- ✅ Verify: `npx tsc --version` in ra version 5.x.

### 1.3 — Tạo tsconfig.json với strict mode + path aliases
- 🎯 Cấu hình TypeScript strict + alias để import gọn.
- ⚙️ Tạo `tsconfig.json`:
  ```json
  {
    "compilerOptions": {
      "target": "ES2022",
      "module": "commonjs",
      "moduleResolution": "node",
      "esModuleInterop": true,
      "experimentalDecorators": true,
      "emitDecoratorMetadata": true,
      "strict": true,
      "skipLibCheck": true,
      "resolveJsonModule": true,
      "baseUrl": "./src",
      "paths": {
        "@core/*": ["core/*"],
        "@api/*": ["api/*"],
        "@ui/*": ["ui/*"],
        "@ai/*": ["ai/*"],
        "@visual/*": ["visual/*"],
        "@fixtures/*": ["fixtures/*"],
        "@hooks/*": ["hooks/*"]
      },
      "outDir": "./dist",
      "types": ["node", "codeceptjs"]
    },
    "include": ["src/**/*", "tests/**/*", "config/**/*", "scripts/**/*"],
    "exclude": ["node_modules", "dist", "output"]
  }
  ```
- 💡 **Học gì**:
  - `strict: true` bật 7 flags (noImplicitAny, strictNullChecks…) → bắt lỗi sớm. Test code thường ẩn lỗi `null`/`undefined` → strict cứu mạng.
  - `paths` cho phép `import { Logger } from '@core/logger/Logger'` thay vì `'../../../core/logger/Logger'`. Nhưng chỉ TS hiểu — runtime cần `tsconfig-paths` hoặc bundler.
  - `experimentalDecorators` cần cho CodeceptJS Step Objects nếu dùng `@inject()`.
- ✅ Verify: `npx tsc --noEmit` không lỗi (chưa có file `.ts` nào, sẽ pass).

### 1.4 — Tạo .gitignore
- 🎯 Tránh commit file rác.
- ⚙️ Tạo `.gitignore`:
  ```
  node_modules/
  dist/
  output/
  .env
  .env.dev
  .env.staging
  .env.prod
  *.log
  .DS_Store
  Thumbs.db
  .vscode/*
  !.vscode/settings.json
  !.vscode/launch.json
  coverage/
  .nyc_output/
  ```
- 💡 **Học gì**: `.env*` files chứa secrets → tuyệt đối không commit. `!.vscode/settings.json` là negation — share workspace settings nhưng không share state cá nhân. `output/` là test artifacts (ảnh, video, log) — sinh ra mỗi lần chạy, không cần version.
- ✅ Verify: file tồn tại với nội dung trên.

### 1.5 — Tạo cấu trúc thư mục skeleton
- 🎯 Skeleton folders theo folder structure trong roadmap.
- ⚙️ Tạo các thư mục rỗng (mỗi thư mục có file `.gitkeep` để git track):
  ```
  src/core/{browser,logger,config,utils,helpers}/.gitkeep
  src/api/{rest,services,schemas}/.gitkeep
  src/ui/{fragments/common,fragments/features,pages,steps}/.gitkeep
  src/visual/{baselines,diffs}/.gitkeep
  src/ai/{providers,heal,data,codegen}/.gitkeep
  src/fixtures/.gitkeep
  src/hooks/.gitkeep
  tests/{ui/smoke,ui/regression,ui/features,api/smoke,api/regression,visual}/.gitkeep
  config/{environments,ai/prompts}/.gitkeep
  output/{logs,reports/allure,reports/html,screenshots,videos,traces,visual-diffs}/.gitkeep
  scripts/.gitkeep
  docs/.gitkeep
  ```
- 💡 **Học gì**: Git không track empty dirs → dùng `.gitkeep` (convention, không phải file đặc biệt). Skeleton sớm giúp imports không break khi dev. Trong CI, các folder `output/*` sẽ được tạo runtime — nhưng có sẵn cho dev local.
- ✅ Verify: `tree src tests config output scripts docs -L 3 -d` (Linux) hoặc `Get-ChildItem -Recurse -Directory` (PS) thấy đầy đủ.

### 1.6 — Smoke test TypeScript
- 🎯 Confirm TS compile được.
- ⚙️ Tạo `src/core/utils/string.ts`:
  ```typescript
  export function capitalize(s: string): string {
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
  ```
  Tạo `tests/ui/smoke/sanity.test.ts`:
  ```typescript
  import { capitalize } from '@core/utils/string';
  console.log(capitalize('hello'));
  ```
- ⚙️ Run `npx tsc --noEmit`.
- 💡 **Học gì**: Dòng đầu tiên dùng path alias `@core/*` → confirm `tsconfig.paths` work. `--noEmit` chỉ type-check, không tạo file `.js` (CodeceptJS sẽ chạy TS trực tiếp qua tsx).
- ✅ Verify: `npx tsc --noEmit` exit code 0.

---

## Bước 2: Linting, Formatting, Git Hooks

### 2.1 — Cài ESLint + TypeScript plugins
- ⚙️ `npm i -D eslint@^8 @typescript-eslint/parser@^7 @typescript-eslint/eslint-plugin@^7 eslint-plugin-import eslint-config-prettier`.
- 💡 **Học gì**: `@typescript-eslint/*` mở rộng ESLint hiểu TS. `eslint-config-prettier` tắt rules conflict với Prettier (vd: max-line-length) — Prettier lo format, ESLint lo logic.
- ✅ Verify: `npx eslint --version` in ra version.

### 2.2 — Tạo .eslintrc.json
- ⚙️ Tạo `.eslintrc.json`:
  ```json
  {
    "root": true,
    "parser": "@typescript-eslint/parser",
    "parserOptions": { "ecmaVersion": 2022, "sourceType": "module", "project": "./tsconfig.json" },
    "plugins": ["@typescript-eslint", "import"],
    "extends": ["eslint:recommended", "plugin:@typescript-eslint/recommended", "prettier"],
    "rules": {
      "@typescript-eslint/no-unused-vars": ["error", { "argsIgnorePattern": "^_" }],
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/explicit-function-return-type": "off",
      "import/order": ["error", { "groups": ["builtin", "external", "internal"], "newlines-between": "always" }],
      "no-console": "off"
    },
    "ignorePatterns": ["dist/", "output/", "node_modules/"]
  }
  ```
- 💡 **Học gì**: Test code thường có `console.log` debug → tắt `no-console`. `argsIgnorePattern: "^_"` cho phép `function(_unused, used)` mà không warn. `import/order` = imports phải được group rõ ràng → readable.
- ✅ Verify: `npx eslint src/core/utils/string.ts` không lỗi.

### 2.3 — Cài Prettier + .prettierrc
- ⚙️ `npm i -D prettier@^3`. Tạo `.prettierrc`:
  ```json
  {
    "semi": true,
    "singleQuote": true,
    "trailingComma": "all",
    "printWidth": 100,
    "tabWidth": 2,
    "arrowParens": "always",
    "endOfLine": "lf"
  }
  ```
  Tạo `.prettierignore`:
  ```
  node_modules/
  dist/
  output/
  *.md
  ```
- 💡 **Học gì**: `endOfLine: "lf"` chuẩn Unix → tránh CRLF mess trên Windows khi PR. `singleQuote` matching style của TypeScript ecosystem. Bỏ qua `*.md` để giữ format tài liệu của bạn.
- ✅ Verify: `npx prettier --check src/` không lỗi.

### 2.4 — Cài Husky + lint-staged
- ⚙️ `npm i -D husky@^9 lint-staged@^15`. Run `npx husky init` (tự tạo `.husky/pre-commit` chỉ chạy `npm test`). Edit `.husky/pre-commit` thành: `npx lint-staged`.
- ⚙️ Add vào `package.json`:
  ```json
  "lint-staged": {
    "*.{ts,tsx}": ["eslint --fix", "prettier --write"],
    "*.{json,md,yml}": ["prettier --write"]
  }
  ```
- 💡 **Học gì**: Pre-commit hook chạy chỉ trên **staged files** (không phải toàn repo) → nhanh. `lint-staged` tự `git add` lại files sau khi format → commit lấy version đẹp. Đây là "shift-left" — bắt lỗi format ở dev local thay vì CI.
- ✅ Verify: Tạo file `.ts` xấu, `git add`, `git commit` → format auto đẹp.

### 2.5 — Cài commitlint + commit-msg hook
- ⚙️ `npm i -D @commitlint/cli @commitlint/config-conventional`. Tạo `commitlint.config.js`:
  ```javascript
  module.exports = { extends: ['@commitlint/config-conventional'] };
  ```
  Tạo `.husky/commit-msg`:
  ```bash
  npx --no -- commitlint --edit ${1}
  ```
- 💡 **Học gì**: Conventional Commits (`feat:`, `fix:`, `chore:`…) cho phép tự generate CHANGELOG, semver bump. Format commit chuẩn = git history readable + CI tools (semantic-release) work.
- ✅ Verify: `git commit -m "bad message"` → reject. `git commit -m "feat: add foo"` → accept.

### 2.6 — Add npm scripts cho lint/format
- ⚙️ Edit `package.json` `"scripts"`:
  ```json
  "lint": "eslint . --ext .ts,.tsx",
  "lint:fix": "eslint . --ext .ts,.tsx --fix",
  "format": "prettier --write .",
  "format:check": "prettier --check .",
  "typecheck": "tsc --noEmit",
  "prepare": "husky"
  ```
- 💡 **Học gì**: `prepare` script chạy tự động sau `npm install` → husky hooks setup tự động cho dev mới clone repo. Tách `lint` và `lint:fix` cho phép CI chỉ check (không sửa), local thì sửa.
- ✅ Verify: `npm run typecheck && npm run lint && npm run format:check` pass.

---

## Bước 3: Thiết lập CodeceptJS với Playwright

### 3.1 — Cài CodeceptJS, Playwright, helpers
- ⚙️ `npm i -D codeceptjs@^3.6 playwright@^1.54 @codeceptjs/configure`.
- ⚙️ `npx playwright install chromium firefox webkit` (download browser binaries).
- 💡 **Học gì**: CodeceptJS là **test runner agnostic** — backend là Playwright (chọn vì hỗ trợ trace viewer, network mocking, cross-browser). `@codeceptjs/configure` cho preset profiles (parallel, headless…).
- ✅ Verify: `npx codeceptjs --version` + `ls ~/AppData/Local/ms-playwright` (Win) thấy folders chromium-*.

### 3.2 — Tạo codecept.conf.ts (config chính)
- ⚙️ Tạo `codecept.conf.ts` ở root:
  ```typescript
  import { setHeadlessWhen, setCommonPlugins } from '@codeceptjs/configure';

  setHeadlessWhen(process.env.HEADLESS === 'true');
  setCommonPlugins();

  export const config: CodeceptJS.MainConfig = {
    name: 'codecept-hybrid',
    tests: './tests/**/*.test.ts',
    output: './output',
    helpers: {
      Playwright: {
        url: process.env.BASE_URL || 'http://localhost:3000',
        show: process.env.HEADLESS !== 'true',
        browser: (process.env.BROWSER as 'chromium' | 'firefox' | 'webkit') || 'chromium',
        trace: true,
        video: true,
        keepVideoForPassedTests: false,
        keepTraceForPassedTests: false,
        windowSize: '1280x720',
      },
      REST: {
        endpoint: process.env.API_URL || 'http://localhost:3000/api',
        timeout: 30000,
        defaultHeaders: { 'Content-Type': 'application/json' },
      },
    },
    include: {
      I: './steps_file.ts',
    },
    bootstrap: null,
    teardown: null,
    mocha: { reporterOptions: { reportDir: './output/reports/html' } },
    plugins: {
      retryFailedStep: { enabled: true, retries: 2 },
      screenshotOnFail: { enabled: true },
      tryTo: { enabled: true },
      pauseOnFail: {},
      heal: { enabled: false },
    },
    require: ['ts-node/register', 'tsconfig-paths/register'],
  };
  ```
- ⚙️ `npm i -D tsconfig-paths` (cần để runtime resolve `@core/*`).
- 💡 **Học gì**:
  - `setHeadlessWhen` là helper tiện lợi từ `@codeceptjs/configure` — toggle headless theo env.
  - `trace: true` + `video: true` → mỗi test có Playwright trace (.zip) — debug như Chrome DevTools time-travel.
  - `retryFailedStep` retry **single step** chứ không phải cả test — bắt được flaky network/animation.
  - `require: ['ts-node/register', 'tsconfig-paths/register']` → CodeceptJS load TS + path aliases runtime.
- ✅ Verify: file tồn tại, `npm run typecheck` pass.

### 3.3 — Tạo steps_file.ts (Actor I)
- ⚙️ Tạo `steps_file.ts` ở root:
  ```typescript
  // Custom steps to extend the Actor `I`
  module.exports = function () {
    return actor({
      // custom shared methods, e.g.:
      // loginAsAdmin() { ... }
    });
  };
  ```
- 💡 **Học gì**: CodeceptJS có khái niệm **Actor** (`I`) — đại diện người dùng. `steps_file.ts` cho phép extend `I` với custom methods global. Khác với Step Objects: Actor methods nhỏ + reusable, Step Objects là business flows lớn.
- ✅ Verify: `npx codeceptjs def` chạy không lỗi (sinh `steps.d.ts` typings).

### 3.4 — Tạo dummy test smoke
- ⚙️ Tạo `tests/ui/smoke/example.test.ts`:
  ```typescript
  Feature('Sanity');

  Scenario('CodeceptJS boots', ({ I }) => {
    I.amOnPage('https://example.com');
    I.see('Example Domain');
  });
  ```
- ⚙️ Run `BASE_URL=https://example.com npx codeceptjs run --steps`.
- 💡 **Học gì**: CodeceptJS BDD-style API: `Feature`, `Scenario`, `I.amOnPage`, `I.see`. `--steps` flag in từng step ra console → debug dễ. Không có `await` vì CodeceptJS auto-await.
- ✅ Verify: test pass, output có `✓ CodeceptJS boots`.

### 3.5 — Add npm scripts cho test
- ⚙️ Edit `package.json` `"scripts"`:
  ```json
  "test": "codeceptjs run --steps",
  "test:headless": "HEADLESS=true codeceptjs run",
  "test:smoke": "codeceptjs run --grep @smoke",
  "test:ui": "codeceptjs run --grep @ui",
  "test:api": "codeceptjs run --grep @api",
  "test:debug": "codeceptjs run --debug --steps",
  "codecept:def": "codeceptjs def"
  ```
- 💡 **Học gì**: `--grep @tag` filter scenarios theo tag (Gherkin tag hoặc `Scenario(...).tag('@smoke')`). Cấu trúc tags: domain (`@ui`/`@api`) + criticality (`@smoke`/`@regression`). `def` regenerate type definitions cho `I` — chạy mỗi lần thêm method mới vào Actor.
- ✅ Verify: `npm run test:smoke` chạy được (ngay cả khi không match → exit 0).

---

## Bước 4: Config & Environment Management

### 4.1 — Cài dotenv + zod
- ⚙️ `npm i dotenv@^16 zod@^3`.
- 💡 **Học gì**: `dotenv` load `.env` files vào `process.env`. `zod` = runtime validation + TS types từ schema (DRY). Test framework cần env vars chuẩn xác (URL, credentials) → fail fast nếu thiếu, đừng để chạy 5 phút mới crash.
- ✅ Verify: `npm ls dotenv zod` thấy installed.

### 4.2 — Tạo .env.example
- ⚙️ Tạo `.env.example`:
  ```bash
  # Environment selector: dev | staging | prod
  ENV=dev
  
  # Test target URLs
  BASE_URL=http://localhost:3000
  API_URL=http://localhost:3000/api
  
  # Browser config
  BROWSER=chromium
  HEADLESS=false
  
  # Test credentials (override per env)
  ADMIN_EMAIL=admin@example.com
  ADMIN_PASSWORD=changeme
  
  # AI Providers (B11+)
  ANTHROPIC_API_KEY=
  COHERE_API_KEY=
  HF_TOKEN=
  AI_HEAL_ENABLED=false
  
  # Reporting
  ALLURE_RESULTS_DIR=./output/reports/allure
  ```
- 💡 **Học gì**: `.env.example` luôn commit → onboard dev mới biết cần env nào. Tên biến UPPER_SNAKE_CASE là convention. Empty AI keys → user phải fill (không default vì là secret).
- ✅ Verify: file tồn tại, đầy đủ.

### 4.3 — Tạo .env.dev, .env.staging, .env.prod
- ⚙️ Copy `.env.example` thành `.env.dev` (giữ values dev), `.env.staging`, `.env.prod` (set values phù hợp). Đảm bảo `.gitignore` đang block các file này (đã làm ở 1.4).
- 💡 **Học gì**: Tách env file theo môi trường thay vì bật/tắt block trong 1 file. Loader sẽ chọn file theo `process.env.ENV`. Production credentials chỉ ở `.env.prod` (không lên git, chỉ inject ở CI/CD vault).
- ✅ Verify: 3 files tồn tại, không tracked bởi git (`git status` không thấy).

### 4.4 — Tạo EnvResolver.ts
- ⚙️ Tạo `src/core/config/EnvResolver.ts`:
  ```typescript
  import * as fs from 'fs';
  import * as path from 'path';
  import * as dotenv from 'dotenv';

  export function loadEnv(): void {
    const env = process.env.ENV || 'dev';
    const candidates = [`.env.${env}`, '.env'];
    for (const file of candidates) {
      const fullPath = path.resolve(process.cwd(), file);
      if (fs.existsSync(fullPath)) {
        dotenv.config({ path: fullPath, override: false });
      }
    }
    if (!process.env.BASE_URL) {
      throw new Error(`Env file .env.${env} missing or BASE_URL not set`);
    }
  }
  ```
- 💡 **Học gì**: Loader chain: `.env.{ENV}` → `.env` (default fallback). `override: false` = giữ vars đã có trong shell (CI inject thắng file). Throw early khi thiếu var critical.
- ✅ Verify: import + call `loadEnv()` trong `codecept.conf.ts` ở đầu file.

### 4.5 — Tạo ConfigLoader.ts với Zod schema
- ⚙️ Tạo `src/core/config/ConfigLoader.ts`:
  ```typescript
  import { z } from 'zod';
  import { loadEnv } from './EnvResolver';

  loadEnv();

  const ConfigSchema = z.object({
    env: z.enum(['dev', 'staging', 'prod']).default('dev'),
    baseUrl: z.string().url(),
    apiUrl: z.string().url(),
    browser: z.enum(['chromium', 'firefox', 'webkit']).default('chromium'),
    headless: z.boolean().default(false),
    adminEmail: z.string().email().optional(),
    adminPassword: z.string().optional(),
    ai: z.object({
      anthropicKey: z.string().optional(),
      cohereKey: z.string().optional(),
      hfToken: z.string().optional(),
      healEnabled: z.boolean().default(false),
    }),
    allureResultsDir: z.string().default('./output/reports/allure'),
  });

  export type Config = z.infer<typeof ConfigSchema>;

  export const config: Config = Object.freeze(
    ConfigSchema.parse({
      env: process.env.ENV,
      baseUrl: process.env.BASE_URL,
      apiUrl: process.env.API_URL,
      browser: process.env.BROWSER,
      headless: process.env.HEADLESS === 'true',
      adminEmail: process.env.ADMIN_EMAIL,
      adminPassword: process.env.ADMIN_PASSWORD,
      ai: {
        anthropicKey: process.env.ANTHROPIC_API_KEY,
        cohereKey: process.env.COHERE_API_KEY,
        hfToken: process.env.HF_TOKEN,
        healEnabled: process.env.AI_HEAL_ENABLED === 'true',
      },
      allureResultsDir: process.env.ALLURE_RESULTS_DIR,
    }),
  );
  ```
- 💡 **Học gì**:
  - **`z.infer<>`** auto-derive TS type từ schema → 1 source of truth.
  - **`Object.freeze`** → config immutable runtime (tránh test sửa config gây side effect).
  - Zod fail = throw `ZodError` với JSON path → bug rõ ràng (`baseUrl: Required` thay vì `Cannot read property X of undefined`).
- ✅ Verify: `npx ts-node -e "import('./src/core/config/ConfigLoader').then(m => console.log(m.config))"` in ra config object.

### 4.6 — Wire config vào codecept.conf.ts
- ⚙️ Edit `codecept.conf.ts`:
  ```typescript
  import { config as appConfig } from './src/core/config/ConfigLoader';
  // ... rest
  helpers: {
    Playwright: {
      url: appConfig.baseUrl,
      browser: appConfig.browser,
      show: !appConfig.headless,
      // ...
    },
    REST: { endpoint: appConfig.apiUrl, /* ... */ },
  },
  ```
- 💡 **Học gì**: Single source of truth — codecept config đọc từ ConfigLoader (đã validated). Đổi env: chỉ cần `ENV=staging npm test`. Không hardcode URLs trong test code.
- ✅ Verify: `ENV=dev npm test` chạy với BASE_URL từ `.env.dev`.

---

# PHẦN 2: API LAYER (Bước 5)

Port RestClient từ framework cũ, fix context bug, wrap thành CodeceptJS Helper.

## Bước 5: RestClient (Playwright-style)

### 5.1 — Đọc và phân tích RestClient cũ
- ⚙️ Đọc các file: `../playwright/src/helpers/api/rest/RestClient.ts`, `RestRequest.ts`, `RestResponse.ts`, `RestRequestBuilder.ts`, `RestMethod.ts`, `CurlConverter.ts`.
- 💡 **Học gì**: Trước khi port, hiểu intent → mới fix bug và adapt được. Ghi chú điểm đặc biệt: builder pattern, error handling, response wrapper.
- ✅ Verify: Bạn (user) confirm hiểu cấu trúc — không cần verify automated.

### 5.2 — Tạo types & enums
- ⚙️ Tạo `src/api/rest/RestMethod.ts`:
  ```typescript
  export enum RestMethod {
    GET = 'GET', POST = 'POST', PUT = 'PUT',
    DELETE = 'DELETE', PATCH = 'PATCH', HEAD = 'HEAD',
  }
  ```
  Tạo `src/api/rest/types.ts`:
  ```typescript
  export type RestHeaders = Record<string, string>;
  export type RestQueryParams = Record<string, string | number | boolean>;
  export interface RestRequestConfig {
    timeout?: number;
    failOnStatusCode?: boolean;
  }
  ```
- 💡 **Học gì**: Tách enum + types ra file riêng → tránh circular import, dễ test. Enum dùng string values (không phải số) để debug log đẹp.
- ✅ Verify: `npm run typecheck` pass.

### 5.3 — Tạo RestRequest model
- ⚙️ Tạo `src/api/rest/RestRequest.ts`:
  ```typescript
  import { RestMethod } from './RestMethod';
  import { RestHeaders, RestQueryParams } from './types';

  export class RestRequest {
    constructor(
      public url: string,
      public method: RestMethod,
      public headers: RestHeaders = {},
      public params: RestQueryParams = {},
      public body?: unknown,
      public timeout: number = 30000,
    ) {}

    toCurl(): string {
      const parts = [`curl -X ${this.method}`];
      Object.entries(this.headers).forEach(([k, v]) => parts.push(`-H "${k}: ${v}"`));
      if (this.body) parts.push(`-d '${JSON.stringify(this.body)}'`);
      parts.push(`"${this.buildUrl()}"`);
      return parts.join(' ');
    }

    buildUrl(): string {
      const qs = Object.entries(this.params)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
        .join('&');
      return qs ? `${this.url}?${qs}` : this.url;
    }
  }
  ```
- 💡 **Học gì**: Model chứa data + helpers (`toCurl`, `buildUrl`). `toCurl()` cực kỳ hữu ích khi debug — copy-paste cURL ra terminal reproduce request. `unknown` thay vì `any` cho body → ép user assert type.
- ✅ Verify: typecheck pass.

### 5.4 — Tạo RestResponse model với assertion methods
- ⚙️ Tạo `src/api/rest/RestResponse.ts`:
  ```typescript
  export class RestResponse<T = unknown> {
    constructor(
      public status: number,
      public headers: Record<string, string>,
      public body: T,
      public durationMs: number,
    ) {}

    expectStatus(expected: number): this {
      if (this.status !== expected) {
        throw new Error(`Expected status ${expected}, got ${this.status}. Body: ${JSON.stringify(this.body).slice(0, 500)}`);
      }
      return this;
    }

    expectJsonPath<V>(path: string, expected: V): this {
      const actual = path.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], this.body);
      if (actual !== expected) {
        throw new Error(`At ${path}: expected ${expected}, got ${actual}`);
      }
      return this;
    }

    json<U = T>(): U { return this.body as unknown as U; }
  }
  ```
- 💡 **Học gì**: Fluent assertions chained: `res.expectStatus(200).expectJsonPath('user.id', 42)`. Generic `<T>` cho type-safe response body. Error message include body snippet → debug nhanh.
- ✅ Verify: typecheck pass.

### 5.5 — Tạo RestClient với context bug fix
- ⚙️ Tạo `src/api/rest/RestClient.ts`:
  ```typescript
  import { request, APIRequestContext } from 'playwright';
  import { RestRequest } from './RestRequest';
  import { RestResponse } from './RestResponse';
  import { RestMethod } from './RestMethod';

  export class RestClient {
    private context?: APIRequestContext;

    async init(baseURL?: string): Promise<void> {
      this.context = await request.newContext({ baseURL, ignoreHTTPSErrors: true });
    }

    async dispose(): Promise<void> {
      await this.context?.dispose();
      this.context = undefined;
    }

    async send<T = unknown>(req: RestRequest): Promise<RestResponse<T>> {
      if (!this.context) throw new Error('RestClient not initialized. Call init() first.');
      const start = Date.now();
      const response = await this.context.fetch(req.buildUrl(), {
        method: req.method,
        headers: req.headers,
        data: req.body as Record<string, unknown> | undefined,
        timeout: req.timeout,
      });
      const durationMs = Date.now() - start;
      const headers = response.headers();
      let body: T;
      try { body = (await response.json()) as T; }
      catch { body = (await response.text()) as unknown as T; }
      return new RestResponse<T>(response.status(), headers, body, durationMs);
    }
  }
  ```
- 💡 **Học gì**:
  - **Context bug fix**: framework cũ `new RestClient()` không tạo context → `send()` crash. Fix: explicit `await client.init()` trước khi dùng (gọi trong CodeceptJS hook).
  - `request.newContext` cùng cookies với browser context (nếu chia sẻ) → end-to-end test login UI rồi call API authenticated không cần re-auth.
  - `try/catch` JSON parse → handle non-JSON response (text, HTML error page).
- ✅ Verify: typecheck pass.

### 5.6 — Tạo RestRequestBuilder (fluent API)
- ⚙️ Tạo `src/api/rest/RestRequestBuilder.ts`:
  ```typescript
  import { RestMethod } from './RestMethod';
  import { RestRequest } from './RestRequest';
  import { RestHeaders, RestQueryParams } from './types';

  export class RestRequestBuilder {
    private _url = '';
    private _method = RestMethod.GET;
    private _headers: RestHeaders = {};
    private _params: RestQueryParams = {};
    private _body?: unknown;
    private _timeout = 30000;

    url(u: string): this { this._url = u; return this; }
    method(m: RestMethod): this { this._method = m; return this; }
    header(k: string, v: string): this { this._headers[k] = v; return this; }
    headers(h: RestHeaders): this { Object.assign(this._headers, h); return this; }
    query(k: string, v: string | number | boolean): this { this._params[k] = v; return this; }
    body(b: unknown): this { this._body = b; return this; }
    timeout(ms: number): this { this._timeout = ms; return this; }

    build(): RestRequest {
      if (!this._url) throw new Error('URL is required');
      return new RestRequest(this._url, this._method, this._headers, this._params, this._body, this._timeout);
    }
  }
  ```
- 💡 **Học gì**: **Builder pattern** — chain calls cho readable test code: `new RestRequestBuilder().url('/users').method(POST).body({...}).build()`. Mỗi setter return `this` cho chain. Validate trong `build()` — fail fast khi config sai.
- ✅ Verify: typecheck pass.

### 5.7 — Tạo CurlConverter
- ⚙️ Tạo `src/api/rest/CurlConverter.ts`:
  ```typescript
  import { RestMethod } from './RestMethod';
  import { RestRequest } from './RestRequest';

  export class CurlConverter {
    static fromCurl(curl: string): RestRequest {
      const urlMatch = curl.match(/curl[^']*'([^']+)'|curl[^"]*"([^"]+)"|curl\s+(\S+)/);
      const url = urlMatch?.[1] || urlMatch?.[2] || urlMatch?.[3] || '';
      const methodMatch = curl.match(/-X\s+(\w+)/);
      const method = (methodMatch?.[1]?.toUpperCase() as RestMethod) || RestMethod.GET;
      const headers: Record<string, string> = {};
      const headerRegex = /-H\s+['"]([^:]+):\s*([^'"]+)['"]/g;
      let m: RegExpExecArray | null;
      while ((m = headerRegex.exec(curl)) !== null) headers[m[1]] = m[2];
      const bodyMatch = curl.match(/-d\s+['"](.+?)['"](?=\s|$)/s);
      const body = bodyMatch ? JSON.parse(bodyMatch[1]) : undefined;
      return new RestRequest(url, method, headers, {}, body);
    }
  }
  ```
- 💡 **Học gì**: AI agents (B12) sẽ feed cURL string → convert → RestRequest. Cũng tiện cho QA: copy cURL từ DevTools Network tab → test ngay. Regex đơn giản đủ cho 80% case; cURL phức tạp (multiline, escape) cần parser thực thụ — để sau.
- ✅ Verify: typecheck pass.

### 5.8 — Tạo CodeceptJS RestHelper wrapper
- ⚙️ Tạo `src/core/helpers/RestHelper.ts`:
  ```typescript
  import { Helper } from 'codeceptjs';
  import { RestClient } from '@api/rest/RestClient';
  import { RestRequestBuilder } from '@api/rest/RestRequestBuilder';
  import { RestResponse } from '@api/rest/RestResponse';
  import { config as appConfig } from '@core/config/ConfigLoader';

  class RestHelper extends Helper {
    private client = new RestClient();

    async _before(): Promise<void> {
      await this.client.init(appConfig.apiUrl);
    }

    async _after(): Promise<void> {
      await this.client.dispose();
    }

    api(): RestRequestBuilder {
      return new RestRequestBuilder();
    }

    async sendApiRequest<T = unknown>(builder: RestRequestBuilder): Promise<RestResponse<T>> {
      return this.client.send<T>(builder.build());
    }
  }

  export = RestHelper;
  ```
- ⚙️ Edit `codecept.conf.ts` add helper:
  ```typescript
  helpers: {
    // ... Playwright, REST ...
    RestHelper: { require: './src/core/helpers/RestHelper.ts' },
  }
  ```
- 💡 **Học gì**:
  - CodeceptJS Helper lifecycle: `_before`/`_after` (per-test), `_beforeSuite`/`_afterSuite` (per-file). Init context per-test → isolated, không leak cookies giữa tests.
  - `export = RestHelper` (CommonJS) — CodeceptJS load helper kiểu này (chứ không phải ES default).
  - Methods của Helper auto-merge vào Actor `I` → `I.api().url(...).build()` works.
- ✅ Verify: `npm run codecept:def` regenerate `steps.d.ts`, thấy `I.api()` methods.

### 5.9 — Viết E2E API test mẫu
- ⚙️ Tạo `tests/api/smoke/health.test.ts`:
  ```typescript
  import { RestMethod } from '@api/rest/RestMethod';

  Feature('API Smoke').tag('@api').tag('@smoke');

  Scenario('GET /todos/1 returns valid todo', async ({ I }) => {
    const res = await I.sendApiRequest(
      I.api().url('https://jsonplaceholder.typicode.com/todos/1').method(RestMethod.GET),
    );
    res.expectStatus(200).expectJsonPath('id', 1);
  });
  ```
- ⚙️ Run `npm run test:api`.
- 💡 **Học gì**: Test gọi public API `jsonplaceholder` để verify mà không cần backend riêng. Tag `@api @smoke` cho selective run. Fluent: `I.api().url().method() + sendApiRequest`.
- ✅ Verify: test pass, output có `✓`.

---

# PHẦN 3: HYBRID UI (Bước 6–7)

Page Fragments + Step Objects.

## Bước 6: Page Fragments

### 6.1 — Tạo BaseFragment abstract class
- ⚙️ Tạo `src/ui/fragments/base/BaseFragment.ts`:
  ```typescript
  export abstract class BaseFragment {
    constructor(protected readonly root: string) {}
    protected get I(): CodeceptJS.I { return inject().I; }
    abstract waitToLoad(): Promise<void>;
  }
  ```
- 💡 **Học gì**: **Fragment** = component tự đóng gói với `root` selector — mọi action scope trong root (qua `within(root, ...)`). `inject()` lấy Actor `I` runtime — không cần truyền qua constructor. Abstract `waitToLoad()` ép subclass implement.
- ✅ Verify: typecheck pass.

### 6.2 — Tạo HeaderFragment (common)
- ⚙️ Tạo `src/ui/fragments/common/HeaderFragment.ts`:
  ```typescript
  import { BaseFragment } from '../base/BaseFragment';

  export class HeaderFragment extends BaseFragment {
    constructor() { super('header[role="banner"]'); }
    selectors = {
      logo: '[data-testid="logo"]',
      userMenu: '[data-testid="user-menu"]',
      logoutBtn: '[data-testid="logout"]',
    };
    async waitToLoad(): Promise<void> {
      this.I.waitForElement(this.root, 10);
    }
    async clickUserMenu(): Promise<void> {
      within(this.root, () => this.I.click(this.selectors.userMenu));
    }
    async logout(): Promise<void> {
      await this.clickUserMenu();
      this.I.click(this.selectors.logoutBtn);
    }
  }
  ```
- 💡 **Học gì**: Mỗi fragment đóng gói **selectors riêng** (không leak ra page). Methods là **business actions** (`logout()`) chứ không phải `clickByXpath`. Re-use: bất kỳ page nào có header đều dùng `new HeaderFragment()`.
- ✅ Verify: typecheck pass.

### 6.3 — Tạo ModalFragment, FormFragment, NavbarFragment
- ⚙️ Tạo `src/ui/fragments/common/ModalFragment.ts`:
  ```typescript
  import { BaseFragment } from '../base/BaseFragment';

  export class ModalFragment extends BaseFragment {
    constructor(rootSelector = '[role="dialog"]') { super(rootSelector); }
    selectors = { title: '.modal-title', confirmBtn: '[data-testid="confirm"]', cancelBtn: '[data-testid="cancel"]', closeIcon: '.modal-close' };
    async waitToLoad(): Promise<void> { this.I.waitForElement(this.root, 5); }
    async confirm(): Promise<void> { within(this.root, () => this.I.click(this.selectors.confirmBtn)); }
    async cancel(): Promise<void> { within(this.root, () => this.I.click(this.selectors.cancelBtn)); }
    async getTitle(): Promise<string> { return await this.I.grabTextFrom(`${this.root} ${this.selectors.title}`); }
  }
  ```
- ⚙️ Tạo `FormFragment.ts` (fillField, submit, getValidationError) và `NavbarFragment.ts` tương tự (tự suy ra theo pattern).
- 💡 **Học gì**: Param hoá `rootSelector` cho phép reuse cùng class với nhiều modal khác nhau. Generic components giảm code duplication 70% — đây là điểm mạnh chính của Fragment vs POM truyền thống.
- ✅ Verify: 3 files tồn tại, typecheck pass.

### 6.4 — Tạo LoginFormFragment (feature-specific)
- ⚙️ Tạo `src/ui/fragments/features/LoginFormFragment.ts`:
  ```typescript
  import { BaseFragment } from '../base/BaseFragment';

  export class LoginFormFragment extends BaseFragment {
    constructor() { super('[data-testid="login-form"]'); }
    selectors = { email: 'input[name="email"]', password: 'input[name="password"]', submit: 'button[type="submit"]', errorMsg: '.error-message' };
    async waitToLoad(): Promise<void> { this.I.waitForElement(this.root, 10); }
    async fillCredentials(email: string, password: string): Promise<void> {
      within(this.root, () => {
        this.I.fillField(this.selectors.email, email);
        this.I.fillField(this.selectors.password, password);
      });
    }
    async submit(): Promise<void> { within(this.root, () => this.I.click(this.selectors.submit)); }
    async getError(): Promise<string> { return this.I.grabTextFrom(`${this.root} ${this.selectors.errorMsg}`); }
  }
  ```
- 💡 **Học gì**: Feature-specific Fragments (vs common) chứa logic của 1 màn cụ thể. Tách `fillCredentials` + `submit` thay vì 1 method `login()` → composable, test được bước riêng (vd: validation error khi không submit).
- ✅ Verify: typecheck pass.

### 6.5 — Inject fragments vào codecept.conf.ts
- ⚙️ Edit `codecept.conf.ts` `include`:
  ```typescript
  include: {
    I: './steps_file.ts',
    headerFragment: './src/ui/fragments/common/HeaderFragment.ts',
    modalFragment: './src/ui/fragments/common/ModalFragment.ts',
    loginForm: './src/ui/fragments/features/LoginFormFragment.ts',
  }
  ```
- 💡 **Học gì**: CodeceptJS `include` map name → file → auto-inject vào test scope qua `inject()`. Trong test: `const { I, loginForm } = inject(); loginForm.fillCredentials(...)`. Không cần `import` từng file.
- ✅ Verify: `npm run codecept:def` regenerate types — `loginForm` xuất hiện trong autocomplete.

---

## Bước 7: Step Objects (Business Workflows)

### 7.1 — Tạo BasePage
- ⚙️ Tạo `src/ui/pages/base/BasePage.ts`:
  ```typescript
  export abstract class BasePage {
    abstract path: string;
    protected get I(): CodeceptJS.I { return inject().I; }
    async open(): Promise<void> { this.I.amOnPage(this.path); await this.waitForLoad(); }
    abstract waitForLoad(): Promise<void>;
  }
  ```
- 💡 **Học gì**: Page Object chỉ chứa **path + composition** Fragments — KHÔNG chứa selectors low-level. Đây là khác biệt lớn với POM truyền thống (chứa hết selectors).
- ✅ Verify: typecheck pass.

### 7.2 — Tạo LoginPage compose Fragments
- ⚙️ Tạo `src/ui/pages/LoginPage.ts`:
  ```typescript
  import { BasePage } from './base/BasePage';
  import { LoginFormFragment } from '../fragments/features/LoginFormFragment';

  export class LoginPage extends BasePage {
    path = '/login';
    loginForm = new LoginFormFragment();
    async waitForLoad(): Promise<void> { await this.loginForm.waitToLoad(); }
  }
  ```
- 💡 **Học gì**: Page = composition of fragments (1 page có thể có Header + LoginForm + Footer). Page Object là façade — orchestrate fragments cho 1 màn cụ thể.
- ✅ Verify: typecheck pass.

### 7.3 — Tạo DashboardPage
- ⚙️ Tạo `src/ui/pages/DashboardPage.ts`:
  ```typescript
  import { BasePage } from './base/BasePage';
  import { HeaderFragment } from '../fragments/common/HeaderFragment';

  export class DashboardPage extends BasePage {
    path = '/dashboard';
    header = new HeaderFragment();
    selectors = { welcomeBanner: '[data-testid="welcome"]' };
    async waitForLoad(): Promise<void> { this.I.waitForElement(this.selectors.welcomeBanner, 10); }
    async getWelcomeText(): Promise<string> { return this.I.grabTextFrom(this.selectors.welcomeBanner); }
  }
  ```
- 💡 **Học gì**: Page tự chứa selectors **chỉ riêng cho page** (welcomeBanner). Cái nào shared → đẩy vào fragment.
- ✅ Verify: typecheck pass.

### 7.4 — Tạo Step Object: AuthSteps
- ⚙️ Tạo `src/ui/steps/AuthSteps.ts`:
  ```typescript
  import { LoginPage } from '../pages/LoginPage';
  import { DashboardPage } from '../pages/DashboardPage';
  import { config } from '@core/config/ConfigLoader';

  export class AuthSteps {
    private loginPage = new LoginPage();
    private dashboardPage = new DashboardPage();
    protected get I(): CodeceptJS.I { return inject().I; }

    async loginAs(role: 'admin'): Promise<void> {
      const creds = role === 'admin'
        ? { email: config.adminEmail!, password: config.adminPassword! }
        : { email: '', password: '' };
      await this.loginPage.open();
      await this.loginPage.loginForm.fillCredentials(creds.email, creds.password);
      await this.loginPage.loginForm.submit();
      await this.dashboardPage.waitForLoad();
    }

    async logout(): Promise<void> { await this.dashboardPage.header.logout(); }
  }
  ```
- 💡 **Học gì**: Step Object là **business workflow** abstraction. Test code chỉ thấy `authSteps.loginAs('admin')` — không thấy field, click, URL. Khi UI đổi (đổi selector login button), chỉ sửa Fragment — Step Object không đổi → tests không đổi.
- ✅ Verify: typecheck pass.

### 7.5 — Inject pages + steps vào codecept.conf.ts
- ⚙️ Edit `codecept.conf.ts` `include`:
  ```typescript
  include: {
    I: './steps_file.ts',
    // fragments
    loginForm: './src/ui/fragments/features/LoginFormFragment.ts',
    headerFragment: './src/ui/fragments/common/HeaderFragment.ts',
    modalFragment: './src/ui/fragments/common/ModalFragment.ts',
    // pages
    loginPage: './src/ui/pages/LoginPage.ts',
    dashboardPage: './src/ui/pages/DashboardPage.ts',
    // step objects
    authSteps: './src/ui/steps/AuthSteps.ts',
  }
  ```
- 💡 **Học gì**: CodeceptJS DI: tất cả dependencies inject qua config → test code clean, không có `new XxxClass()` lung tung. Naming convention: camelCase, đúng tên muốn dùng trong `inject()`.
- ✅ Verify: `npm run codecept:def` thấy autocomplete.

### 7.6 — E2E test login dùng Step Object
- ⚙️ Tạo `tests/ui/smoke/login.test.ts`:
  ```typescript
  Feature('Authentication').tag('@ui').tag('@smoke');

  Scenario('Admin can log in', async ({ authSteps, dashboardPage, I }) => {
    await authSteps.loginAs('admin');
    const welcome = await dashboardPage.getWelcomeText();
    I.assertContain(welcome, 'Welcome');
  });

  Scenario('Admin can log out', async ({ authSteps, I }) => {
    await authSteps.loginAs('admin');
    await authSteps.logout();
    I.seeInCurrentUrl('/login');
  });
  ```
- 💡 **Học gì**: Test cao-cấp đọc như **kịch bản nghiệp vụ** — không thấy click, fill, URL. 5 năm sau test này vẫn đọc được. Đây là mục tiêu cuối của Hybrid pattern.
- ✅ Verify: cần app thật để chạy — skip nếu chưa có target app, hoặc point `BASE_URL` tới demo app.

---

# PHẦN 4: QUALITY LAYERS (Bước 8–10)

## Bước 8: Visual Testing

### 8.1 — Cài pixelmatch + pngjs
- ⚙️ `npm i pixelmatch@^6 pngjs@^7`. `npm i -D @types/pixelmatch @types/pngjs`.
- 💡 **Học gì**: `pixelmatch` (Mapbox) là pixel diff lib gọn, fast. `pngjs` đọc/ghi PNG buffer. Alternatives: `resemblejs` (browser-friendly, có analytics nhưng nặng). Chọn pixelmatch cho speed.
- ✅ Verify: installed.

### 8.2 — Tạo VisualComparator (port + fix typo)
- ⚙️ Đọc `../playwright/src/sevices/visual/ImageComparisonSevice.ts`. Tạo `src/visual/VisualComparator.ts`:
  ```typescript
  import * as fs from 'fs';
  import * as path from 'path';
  import { PNG } from 'pngjs';
  import pixelmatch from 'pixelmatch';

  export interface VisualResult {
    match: boolean;
    diffPixels: number;
    diffRatio: number;
    diffImagePath?: string;
  }

  export class VisualComparator {
    constructor(
      private baselinesDir = path.resolve('src/visual/baselines'),
      private diffsDir = path.resolve('output/visual-diffs'),
    ) {
      fs.mkdirSync(this.baselinesDir, { recursive: true });
      fs.mkdirSync(this.diffsDir, { recursive: true });
    }

    compare(name: string, actualBuffer: Buffer, threshold = 0.01): VisualResult {
      const baselinePath = path.join(this.baselinesDir, `${name}.png`);
      if (!fs.existsSync(baselinePath)) {
        fs.writeFileSync(baselinePath, actualBuffer);
        return { match: true, diffPixels: 0, diffRatio: 0 };
      }
      const baseline = PNG.sync.read(fs.readFileSync(baselinePath));
      const actual = PNG.sync.read(actualBuffer);
      const { width, height } = baseline;
      const diff = new PNG({ width, height });
      const diffPixels = pixelmatch(baseline.data, actual.data, diff.data, width, height, { threshold });
      const total = width * height;
      const diffRatio = diffPixels / total;
      const match = diffRatio < threshold;
      let diffImagePath: string | undefined;
      if (!match) {
        diffImagePath = path.join(this.diffsDir, `${name}-diff.png`);
        fs.writeFileSync(diffImagePath, PNG.sync.write(diff));
      }
      return { match, diffPixels, diffRatio, diffImagePath };
    }
  }
  ```
- 💡 **Học gì**: Lần đầu chạy → save baseline. Lần 2 → compare. `threshold` là tỷ lệ pixel khác (0.01 = 1%) — tránh false positive do anti-aliasing/font rendering. Diff image highlight pixels khác → debug visual.
- ✅ Verify: typecheck pass.

### 8.3 — Tạo CodeceptJS VisualHelper
- ⚙️ Tạo `src/core/helpers/VisualHelper.ts`:
  ```typescript
  import { Helper } from 'codeceptjs';
  import { VisualComparator, VisualResult } from '@visual/VisualComparator';

  class VisualHelper extends Helper {
    private comparator = new VisualComparator();

    async checkVisualMatch(name: string, threshold = 0.01): Promise<VisualResult> {
      const playwright = (this.helpers as Record<string, unknown>)['Playwright'] as { page: { screenshot: () => Promise<Buffer> } };
      const buffer = await playwright.page.screenshot();
      const result = this.comparator.compare(name, buffer, threshold);
      if (!result.match) {
        throw new Error(`Visual mismatch: ${name} (${result.diffPixels} pixels, ${(result.diffRatio * 100).toFixed(2)}%). Diff: ${result.diffImagePath}`);
      }
      return result;
    }
  }
  export = VisualHelper;
  ```
- ⚙️ Add vào `codecept.conf.ts`: `helpers: { ..., VisualHelper: { require: './src/core/helpers/VisualHelper.ts' } }`.
- 💡 **Học gì**: Helper truy cập `this.helpers['Playwright']` để lấy underlying Playwright page → screenshot. Pattern này cho phép 1 helper compose helper khác (Playwright + Visual).
- ✅ Verify: `npm run codecept:def` thấy `I.checkVisualMatch`.

### 8.4 — CLI script update baselines
- ⚙️ Tạo `scripts/update-baselines.ts`:
  ```typescript
  import * as fs from 'fs';
  import * as path from 'path';
  const baselinesDir = path.resolve('src/visual/baselines');
  const diffsDir = path.resolve('output/visual-diffs');
  if (!fs.existsSync(diffsDir)) { console.log('No diffs to update.'); process.exit(0); }
  for (const file of fs.readdirSync(diffsDir)) {
    if (!file.endsWith('-diff.png')) continue;
    const name = file.replace('-diff.png', '');
    const newBaseline = path.join(diffsDir, file.replace('-diff', ''));
    if (fs.existsSync(newBaseline)) {
      fs.copyFileSync(newBaseline, path.join(baselinesDir, `${name}.png`));
      console.log(`✓ Updated baseline: ${name}`);
    }
  }
  ```
- ⚙️ Add `package.json` script: `"visual:update": "ts-node scripts/update-baselines.ts"`.
- 💡 **Học gì**: Visual tests fail = không phải lúc nào cũng bug — có khi UI đổi intentional. CLI cập nhật baseline = 1 command thay vì xóa file thủ công. Workflow: chạy test → fail → review diff → `npm run visual:update` nếu OK.
- ✅ Verify: script tồn tại, npm script work.

### 8.5 — Visual test mẫu
- ⚙️ Tạo `tests/visual/homepage.test.ts`:
  ```typescript
  Feature('Visual Regression').tag('@visual');
  Scenario('Homepage matches baseline', async ({ I }) => {
    I.amOnPage('/');
    I.wait(2);
    await I.checkVisualMatch('homepage', 0.02);
  });
  ```
- 💡 **Học gì**: `wait(2)` cho page load + animations settle. Threshold 2% cho text rendering variance.
- ✅ Verify: chạy 1 lần → tạo baseline. Chạy lần 2 → pass (no diff).

---

## Bước 9: Logging & Reporting

### 9.1 — Cài Winston + tạo Logger
- ⚙️ `npm i winston@^3`. Đọc `../playwright/src/helpers/logger/Log.ts`. Tạo `src/core/logger/Logger.ts`:
  ```typescript
  import * as winston from 'winston';
  import * as path from 'path';

  const logsDir = path.resolve('output/logs');
  export const Logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.errors({ stack: true }),
      winston.format.json(),
    ),
    transports: [
      new winston.transports.Console({ format: winston.format.combine(winston.format.colorize(), winston.format.simple()) }),
      new winston.transports.File({ filename: path.join(logsDir, 'execution.log') }),
      new winston.transports.File({ filename: path.join(logsDir, 'errors.log'), level: 'error' }),
    ],
  });
  ```
- 💡 **Học gì**: Console = human-readable colored. File = JSON cho machine parsing (grep, ELK). Tách `errors.log` để alerting nhanh.
- ✅ Verify: `Logger.info('test')` ghi ra `output/logs/execution.log`.

### 9.2 — Cài Allure reporter
- ⚙️ `npm i -D @codeceptjs/allure-helper allure-commandline`.
- ⚙️ Edit `codecept.conf.ts` plugins:
  ```typescript
  plugins: {
    // ...
    allure: { enabled: true, outputDir: './output/reports/allure' },
  }
  ```
- 💡 **Học gì**: Allure tách raw results (JSON) khỏi report (HTML) → phù hợp CI: results upload, report gen ở dashboard. `allure-commandline` là tool gen HTML từ results.
- ✅ Verify: chạy 1 test → folder `output/reports/allure/` có file `*-result.json`.

### 9.3 — Add npm scripts cho report
- ⚙️ `package.json` scripts:
  ```json
  "report:allure": "allure generate ./output/reports/allure -o ./output/reports/allure-html --clean && allure open ./output/reports/allure-html",
  "report:clean": "rimraf output"
  ```
  (Cài `npm i -D rimraf`.)
- 💡 **Học gì**: `--clean` xóa report cũ trước khi gen. `rimraf` cross-platform `rm -rf` (Windows không có).
- ✅ Verify: `npm run report:allure` mở browser với báo cáo.

### 9.4 — Hook để attach context vào logs
- ⚙️ Tạo `src/hooks/scenarioHooks.ts`:
  ```typescript
  import { event } from 'codeceptjs';
  import { Logger } from '@core/logger/Logger';

  event.dispatcher.on(event.test.before, (test) => {
    Logger.info('test.start', { test: test.title, suite: test.parent?.title });
  });
  event.dispatcher.on(event.test.failed, (test, err) => {
    Logger.error('test.failed', { test: test.title, error: err.message, stack: err.stack });
  });
  event.dispatcher.on(event.test.passed, (test) => {
    Logger.info('test.passed', { test: test.title, duration: test.duration });
  });
  ```
- ⚙️ Edit `codecept.conf.ts`: `bootstrap: './src/hooks/scenarioHooks.ts'` (CommonJS export hoặc convert).
- 💡 **Học gì**: CodeceptJS events: `test.before`, `test.passed`, `test.failed`, `suite.before`, `step.passed`… Hook chỉ là listener. Log structured (JSON) cho phép sau này gửi lên Datadog/ELK dễ.
- ✅ Verify: chạy test fail → log có entry `test.failed`.

---

## Bước 10: Test Data Management

### 10.1 — Cài faker
- ⚙️ `npm i -D @faker-js/faker@^8`.
- 💡 **Học gì**: `@faker-js/faker` (community fork sau khi original maintainer rút) — gen data realistic theo locale (en, vi, es…). Locale-aware: `faker.location.streetAddress({ locale: 'vi' })` ra địa chỉ VN.
- ✅ Verify: installed.

### 10.2 — Tạo fixtures static
- ⚙️ Tạo `src/fixtures/users.json`:
  ```json
  {
    "admin": { "email": "admin@example.com", "password": "Admin@123", "role": "admin" },
    "customer": { "email": "user@example.com", "password": "User@123", "role": "customer" }
  }
  ```
- 💡 **Học gì**: Fixtures static = data deterministic (admin user luôn cùng email). Fakers = random. Mix cả hai: critical accounts dùng fixture, junk data dùng faker.
- ✅ Verify: file tồn tại.

### 10.3 — Tạo UserFactory với Faker
- ⚙️ Tạo `src/fixtures/factories/UserFactory.ts`:
  ```typescript
  import { faker } from '@faker-js/faker';

  export interface User { email: string; password: string; firstName: string; lastName: string; phone: string; }

  export const UserFactory = {
    create(overrides: Partial<User> = {}): User {
      return {
        email: faker.internet.email().toLowerCase(),
        password: faker.internet.password({ length: 12, prefix: 'Aa1!' }),
        firstName: faker.person.firstName(),
        lastName: faker.person.lastName(),
        phone: faker.phone.number(),
        ...overrides,
      };
    },
    createMany(n: number, overrides?: Partial<User>): User[] {
      return Array.from({ length: n }, () => this.create(overrides));
    },
  };
  ```
- 💡 **Học gì**: **Factory pattern** > raw faker. `create({ email: 'fixed@x.com' })` cho phép pin field cụ thể, random rest. Password prefix `Aa1!` đảm bảo pass complexity rules. `createMany` for bulk seeds.
- ✅ Verify: `npx ts-node -e "console.log(require('./src/fixtures/factories/UserFactory').UserFactory.create())"`.

### 10.4 — Tạo SchemaDrivenFaker
- ⚙️ Tạo `src/ai/data/SchemaDrivenFaker.ts`:
  ```typescript
  import { z } from 'zod';
  import { faker } from '@faker-js/faker';

  export function fakeFromSchema<T>(schema: z.ZodSchema<T>): T {
    if (schema instanceof z.ZodObject) {
      const shape = (schema as z.AnyZodObject).shape;
      const out: Record<string, unknown> = {};
      for (const [key, fieldSchema] of Object.entries(shape)) {
        out[key] = inferFakerForKey(key, fieldSchema as z.ZodSchema);
      }
      return schema.parse(out);
    }
    throw new Error('Only ZodObject supported for now');
  }

  function inferFakerForKey(key: string, schema: z.ZodSchema): unknown {
    const k = key.toLowerCase();
    if (k.includes('email')) return faker.internet.email();
    if (k.includes('phone')) return faker.phone.number();
    if (k.includes('name')) return faker.person.fullName();
    if (k.includes('address')) return faker.location.streetAddress();
    if (schema instanceof z.ZodNumber) return faker.number.int({ min: 1, max: 1000 });
    if (schema instanceof z.ZodBoolean) return faker.datatype.boolean();
    return faker.lorem.word();
  }
  ```
- 💡 **Học gì**: Schema-driven = single source of truth (Zod schema). Tự suy faker từ tên field (`email` → faker.internet.email). Sau B11 sẽ thay rule-based bằng AI để smart hơn.
- ✅ Verify: typecheck pass.

---

# PHẦN 5: AI FEATURES (Bước 11–12)

## Bước 11: AI Self-Healing & LLM Gateway production-grade

### 11.1 — Cài AI SDKs + tooling
- 🎯 Cài deps cho 4 providers + zod + sqlite + mustache.
- ⚙️ `npm i @anthropic-ai/sdk@^0.30 cohere-ai@^7 @huggingface/inference@^3 axios@^1 zod@^3 better-sqlite3@^11 mustache@^4 cheerio@^1`. `npm i -D @types/better-sqlite3 @types/mustache`.
- 💡 **Học gì**: Phân biệt SDK chính chủ (Anthropic, Cohere, HF) vs http call (G4F không có SDK — axios). `better-sqlite3` synchronous → đơn giản hơn `sqlite3` async cho cache repo. Mustache cho prompt templating (đơn giản, không có logic — đúng tinh thần prompt). Cheerio cài luôn ở bước này vì DomSanitizer (11.13) dùng.
- ✅ Verify: `npm ls @anthropic-ai/sdk` thấy version.

### 11.2 — Định nghĩa LLMProvider interface + types
- 🎯 Contract chuẩn cho mọi provider, có cost/cache metadata.
- ⚙️ Tạo `src/ai/providers/types.ts`:
  ```typescript
  export type Role = 'system' | 'user' | 'assistant';
  export interface ChatMessage { role: Role; content: string; cache?: boolean; }
  export interface ChatOptions { maxTokens?: number; temperature?: number; stop?: string[]; jsonSchema?: object; }
  export interface ChatResult {
    text: string;
    usage: { inputTokens: number; outputTokens: number; cachedTokens?: number };
    provider: string; model: string; latencyMs: number;
  }
  export interface LLMProvider {
    name: string;
    isConfigured(): boolean;
    chat(messages: ChatMessage[], opts?: ChatOptions): Promise<ChatResult>;
    estimateCostUsd(usage: ChatResult['usage']): number;
  }
  export type TaskProfile = 'heal' | 'codegen' | 'data-gen' | 'review';
  ```
- 💡 **Học gì**: `ChatMessage.cache` flag để mark message nào cần Anthropic cache (system prompt + few-shot). `ChatResult.usage.cachedTokens` để biết bao nhiêu token đã hit cache (giảm 90% giá). `estimateCostUsd` ở provider level vì mỗi model giá khác nhau.
- ✅ Verify: typecheck pass.

### 11.3 — BaseProvider abstract (retry + error normalization)
- 🎯 DRY logic dùng chung: retry exponential backoff + jitter, classify lỗi (rate-limit/timeout/auth/transient/fatal), enforce timeout.
- ⚙️ Tạo `src/ai/providers/BaseProvider.ts` với:
  - `protected async withRetry<T>(fn: () => Promise<T>, opts: { maxRetries?: number; timeoutMs?: number }): Promise<T>` — exp backoff 1s/2s/4s + jitter ±300ms, abort sau 30s timeout, không retry lỗi 4xx auth.
  - `protected classifyError(e: unknown): 'rate_limit' | 'timeout' | 'auth' | 'transient' | 'fatal'` — match HTTP status, error code.
  - `abstract chat()` — concrete provider implement.
- 💡 **Học gì**: Jitter để tránh thundering herd khi nhiều worker cùng retry. Rate-limit (HTTP 429) cần wait theo `Retry-After` header (nếu provider trả về), không phải exp backoff thông thường. Auth lỗi (401) là fatal — retry vô nghĩa.
- ✅ Verify: viết unit test fake một call fail 2 lần rồi pass → tổng wait ≈ 3-5s.

### 11.4 — AnthropicProvider + prompt caching
- 🎯 Provider chính, support 2 model + prompt cache (ephemeral).
- ⚙️ Tạo `src/ai/providers/AnthropicProvider.ts` extends `BaseProvider`:
  - Constructor nhận model name (default `claude-haiku-4-5-20251001`, có thể override `claude-sonnet-4-6`).
  - Chuyển message với `cache: true` → block `{type: 'text', text, cache_control: {type: 'ephemeral'}}` (TTL 5 phút).
  - Parse response `usage.cache_read_input_tokens` + `cache_creation_input_tokens` → fill vào `ChatResult.usage.cachedTokens`.
  - `estimateCostUsd`: Haiku in $0.80/1M, out $4/1M, cached in $0.08/1M (90% off). Sonnet in $3/1M, out $15/1M.
- 💡 **Học gì**: Prompt cache hữu ích cực kỳ cho self-heal — system prompt + heal instruction lặp lại 100% mỗi call → cache 1 lần xài cả phiên. Tiết kiệm 60-80% chi phí nếu test suite lớn. Lưu ý: Anthropic yêu cầu min 1024 tokens (Haiku) để cache → heal prompt nhỏ có thể không cache được, đó là lý do thêm few-shot examples (sub-step 11.11).
- ✅ Verify: gọi 2 lần liên tiếp với same system prompt → lần 2 thấy `cachedTokens > 0`.

### 11.5 — CohereProvider, HuggingFaceProvider, G4FProvider
- 🎯 3 provider fallback.
- ⚙️ Tạo 3 file extends `BaseProvider`. Cohere `command-r-plus` (free tier 1000/tháng). HF `Qwen/Qwen2.5-Coder-32B-Instruct` (free 30k tokens/ngày). G4F axios POST `https://g4f.dev/api/openai/v1/chat/completions` (không key, last resort).
- ⚙️ Mỗi provider implement `estimateCostUsd` (Cohere/HF free tier = 0 nếu trong quota; G4F = 0).
- 💡 **Học gì**: Free tier không phải miễn phí vô hạn — Cohere giới hạn theo tháng, HF theo ngày → cần `RateLimitTracker` (sub-step 11.7). G4F không stable, dùng graceful degradation cuối chain.
- ✅ Verify: typecheck pass; không gọi API thật khi typecheck.

### 11.6 — CircuitBreaker
- 🎯 Tránh waste time khi provider chết.
- ⚙️ Tạo `src/ai/providers/CircuitBreaker.ts`:
  - Trạng thái: `closed` | `open` | `half-open`.
  - 3 failures liên tiếp → `open` 60s → `half-open` (cho phép 1 thử) → success → `closed`, fail → `open` thêm 60s (max 5 phút).
  - Singleton per provider (key = provider name).
- 💡 **Học gì**: Pattern phổ biến cho microservices, áp dụng cho LLM API exact same lý do. Half-open cho phép "dò" service đã hồi phục mà không spam.
- ✅ Verify: unit test fake 3 fails → state = open; chờ 60s + 1 success → state = closed.

### 11.7 — RateLimitTracker + CostMeter + BudgetGuard
- 🎯 Quan sát chi phí + chặn vượt ngân sách.
- ⚙️ Tạo `src/ai/providers/RateLimitTracker.ts` — đếm calls/tokens per provider per ngày, persist `output/.rate-limits.json`. Chặn provider khi gần limit (vd: HF còn < 10% quota).
- ⚙️ Tạo `src/ai/providers/CostMeter.ts` — append-only log `output/llm-cost.jsonl` mỗi call: `{timestamp, provider, model, task, inputTokens, outputTokens, cachedTokens, costUsd, testFile, agentName}`.
- ⚙️ Tạo `src/ai/providers/BudgetGuard.ts` — đọc env `MAX_DAILY_BUDGET_USD` (default $5), aggregate `llm-cost.jsonl` ngày hôm nay, throw `BudgetExceededError` nếu vượt.
- 💡 **Học gì**: JSONL (newline-delimited JSON) phù hợp append-only log — không cần lock file, parse nhanh dòng-bằng-dòng. Budget guard cứu kịch bản "AI agent vô hạn loop call API". `agentName` field để codegen telemetry (12.9) reuse.
- ✅ Verify: chạy 1 test với `MAX_DAILY_BUDGET_USD=0.001` → throw ngay sau 1 call.

### 11.8 — StructuredOutputParser (zod + auto-fix)
- 🎯 Force LLM trả JSON đúng schema, self-correction.
- ⚙️ Tạo `src/ai/providers/StructuredOutputParser.ts`:
  - `async parse<T>(rawText: string, schema: z.ZodSchema<T>, llmFixCall?: (errMsg: string) => Promise<string>): Promise<T>`
  - Step 1: extract JSON từ text (stripped markdown fences). Step 2: zod parse. Step 3: nếu fail và có `llmFixCall` → gọi LLM lần nữa với prompt "Fix this JSON to match schema X. Errors: Y". Max 2 fix retries.
- 💡 **Học gì**: LLM trả JSON sai schema là chuyện bình thường (thiếu field, sai type). Self-correction loop: pass error vào prompt → LLM thường fix được lần 2. Tiết kiệm hơn write parser tay.
- ✅ Verify: feed JSON sai → bị reject; feed JSON đúng → parse ra object.

### 11.9 — TaskAwareRouter + provider profiles
- 🎯 Mỗi loại task pick provider/model phù hợp.
- ⚙️ Tạo `config/ai/providers.profiles.ts`:
  ```typescript
  export const profiles = {
    heal: { primary: 'anthropic:haiku', fallback: ['cohere', 'g4f'], temperature: 0, maxTokens: 256 },
    codegen: { primary: 'anthropic:sonnet', fallback: ['anthropic:haiku', 'cohere'], temperature: 0.2, maxTokens: 4096 },
    'data-gen': { primary: 'cohere', fallback: ['anthropic:haiku'], temperature: 0.7, maxTokens: 1024 },
    review: { primary: 'anthropic:haiku', fallback: ['cohere'], temperature: 0, maxTokens: 1024 },
  } as const;
  ```
- ⚙️ Tạo `src/ai/providers/TaskAwareRouter.ts`:
  - Constructor nhận `task: TaskProfile`.
  - Build chain providers theo profile, filter `isConfigured()` và `circuitBreaker.allow()` và `budgetGuard.canSpend()`.
  - `chat(messages, opts)` thử lần lượt → log telemetry vào CostMeter.
- 💡 **Học gì**: Linear-fallback router gốc đã ổn nhưng "fixed order" → không thông minh. Task-aware → heal dùng Haiku (rẻ, cần fast); codegen Fragment phức tạp → Sonnet (quality cao). Tách config khỏi code → đổi profile không cần redeploy.
- ✅ Verify: gọi `new TaskAwareRouter('heal').chat(...)` → log thấy provider = anthropic, model = haiku.

### 11.10 — MockProvider cho unit test
- 🎯 Test agents không cần API key.
- ⚙️ Tạo `src/ai/providers/MockProvider.ts`:
  - Constructor nhận `responses: Map<string, string>` (key = hash của messages).
  - `chat()` trả response từ map; nếu không match → throw `NoMockResponseError`.
  - Helper `recordMode()` — gọi LLM thật, lưu response vào fixture file (như VCR).
- 💡 **Học gì**: Test code AI agents = test integration với LLM = chậm + tốn tiền. Mock với fixture cho phép test logic agent (parsing, file writing, validation) không phụ thuộc API.
- ✅ Verify: viết 1 unit test cho `SelfHealEngine` dùng MockProvider → pass <100ms.

### 11.11 — Prompt template loader (Mustache + few-shot)
- 🎯 Tách prompts ra file, render với context.
- ⚙️ Tạo `src/ai/prompts/PromptLibrary.ts`:
  - `load(name: string): string` — đọc `config/ai/prompts/{name}.prompt.md`, cache.
  - `render(name: string, vars: Record<string, unknown>): string` — Mustache.render.
  - `loadWithFewShot(name): { system, examples }` — parse front-matter YAML để tách system + examples.
- ⚙️ Tạo `config/ai/prompts/heal.prompt.md` với front-matter:
  ```markdown
  ---
  task: heal
  model: anthropic:haiku
  examples:
    - input: { step: 'I.click("#login-btn")', error: 'not found' }
      output: { candidates: ['button[data-testid="login"]', 'button:has-text("Sign in")'] }
  ---
  You are a test automation expert. Given a failed step + DOM snippet, return JSON `{candidates: string[]}` with 3 selector alternatives, sorted by confidence.

  Failed step: {{step}}
  Failed locator: {{locator}}
  Error: {{error}}
  DOM snippet: {{dom}}
  ```
- 💡 **Học gì**: Prompt-as-file = version control + diffable + A/B test. Front-matter để metadata (model, examples) không lẫn vào prompt. Few-shot examples tăng accuracy 20-30%.
- ✅ Verify: `PromptLibrary.render('heal', {...})` ra string đầy đủ.

### 11.12 — LocatorRepository v2 (SQLite + decay + stats)
- 🎯 Cache + analytics healed locators.
- ⚙️ Tạo `src/ai/heal/LocatorRepository.ts`:
  - SQLite `output/heal-cache.db`. Schema: `healed_locators (id, test_file, original_selector, healed_selector, success_count INT, fail_count INT, last_used_at, created_at, provider_used)`.
  - `lookup(testFile, originalSelector): string | null` — return healed nếu `success_count > fail_count` và `last_used > NOW - 14 days`.
  - `record(testFile, original, healed, success: boolean, provider)` — insert/upsert, increment counters.
  - `decay()` — purge rows last_used > 14 days.
  - `topPromotionCandidates(): { file, original, healed, successCount }[]` — rows success_count > 10 → script đề xuất PR.
- 💡 **Học gì**: JSON file flat OK với <100 entries; SQLite cần khi >1000 (test suite trung bình). Decay tránh dùng selector cũ khi DOM đã đổi nhiều lần. Promotion = đem learning từ AI vào source code → giảm dần phụ thuộc heal.
- ✅ Verify: insert 5 record → lookup ra; insert 1 record với last_used = 30 ngày trước → decay() xóa.

### 11.13 — DomSanitizer (giảm token cho LLM)
- 🎯 Tinh giản raw HTML xuống "signal-only skeleton" trước khi feed LLM — tiết kiệm 70-90% token, tăng accuracy.
- ⚙️ Tạo `src/ai/utils/DomSanitizer.ts` (đặt ở `utils/` để cả heal + codegen dùng chung):
  - `sanitize(rawHtml: string, opts?: { keepText?: boolean; maxTextLength?: number; keepAttrs?: string[] }): string`
  - Dùng `cheerio`:
    - **Strip toàn bộ**: `<script>`, `<style>`, `<noscript>`, `<svg>`, `<canvas>`, `<iframe>`, HTML comments `<!-- -->`, `<link>`, `<meta>`.
    - **Strip attrs noise**: tất cả attr trừ allowlist: `id, class, name, type, role, placeholder, alt, title, value, href, src, data-testid, data-test, data-cy, data-qa, aria-label, aria-labelledby, for`. Bỏ inline `style`, `on*` handlers, `data-gtm-*`, `data-ga-*`, `data-track-*`, `data-analytics-*`, `_gl`, `fbclid`.
    - **Class chain trim**: nếu element có > 8 class → giữ 4 class đầu (Tailwind utility chains thường rất dài).
    - **Truncate base64**: thay `src="data:image/...;base64,XXXX..."` → `src="data:image/...;base64,..."`.
    - **Text trim**: text node > `maxTextLength` (default 200 chars) → cắt + `…`.
    - **Whitespace collapse**: gộp nhiều dấu cách/newline thành 1.
  - `sanitizeAround(rawHtml, targetSelector, opts: { siblingsRadius?: number; ancestorLevels?: number }): string` — focused mode cho heal: tìm element gần selector cũ (theo text/id/class match), giữ ancestors tới root + N siblings + sanitize toàn bộ. Default ancestor 3 levels, siblings 2.
  - `estimateTokens(html): number` — heuristic `length / 4`. Log warning nếu > 4000.
- 💡 **Học gì**: Raw DOM React/Next.js dễ ngốn 50-200KB. Token Claude Haiku ~4 chars/token → 50KB ≈ 12500 tokens chỉ riêng input → tốn $0.01/heal call và làm LLM "lạc trong rừng". Sanitize chuẩn → ~1500 tokens → cost giảm 90%, accuracy tăng vì LLM focus vào structure thật. **Prerequisite** cho heal v2 và HtmlToFragmentAgent (12.5).
- ✅ Verify: feed HTML 50KB của 1 trang React thật → output < 8KB; element `<button data-testid="login">` còn nguyên với attr; `<style>`/`<script>` bị strip; `<button class="px-4 py-2 ml-3 mr-2 mt-1 bg-blue-500 hover:bg-blue-600 ...">` chỉ còn 4 class đầu.

### 11.14 — SelfHealEngine v2 (4-phase)
- 🎯 Heal đáng tin cậy, không hallucinate, không ngốn token.
- ⚙️ Tạo `src/ai/heal/SelfHealEngine.ts`:
  - `async heal(ctx: { testFile, step, locator, error, page: Page }): Promise<string | null>`
  - **Phase 0 — Cache lookup**: `LocatorRepository.lookup()` → return cached nếu có.
  - **Phase 1 — Sanitize DOM**: `await page.content()` → `DomSanitizer.sanitizeAround(html, ctx.locator, { ancestorLevels: 3, siblingsRadius: 2 })` → log token estimate, abort nếu > 6000 (an toàn budget).
  - **Phase 2 — LLM gen candidates**: render `heal.prompt.md` với sanitized DOM → `TaskAwareRouter('heal').chat()` → `StructuredOutputParser.parse({candidates: z.array(z.string()).min(1).max(5)})`.
  - **Phase 3 — DOM verify**: cho mỗi candidate, `page.locator(c).count()` — pick candidate đầu tiên có count = 1 (unique). Skip count = 0 (LLM bịa) hoặc > 1 (ambiguous).
  - **Phase 4 — Record**: `LocatorRepository.record()` → return healed selector hoặc null.
- 💡 **Học gì**: Phase 1 (sanitize) = cost-saver chính. Phase 3 (DOM verify) = chống hallucination. Hai phase tách biệt — sanitize sai (cắt mất element) → LLM trả candidate không tồn tại → verify reject → repair tự nhiên. Không có phase 1 thì heal có thể tốn $0.05/lần thay vì $0.005.
- ✅ Verify: cố tình đổi `#login` → `#sign-in-btn` trong fixture HTML 30KB; chạy heal → log thấy "DOM sanitized: 30KB → 4KB"; trả selector đúng `#sign-in-btn`; cost log entry < $0.01.

### 11.15 — HealTelemetry + dashboard CLI
- 🎯 Quan sát hiệu quả của heal.
- ⚙️ Tạo `src/ai/heal/HealTelemetry.ts` — append `output/heal-events.jsonl` mỗi heal: `{timestamp, testFile, originalSelector, healedSelector, success, provider, latencyMs, costUsd, sanitizedDomBytes, candidatesCount}`.
- ⚙️ Tạo `scripts/heal-report.ts` — đọc JSONL, aggregate: heal rate (success/total), top failed selectors, total cost, provider distribution, **avg DOM size before/after sanitize** → render HTML `output/heal-report.html` với chart (Chart.js inline).
- ⚙️ Add npm script `"heal:report": "ts-node scripts/heal-report.ts"`.
- 💡 **Học gì**: Telemetry = prerequisite để improve. Không có data thì không biết heal hữu dụng hay tốn tiền vô ích. Dashboard quy ra dollar → giúp argue với boss "AI feature ROI dương". Tracking DOM size để biết DomSanitizer có hoạt động hiệu quả không.
- ✅ Verify: chạy `npm run heal:report` → mở `heal-report.html` thấy số liệu + chart "DOM size reduction" trung bình ≥ 70%.

### 11.16 — Wire heal plugin + CodeceptJS hook
- 🎯 Bật self-heal vào CodeceptJS pipeline với engine v2.
- ⚙️ Edit `config/codecept.conf.ts`:
  ```typescript
  import { TaskAwareRouter } from '@ai/providers/TaskAwareRouter';
  import { SelfHealEngine } from '@ai/heal/SelfHealEngine';

  const healEngine = new SelfHealEngine();

  plugins: {
    heal: {
      enabled: config.ai.healEnabled,
      healLimit: 2,
      healSteps: ['click', 'fillField', 'waitForElement', 'see', 'dontSee'],
      // override default heal logic với engine v2
      fnResolveHealing: async (failure) => healEngine.heal(failure),
    },
    ai: { request: async (msgs) => new TaskAwareRouter('heal').chat(msgs) },
  }
  ```
- ⚙️ Add npm scripts: `"test:ui:ai": "ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY codeceptjs run -c config/codecept.conf.ts --ai"`.
- 💡 **Học gì**: CodeceptJS heal plugin có hook `fnResolveHealing` để override default LLM call → đây là chỗ inject `SelfHealEngine` v2 (4-phase). Không có hook này thì plugin chỉ dùng raw LLM response, không verify.
- ✅ Verify: cố tình đổi locator trong `LoginFormFragment` → chạy `npm run test:ui:ai` → test pass nhờ heal, `output/heal-events.jsonl` có entry, `output/llm-cost.jsonl` có entry.

---

## Bước 12: AI Code Generation Pipeline

### 12.1 — Port AiDetectElements → LocatorScorer
- 🎯 Tận dụng asset deterministic Cheerio scoring (data-testid +80, id +75, …) — repo cũ có nhưng chưa được agent nào dùng.
- ⚙️ Đọc `../playwright/src/helpers/ai/element/AiDetectElements.ts`. Tạo `src/ai/codegen/LocatorScorer.ts`:
  - `scoreElement(html: string, options?: { type?: 'css' | 'xpath'; topN?: number }): Candidate[]`
  - Fix issue cũ: `query` parameter unused → loại bỏ; thêm `topN` default 5.
  - Dùng `cheerio` parse, scoring rules giữ nguyên (data-testid +80, id +75, name +60, aria/role +50, class chain +35, text +60, uniqueness +50).
- 💡 **Học gì**: Deterministic > LLM cho task có rule rõ. LocatorScorer chạy 5ms, gen 5 candidates miễn phí — LLM chỉ pick + đặt tên. Nếu chỉ dùng LLM cho locator detection → tốn $$$ + chậm + có thể bịa.
- ✅ Verify: feed HTML có `<button data-testid="login">` → top candidate là `[data-testid="login"]` score 80+.

### 12.2 — GenerationCache (idempotency)
- 🎯 Same input → same output, không re-call LLM.
- ⚙️ Tạo `src/ai/codegen/GenerationCache.ts`:
  - SQLite `output/codegen-cache.db`. Schema `(input_hash, agent_name, output_files JSON, created_at)`.
  - `lookup(agentName, inputHash): GeneratedFiles | null`
  - `store(agentName, inputHash, files)` — upsert.
  - Hash function: SHA-256 của input string.
- 💡 **Học gì**: Codegen call Sonnet ~$0.05/lần. Nếu QA chạy lại `gen page --url X` 10 lần → cache tiết kiệm $0.45. Bonus: deterministic CI test (same input HTML → cùng generated code → có thể commit).
- ✅ Verify: gọi gen với same HTML 2 lần → lần 2 trả từ cache, không log llm.attempt.

### 12.3 — GenerationPipeline core
- 🎯 Pipeline chung: load → render → LLM → validate → write, với retry-with-error.
- ⚙️ Tạo `src/ai/codegen/GenerationPipeline.ts`:
  ```typescript
  export interface PipelineConfig<TIn, TOut extends Record<string, string>> {
    agentName: string;
    promptTemplate: string;
    outputSchema: z.ZodSchema<TOut>;
    inputHasher: (input: TIn) => string;
    contextBuilder: (input: TIn) => Promise<Record<string, unknown>>;
    postValidate?: (files: TOut) => Promise<string[]>;  // ESLint/tsc errors
  }
  export class GenerationPipeline<TIn, TOut extends Record<string, string>> {
    async run(input: TIn, opts: { dryRun?: boolean; skipCache?: boolean; maxRetries?: number }): Promise<TOut> { /* ... */ }
  }
  ```
  Flow trong `run`: cache lookup → context build → render Mustache → `TaskAwareRouter('codegen').chat()` → `StructuredOutputParser.parse(outputSchema)` → Prettier format → run `tsc --noEmit` trên content (write tạm vào tmp) → nếu fail, append error vào messages, retry up to 2 lần → write final files → cache.store.
- 💡 **Học gì**: Pipeline pattern = mọi agent dùng chung 90% logic, chỉ khác prompt + schema + context. Retry-with-error là kỹ thuật mới: pass typecheck error vào prompt → LLM thường tự fix → giảm "QA phải sửa tay" 70%.
- ✅ Verify: viết test pipeline với mock LLM trả code TypeScript invalid → retry 2 lần → cuối cùng pass hoặc throw `GenerationFailedError` với chi tiết errors.

### 12.4 — Prompt templates với few-shot
- 🎯 Prompts version-controlled, có examples → accuracy cao.
- ⚙️ Tạo các file:
  - `config/ai/prompts/html-to-fragment.prompt.md` (input: html, candidates from LocatorScorer; output JSON `{fragmentTs, pageTs, testTs}`)
  - `config/ai/prompts/curl-to-api.prompt.md` (input: parsed RestRequest, endpoint description; output JSON `{serviceTs, testTs}`)
  - `config/ai/prompts/scenario-gen.prompt.md` (input: userStory; output JSON `{featureFile, stepsTs}`)
  - Mỗi file front-matter YAML với 1-2 examples đầy đủ (input/output) + system prompt + user prompt template.
- 💡 **Học gì**: 1-2 examples in prompt = "show, don't tell" → LLM bắt chước cấu trúc output, format, naming convention dễ hơn 100x so với chỉ "describe the format". Trade-off: tăng token/call → cache để giảm chi phí (xem 11.4).
- ✅ Verify: render mỗi template với input mẫu → output string > 500 chars, có examples + JSON-only instruction.

### 12.5 — HtmlToFragmentAgent
- 🎯 HTML → Fragment + Page + Test (Hybrid output).
- ⚙️ Tạo `src/ai/codegen/HtmlToFragmentAgent.ts`:
  - Input: `{ html: string, fragmentName: string, outputDir: string }`.
  - contextBuilder:
    1. **`DomSanitizer.sanitize(html)`** (Bước 11.13) — strip noise xuống skeleton trước khi feed LLM (cùng util với heal, tiết kiệm token tương tự).
    2. Parse sanitized HTML với cheerio → extract `<form>`, `<button>`, `<input>`, `<select>` elements.
    3. Run `LocatorScorer` cho mỗi → top-5 candidates per element.
    4. Inject vào prompt: skeleton DOM + element list với pre-scored locators.
  - Output schema: `z.object({ fragmentTs: z.string(), pageTs: z.string(), testTs: z.string() })`.
  - Pipeline post-validate: `tsc --noEmit` trên 3 files combined.
- 💡 **Học gì**: DomSanitizer + LocatorScorer = combo deterministic giảm 80% token + tăng accuracy. LLM chỉ cần "đặt tên + organize", không phải "đoán locator" hay "lọc noise". Khác với agent cũ (gen Page Object monolith), agent mới gen Fragment riêng → tự nhiên reuse cross-page.
- ✅ Verify: `npm run gen:page -- --html-file ./samples/login.html --name LoginForm` → tạo 3 files trong `src/ui/fragments/features/LoginFormFragment.ts`, `src/ui/pages/LoginPage.ts`, `tests/ui/smoke/login.test.ts`. `npm run typecheck` pass.

### 12.6 — CurlToApiAgent v2
- 🎯 Curl → Service + API Test, deterministic + AI hybrid.
- ⚙️ Tạo `src/ai/codegen/CurlToApiAgent.ts`:
  - Input: `{ curl: string, serviceName: string, outputDir: string }`.
  - contextBuilder: dùng `CurlConverter` (Bước 5) parse → `RestRequest` (method, url, headers, body) → infer endpoint description.
  - Output schema: `z.object({ serviceTs: z.string(), testTs: z.string() })`.
  - Service generated dùng `RestClient` + `RestRequestBuilder`. Test gen với 3 scenarios: happy, validation error, auth error.
- 💡 **Học gì**: Tách rõ deterministic (curl parsing — chính xác 100%) vs AI (method naming, scenario invention — sáng tạo). Hybrid > all-AI vì giảm hallucination ở phần đã có ground truth.
- ✅ Verify: `npm run gen:api -- --curl "$(cat samples/users.curl)" --name UserService` → tạo `src/api/services/UserService.ts` + `tests/api/user-service.test.ts`. `npm run test:api` pass.

### 12.7 — ScenarioGeneratorAgent
- 🎯 User story → Gherkin + step skeletons.
- ⚙️ Tạo `src/ai/codegen/ScenarioGeneratorAgent.ts`:
  - Input: `{ userStory: string, featureName: string, outputDir: string }`.
  - Prompt ép: ≥1 happy path, ≥3 negative cases (invalid input, auth fail, server error), ≥2 boundary (empty, max length, special chars).
  - Output schema: `z.object({ featureFile: z.string(), stepsTs: z.string() })`.
- 💡 **Học gì**: User story thường viết bởi BA = thiếu negative case. AI giỏi brainstorm edge cases — đây là productivity boost. Output là **draft**, QA review trước khi commit (caveat ghi rõ trong README.md).
- ✅ Verify: input "User can register with email + password" → output `.feature` có ≥6 scenarios.

### 12.8 — CLI scripts với Commander
- 🎯 Developer experience tốt cho CLI codegen.
- ⚙️ `npm i commander chalk ora`.
- ⚙️ Tạo `scripts/gen.ts` — entry CLI:
  ```typescript
  import { Command } from 'commander';
  const program = new Command();
  program.command('page').option('--url <url>').option('--html-file <path>').option('--name <name>').option('--output-dir <dir>', 'src/ui').option('--dry-run').option('--no-validate').option('--no-cache').action(async (opts) => { /* ... */ });
  program.command('api').option('--curl <curl>').option('--curl-file <path>').option('--name <name>').action(async (opts) => { /* ... */ });
  program.command('scenario').option('--story <story>').option('--story-file <path>').option('--name <name>').action(async (opts) => { /* ... */ });
  program.parse();
  ```
- ⚙️ Add scripts: `"gen": "ts-node scripts/gen.ts"`, `"gen:page": "npm run gen page --"`, `"gen:api": "npm run gen api --"`, `"gen:scenario": "npm run gen scenario --"`.
- 💡 **Học gì**: Commander > argv parsing tay (validation, help text, subcommands). `ora` spinner cho UX khi chờ LLM. `--dry-run` hiện preview không write file → safe explore.
- ✅ Verify: `npm run gen page -- --help` hiện help đẹp; `npm run gen page -- --url https://example.com --name Demo --dry-run` log preview, không tạo file.

### 12.9 — Codegen telemetry
- 🎯 Track agent usage + retry rate.
- ⚙️ Mở rộng `CostMeter` (Bước 11.7) để log thêm field `agentName` khi gọi từ pipeline.
- ⚙️ Tạo `scripts/codegen-report.ts` — aggregate `llm-cost.jsonl` filter `agentName != null` → report: per-agent total cost, avg retries, files generated.
- ⚙️ Add npm script `"codegen:report": "ts-node scripts/codegen-report.ts"`.
- 💡 **Học gì**: Reuse infra Bước 11 (CostMeter) thay vì viết riêng → DRY. Retry rate cao = prompt template kém → cần cải thiện. Telemetry là data để tune.
- ✅ Verify: chạy `npm run gen:page` 3 lần → `npm run codegen:report` thấy 3 entries, retry rate.

### 12.10 — Documentation cho codegen
- 🎯 QA dùng được CLI mà không hỏi.
- ⚙️ Tạo `docs/AI_CODEGEN.md`:
  - Bảng so sánh 3 agents (input/output/cost/khi nào dùng).
  - Workflow gen → review → commit.
  - Cách thêm prompt template mới.
  - Troubleshoot: typecheck fail sau gen, LLM bị rate-limit, cache stale.
- ⚙️ Update `README.md` thêm section "AI Code Generation" với 1 example end-to-end.
- 💡 **Học gì**: AI feature mạnh nhưng phức tạp → docs riêng để tránh "magic feature không ai dám dùng". Example trong README để dev mới try ngay.
- ✅ Verify: docs có copy-paste-able commands.

---

# PHẦN 6: PRODUCTION-READY (Bước 13–14)

## Bước 13: CI/CD + Docker

### 13.1 — Tạo Dockerfile
- ⚙️ Tạo `Dockerfile`:
  ```dockerfile
  FROM mcr.microsoft.com/playwright:v1.54.2-jammy
  WORKDIR /app
  COPY package*.json ./
  RUN npm ci
  COPY . .
  RUN npm run typecheck
  CMD ["npm", "test"]
  ```
- 💡 **Học gì**: Base image `playwright` có sẵn browsers + libs → không cần install lại. `npm ci` (vs install) = strict lockfile, faster, reproducible. `--ignore-scripts` không, vì cần husky postinstall (hoặc skip nếu CI).
- ✅ Verify: `docker build -t codecept-hybrid .` success.

### 13.2 — codecept.ci.conf.ts (override)
- ⚙️ Tạo `codecept.ci.conf.ts`:
  ```typescript
  import { config as base } from './codecept.conf';
  export const config = { ...base, helpers: { ...base.helpers, Playwright: { ...base.helpers!.Playwright, show: false } }, mocha: { ...base.mocha, options: { retries: 2 } } };
  ```
- 💡 **Học gì**: Spread base config → override only what differs. CI = headless, retries 2 cho flakiness, parallel workers cao.
- ✅ Verify: typecheck pass.

### 13.3 — Jenkinsfile (CI pipeline + nightly schedule)
- ⚙️ Tạo `Jenkinsfile` ở root project:
  ```groovy
  pipeline {
    agent {
      docker {
        image 'mcr.microsoft.com/playwright:v1.54.2-jammy'
        args '--ipc=host'  // bắt buộc cho Chromium shared memory
      }
    }

    triggers {
      githubPush()               // trigger khi push/PR lên GitHub
      cron('H 2 * * *')         // nightly regression 2am UTC
    }

    environment {
      BASE_URL          = credentials('codecept-base-url')
      API_URL           = credentials('codecept-api-url')
      ANTHROPIC_API_KEY = credentials('anthropic-api-key')
    }

    stages {
      stage('Install') {
        steps { sh 'npm ci' }
      }

      stage('Lint & Typecheck') {
        steps { sh 'npm run typecheck && npm run lint' }
      }

      stage('Test') {
        matrix {
          axes {
            axis { name 'BROWSER'; values 'chromium', 'firefox' }
          }
          stages {
            stage('Run Tests') {
              steps {
                sh '''
                  npx playwright install --with-deps ${BROWSER}
                  BROWSER=${BROWSER} HEADLESS=true \
                  npx codeceptjs run -c config/codecept.ci.conf.ts \
                    --reporter allure
                '''
              }
            }
          }
        }
      }
    }

    post {
      always {
        // Cần cài Allure Jenkins Plugin trước
        allure includeProperties: false, results: [[path: 'output/reports/allure']]
        archiveArtifacts artifacts: 'output/screenshots/**,output/traces/**',
                         allowEmptyArchive: true
      }
      failure {
        mail to: 'qa-team@company.com',
             subject: "FAILED: ${env.JOB_NAME} [${env.BUILD_NUMBER}]",
             body: "Build URL: ${env.BUILD_URL}"
      }
    }
  }
  ```
- 💡 **Học gì**:
  - `docker { image '...' args '--ipc=host' }` → Jenkins chạy mọi stage trong container Playwright, đảm bảo browsers + libs sẵn sàng, không phụ thuộc máy Jenkins host. `--ipc=host` là bắt buộc vì Chromium dùng shared memory.
  - `credentials('id')` → Jenkins Credentials Store inject secrets vào biến môi trường — không hardcode token trong file. Thêm credentials tại **Manage Jenkins → Credentials**.
  - `matrix { axes { axis { name 'BROWSER'; values 'chromium', 'firefox' } } }` → chạy song song 2 browser, tương đương `strategy.matrix` của GitHub Actions.
  - `triggers { githubPush() }` → cần cài **GitHub Plugin** + thêm webhook trên GitHub repo (Settings → Webhooks → URL Jenkins `/github-webhook/`).
  - `triggers { cron('H 2 * * *') }` → gộp nightly schedule vào cùng Jenkinsfile, chạy regression đầy đủ mỗi đêm, không block PR pipeline.
  - `post { always { allure ... } }` → cần cài **Allure Jenkins Plugin**; report hiển thị ngay trên Jenkins build page thay vì download artifact thủ công.
- ✅ Verify: push lên GitHub → Jenkins build tự trigger, 2 parallel stages (chromium/firefox) xanh, Allure report xuất hiện trên build page.

### 13.4 — Jenkins setup checklist (plugins + credentials + webhook)
- ⚙️ Thực hiện 3 việc cấu hình phía Jenkins server (1 lần duy nhất):
  1. **Cài plugins** (Manage Jenkins → Plugin Manager):
     - `GitHub Integration Plugin` — nhận webhook từ GitHub
     - `Docker Pipeline Plugin` — dùng `agent { docker { ... } }`
     - `Allure Jenkins Plugin` — render Allure report trong UI
  2. **Thêm credentials** (Manage Jenkins → Credentials → Global → Add):
     - `codecept-base-url` (Secret text) — giá trị `https://your-dev-url`
     - `codecept-api-url` (Secret text) — giá trị `https://your-api-url`
     - `anthropic-api-key` (Secret text) — giá trị API key Anthropic
  3. **GitHub webhook**: Trên GitHub repo → Settings → Webhooks → Add webhook:
     - Payload URL: `http://<jenkins-server>/github-webhook/`
     - Content type: `application/json`
     - Events: `Push` + `Pull requests`
- 💡 **Học gì**: Credentials Store của Jenkins tương đương GitHub Secrets — secrets không bao giờ xuất hiện trong log hay Jenkinsfile. `credentials('id')` chỉ inject vào biến môi trường của pipeline đang chạy.
- ✅ Verify: tạo một dummy commit → Jenkins tự trigger build trong vòng 30 giây.

---

## Bước 14: Documentation

### 14.1 — README.md
- ⚙️ Tạo `README.md` với: Quickstart (5 bước cài → chạy test sample), Tech stack, Folder structure, npm scripts cheatsheet.
- 💡 **Học gì**: README đầu tiên dev mới đọc → tối ưu cho time-to-first-success. <5 phút từ clone → green test = onboarding tốt.
- ✅ Verify: copy-paste được commands.

### 14.2 — docs/ARCHITECTURE.md
- ⚙️ Tạo với: Hybrid pattern explanation, Mermaid diagram (Fragment ⊂ Page ⊂ Test, Step Object orchestrates), LLM router flow, hooks lifecycle.
- 💡 **Học gì**: Architecture doc cho **senior reviewer** — giải thích "tại sao thiết kế thế này" (decisions, trade-offs).
- ✅ Verify: render Mermaid OK.

### 14.3 — docs/ONBOARDING.md
- ⚙️ Plan 1 tuần cho QA mới: Day 1 chạy test có sẵn → Day 3 viết fragment đầu → Day 5 dùng AI gen → Day 7 PR đầu tiên.
- 💡 **Học gì**: Onboarding = self-service. Tránh onboarding dựa vào "hỏi senior" — không scale.
- ✅ Verify: actionable steps, có links.

### 14.4 — docs/AI_FEATURES.md
- ⚙️ Hướng dẫn API keys, bật self-heal, dùng CLI gen, troubleshoot LLM errors.
- 💡 **Học gì**: AI features tốn tiền + có failure modes (rate limit, API down) → docs riêng để team biết handle.
- ✅ Verify: cover all AI features.

---

# Verification cuối cùng

| Phase | Verify |
|---|---|
| 1 (Bước 1-4) | `npm run typecheck && npm run lint && npm run test:smoke` pass |
| 2 (Bước 5) | `npm run test:api` với JSONPlaceholder pass |
| 3 (Bước 6-7) | `npm run test:ui` với demo app pass, dùng được Fragment + Step Object |
| 4 (Bước 8-10) | Visual baseline tạo OK; Allure report mở được; UserFactory gen data hợp lệ |
| 5 (Bước 11-12) | Đổi locator → heal v2 kick in test pass (`heal-events.jsonl` có entry, `sanitizedDomBytes < 8000`); set `MAX_DAILY_BUDGET_USD=0.01` → `BudgetExceededError`; `npm run gen page -- --html-file <X> --name Y` tạo 3 files compile được; cache hit lần 2 (no llm.attempt log) |
| 6 (Bước 13-14) | Jenkins build tự trigger khi push, 2 parallel stages xanh, Allure report hiển thị trên Jenkins UI; QA mới làm theo ONBOARDING <1h ra test pass |

---

# Tổng số micro-step

- Bước 1: 6 sub-steps
- Bước 2: 6 sub-steps
- Bước 3: 5 sub-steps
- Bước 4: 6 sub-steps
- Bước 5: 9 sub-steps
- Bước 6: 5 sub-steps
- Bước 7: 6 sub-steps
- Bước 8: 5 sub-steps
- Bước 9: 4 sub-steps
- Bước 10: 4 sub-steps
- Bước 11: 16 sub-steps
- Bước 12: 10 sub-steps
- Bước 13: 4 sub-steps
- Bước 14: 4 sub-steps

**Tổng: 90 micro-steps** — mỗi step ~5-15 phút thực hiện + đọc giải thích Why. (Bước 11+12 mở rộng từ 13 → 26 sub-steps để cover production-grade LLM gateway + DOM sanitization + pipeline validation; chi tiết xem narrative trong `ROADMAP.md`.)

---

# Cách bắt đầu sau khi plan được duyệt

1. Bạn nói: **"Làm step 1.1"** (hoặc "Làm cả Bước 1") → Claude Code thực hiện + giải thích.
2. Verify cùng nhau → tiếp step 1.2 hoặc nhảy bước theo nhu cầu.
3. Sau mỗi 4-5 sub-steps, dừng lại review code style + commit batch.
4. Hỏi **"Tại sao step X làm Y?"** bất cứ lúc nào — tôi sẽ giải thích sâu hơn phần Why.

Sau khi plan này được duyệt, tôi sẽ copy nó sang `codecept-hybrid/IMPLEMENTATION_GUIDE.md` để dùng làm context khi implement.
