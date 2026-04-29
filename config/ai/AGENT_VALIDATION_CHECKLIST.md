# Agent Post-Generation Validation Checklist

After every code generation run, the agent (or a postValidate hook) MUST verify all items below.
A single failure = regenerate. These rules encode lessons from the 2026-04-30 framework audit.

---

## Fragment Checklist (`*Fragment.ts`)

- [ ] **Extends BaseFragment** — `class {Name}Fragment extends BaseFragment`
- [ ] **Root is specific** — constructor calls `super('...')` with a real CSS selector, NOT `super('body')` unless page has no landmark at all
- [ ] **selectors is `readonly … as const`** — `readonly selectors = { … } as const;`
- [ ] **No `await` on `I.*` actions** — `this.I.click(…)`, `this.I.fillField(…)`, `this.I.waitForElement(…)` are void-typed in CodeceptJS; do NOT prefix with `await`
- [ ] **`await this.within()`** — any call to `this.within(fn)` IS awaited because `BaseFragment.within()` returns `Promise<void>`
- [ ] **`waitToLoad()` exists** — implements the abstract method
- [ ] **verify*() for each assertion** — any selector that needs to be asserted externally has a dedicated `async verify*(): Promise<void>` method
- [ ] **Export style** — `export = {Name}Fragment;` (CommonJS, not `export class`)
- [ ] **No business logic** — no navigation, no multi-step flows

---

## Page Object Checklist (`*Page.ts`)

- [ ] **Extends BasePage** — `export class {Name}Page extends BasePage`
- [ ] **Has `path`** — `path = '/route';`
- [ ] **Fragment properties** — each fragment is a named typed property instantiated with `new`
- [ ] **`waitForLoad()` exists** — delegates to primary fragment's `waitToLoad()`
- [ ] **No direct `I.*` calls** — all interactions go through fragment methods
- [ ] **Import style** — fragments imported with `import {Name}Fragment = require(…);`

---

## Step Object Checklist (`*Steps.ts`)

- [ ] **Private page instance** — `private readonly page = new {Name}Page();`
- [ ] **`I` via getter** — `protected get I(): CodeceptJS.I { return inject().I; }`
- [ ] **Calls fragment METHODS** — NEVER accesses `this.page.*.selectors.*` directly
  - ❌ `this.I.click(this.page.main.selectors.submitBtn)`
  - ✅ `await this.page.main.submit()`
- [ ] **verify*() for every test assertion** — test layer calls `await steps.verifyX()`, never touches selectors
- [ ] **Export singleton** — `export = new {Name}Steps();`
- [ ] **No imports in test** — steps file is registered in `codecept.conf.ts` `include` block

---

## API Service Checklist (`*Service.ts`)

- [ ] **Relative endpoint constant** — `const X_ENDPOINT = '/api/path';` NOT an absolute URL
- [ ] **URL composed with config** — `` `${config.apiUrl}${X_ENDPOINT}` ``
- [ ] **Typed request interface** — `export interface {Name}Request { … }`
- [ ] **Typed response interface** — `export interface {Name}Response { … }`
- [ ] **Generic send** — `client.send<{Name}Response>(req)`
- [ ] **No browser-fingerprint headers** — strip `sec-ch-ua*`, `sec-fetch-*`, `user-agent`, `priority`
- [ ] **RestRequestBuilder shorthand** — `.post(url)` / `.get(url)` / etc. NOT `.url().method(RestMethod.*)`
- [ ] **`.json()` for JSON bodies** — NOT `.body()`

---

## API Test Checklist (`*.test.ts`)

- [ ] **Imports at top** — `{Name}Service`, `{Name}Request` (if used), `RestClient` all imported
- [ ] **No RestRequestBuilder import** — builder must NOT appear in test files
- [ ] **Lifecycle** — `let client`, `let svc` at module scope; `Before: client.init()` before passing to service; `After: client.dispose()`
- [ ] **Assertions** — `res.expectStatus(code)` only
- [ ] **Tags chained** — `.tag('@smoke')` / `.tag('@negative')` after callback, not in title
- [ ] **File location** — `tests/api/smoke/`

---

## UI Test Checklist (`*.test.ts`)

- [ ] **No imports** — CodeceptJS injects everything
- [ ] **Step Object only** — no direct page / fragment / selector access
- [ ] **Tags chained** — `.tag('@smoke')` / `.tag('@negative')` after callback
- [ ] **Registered in include** — step object referenced in `codecept.conf.ts` `include` block
- [ ] **File location** — `tests/ui/smoke/` or `tests/ui/regression/`

---

## codecept.conf.ts Checklist

- [ ] **All `include` entries exist** — every file path in `include` must resolve to a real file
- [ ] **Step Objects in include** — `{name}Steps: './src/ui/steps/{Name}Steps.ts'`
- [ ] **No duplicate instances** — a fragment used directly by a page via `new X()` should NOT also be in `include` unless it is meant to be injected independently

---

## TypeScript Hygiene

- [ ] **No `any`** — use explicit types or `unknown`
- [ ] **No unused imports**
- [ ] **Consistent export style** per layer (see table below)

| Layer | Export |
|---|---|
| Fragment | `export = ClassName;` |
| Page | `export class ClassName` |
| Step Object | `export = new ClassName();` |
| API Service | `export class ClassName` + `export interface` |
