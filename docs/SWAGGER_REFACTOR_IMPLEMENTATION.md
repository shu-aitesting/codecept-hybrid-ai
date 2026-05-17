# Implementation Plan — Swagger & cURL → API Test Generator Refactor

> **Status**: Ready to implement
> **Branch**: `Refactor-Swagger-AI-Agent`
> **Goal**: Sinh ra một bộ API test script comprehensive từ Swagger/cURL. Bộ test khi chạy daily chính là **system health check**.

---

## How to use this document

1. Mỗi mục `## PR-N` là một pull request độc lập. Hoàn thành theo thứ tự (PR-N+1 có thể phụ thuộc PR-N).
2. Mỗi task có dạng `- [ ]` — đánh dấu `[x]` khi xong.
3. Một task = một prompt cho AI (đủ ngắn để execute trong 1 turn). Format prompt gợi ý:
   > "Thực hiện task **X.Y** trong file plan: <copy nguyên dòng task>"
4. Trước khi merge PR, chạy **Verify commands** và xác nhận **Acceptance criteria** đều pass.
5. Nếu phát sinh vấn đề, ghi lại trong section "Notes" ở cuối plan này thay vì sửa task definition.

---

## Design Rationale (recap)

- **Hybrid codegen**: deterministic templates render file shell + test case skeleton; LLM chỉ enrich scenario title + payload value.
- **Shared core**: `EndpointModel` là internal unified type — Swagger và cURL đều convert sang dạng này; planner/templates dùng chung.
- **Comprehensive suite**: không có "health mode" filter — generator luôn sinh đầy đủ; daily run toàn bộ = health check.
- **Ambient headers**: `Token` (auth, raw, không Bearer), `Lng` (language), `Tz` (timezone) — luôn inject qua `RestClient.init`, override khi cần test missing/invalid.
- **No-junk guards**: skip rules rõ ràng (x-internal, deprecated, non-JSON content-type, oauth2 security, response 204) để không sinh test rác.
- **Verified libs (context7)**: AJV 8 + ajv-formats, swagger-parser (validate + dereference circular ignore), Playwright (failOnStatusCode: false), CodeceptJS (chained tag + retry Scenario:2).

Test taxonomy:
- `@api` (Feature) | `@positive` + `@smoke` + `@contract` + `@schema` (positive path) | `@negative-validation` | `@negative-auth-missing` | `@negative-auth-invalid` | `@negative-headers` | `@deprecated` | `@regression`

Runtime scripts:
- `test:api:smoke` (`--grep @smoke`) — quick PR gate
- `test:api:daily` (`--grep @api`) — **daily system health check**
- `test:api:negative` (`--grep '@negative-'`) — debug error path

---

## PR-1 — Runtime helpers + flexible ambient headers

> **⚠️ Impact analysis (code-review-graph)**: 4 file thay đổi trực tiếp → **84 files** trong 3-hop radius (492 nodes). Risk: **HIGH**. Key entities ảnh hưởng: `codecept.conf.ts`, `scripts/gen.ts`, `scripts/codegen-report.ts`. Flow chính: `RestClient.send → init → buildAmbientHeaders` (criticality 0.445).
>
> **Implementation strategy 2 commits**:
> 1. **Commit 1**: Update `ambientHeaders.ts` + `RestClient.ts` + `ConfigLoader.ts` + unit tests `ambientHeaders.test.ts` + `RestClient.test.ts` (đã có, sẽ fail nếu không update — xem 1.10b)
> 2. **Commit 2**: Update 3 service hand-written (`FindService.ts`, `SamsoniteService.ts`, `Samsonite2Service.ts`) + 2 API tests + `codecept.conf.ts` (nếu cần)
> 3. **Verify**: `npm test` full suite pass TRƯỚC khi push PR

**Purpose**: Default canonical headers `Token`/`Lng`/`Tz` (raw, no Bearer — match ecosystem majority) NHƯNG flex per-endpoint qua precedence 4 tầng (Swagger securityScheme.name → init override → env config → AMBIENT_DEFAULTS). Thêm AJV schema validation + skipAmbient cho negative tests.

**Precedence resolution (per-endpoint, deterministic)**:
```
final headerName = endpoint.auth.headerName              // PR-2.7: từ Swagger securityScheme.name
                ?? init.headerOverrides.token            // per-test runtime
                ?? config.apiHeaderNames.token           // env / global config
                ?? AMBIENT_DEFAULTS.token                // 'Token'
```
Tương tự cho language/timezone (skip step 1 nếu không có Swagger source).

**Files affected**:
- `package.json`
- [src/api/rest/ambientHeaders.ts](../src/api/rest/ambientHeaders.ts)
- [src/api/rest/RestClient.ts](../src/api/rest/RestClient.ts)
- [src/api/rest/RestResponse.ts](../src/api/rest/RestResponse.ts)
- `src/api/rest/SchemaValidator.ts` (new)
- [src/core/config/ConfigLoader.ts](../src/core/config/ConfigLoader.ts)
- Existing API tests dùng tên header cũ

### Tasks

- [ ] **1.1** Install deps: `npm install --save ajv@^8 ajv-formats@^3`
- [ ] **1.2** Thêm vào `ConfigSchema` ([ConfigLoader.ts](../src/core/config/ConfigLoader.ts)):
  ```ts
  apiHeaderNames: z.object({
    token: z.string().default('Token'),           // ecosystem default
    tokenPrefix: z.string().default(''),          // raw token, no 'Bearer '
    language: z.string().default('Lng'),
    timezone: z.string().default('Tz'),
  }).default({})
  ```
  Env override: `API_HEADER_TOKEN`, `API_HEADER_TOKEN_PREFIX`, `API_HEADER_LANGUAGE`, `API_HEADER_TIMEZONE`. Khi gặp API standard (`Authorization: Bearer xxx`), set `API_HEADER_TOKEN=Authorization` + `API_HEADER_TOKEN_PREFIX="Bearer "`.
- [ ] **1.3** Sửa `buildAmbientHeaders(c, overrides?)` trong `ambientHeaders.ts`: tham số 2 override từng key. Emit `{[resolvedTokenName]: prefix + c.apiToken}` etc. **⚠️ HARD PRE-REQUISITE**: Phải mở rộng `AMBIENT_*_ALIASES` TRƯỚC khi đổi default sang `Lng`/`Tz` (không phải nice-to-have). Lý do: alias array hiện tại THIẾU `'lng'` và `'language'` ([ambientHeaders.ts:31-37](../src/api/rest/ambientHeaders.ts#L31)) → nếu đổi default trước, `ambientKind('Lng')` trả `null` → classifier xếp `Lng` thành required-header thường → service emit `.header('Lng', ...)` (sai mục đích). Final aliases sau update:
  ```ts
  AMBIENT_TOKEN_ALIASES:    ['token','authorization','x-auth-token','auth-token','x-token','x-api-key','api-key']
  AMBIENT_LANGUAGE_ALIASES: ['lng','lang','language','accept-language','x-language','x-lang','ln']    // +lng, +language
  AMBIENT_TIMEZONE_ALIASES: ['tz','timezone','time-zone','x-timezone','x-tz']
  ```
- [ ] **1.4** Export const `AMBIENT_DEFAULTS = { token: 'Token', tokenPrefix: '', language: 'Lng', timezone: 'Tz' }` từ `ambientHeaders.ts`. Default cho codegen khi spec không cung cấp; runtime đọc từ `config.apiHeaderNames`.
- [ ] **1.5** Mở rộng `RestClientInitOpts` trong `RestClient.ts`:
  ```ts
  interface RestClientInitOpts {
    baseURL?: string;
    extraHTTPHeaders?: Record<string, string>;
    skipAmbient?: AmbientKind[];
    headerOverrides?: { token?: string; tokenPrefix?: string; language?: string; timezone?: string };
    failOnStatusCode?: boolean;
  }
  ```
  `init()`: pass `headerOverrides` cho `buildAmbientHeaders`; sau đó delete keys theo `skipAmbient` resolve từ overrides (KHÔNG hardcode tên).
  > **Note**: `RestRequestConfig.failOnStatusCode` đã có sẵn trong [src/api/rest/types.ts:6](../src/api/rest/types.ts#L6) ở **request-level**. PR-1.5 thêm option mới ở **context-level** cho Playwright `newContext()` — khác concept (context-level apply cho toàn bộ requests trong client), không conflict.
- [ ] **1.6** Trong `RestClient.init()`, truyền explicit `failOnStatusCode: false` vào `request.newContext()` (để 4xx trả về RestResponse, không throw)
- [ ] **1.7** Tạo file mới `src/api/rest/SchemaValidator.ts` export class singleton `SchemaValidator` với method `validate(schema: object, data: unknown): { valid: boolean; errors: string[] }`. Internal: lazy init `new Ajv({ strict: false, allErrors: true })` + `addFormats(ajv)`. Cache compiled validator theo schema reference (WeakMap nếu được, else Map)
- [ ] **1.8** Thêm method `expectSchema(schema: object): this` vào `RestResponse.ts` — gọi `SchemaValidator.validate(schema, this.body)`, throw `Error` với errors join nếu invalid
- [ ] **1.9** Thêm method `expectContentType(expected: string): this` vào `RestResponse.ts` — check `this.headers['content-type']` startsWith `expected` (cho phép suffix `; charset=utf-8`)
- [ ] **1.10** Grep và sửa mọi reference 3 header cũ trong service files hand-written. **Đã verify (lean-ctx) — 3 file cần sửa**:
  - [src/api/services/FindService.ts:20](../src/api/services/FindService.ts#L20) — `.header('Accept-Language', ...)`
  - [src/api/services/SamsoniteService.ts:22](../src/api/services/SamsoniteService.ts#L22) — `.header('Accept-Language', ...)`
  - [src/api/services/Samsonite2Service.ts:26](../src/api/services/Samsonite2Service.ts#L26) — `.header('Accept-Language', ...)`
  - Xóa các `.header()` call này (ambient sẽ inject runtime qua RestClient). Nếu giá trị cần khác config global (per-test override), dùng `client.init({ headerOverrides: { language: 'xx-XX' } })` trong test thay vì hardcode trong service
  - Grep thêm patterns `'Authorization'`/`'Bearer '`/`'X-Timezone'` để cover edge case
- [ ] **1.10b** **NEW**: Update existing unit tests sẽ FAIL sau đổi default (verified bằng code-review-graph):
  - [tests/unit/api/rest/ambientHeaders.test.ts](../tests/unit/api/rest/ambientHeaders.test.ts) — test `"emits Authorization Bearer when apiToken is set"` (L14) sẽ fail vì default mới là `Token` raw
  - [tests/unit/api/rest/RestClient.test.ts](../tests/unit/api/rest/RestClient.test.ts) — `describe:RestClient.init — ambient headers` (L40-97) cần update assertions
  - Replace bằng 3 case mới ở task 1.14 (default ecosystem / env Bearer override / per-endpoint X-API-Key)
- [ ] **1.11** Update [tests/api/regression/user-crud.test.ts](../tests/api/regression/user-crud.test.ts) và [tests/api/smoke/health.test.ts](../tests/api/smoke/health.test.ts) nếu chúng reference header cũ
- [ ] **1.12** Thêm unit test `tests/unit/api/rest/SchemaValidator.test.ts`: positive + negative cho format `email`/`date-time`/`uuid`/`pattern`/`enum`/`nullable: true`
- [ ] **1.13** Thêm unit test `tests/unit/api/rest/RestResponse.expectSchema.test.ts`: mock body match/mismatch schema
- [ ] **1.14** Thêm unit test `tests/unit/api/rest/ambientHeaders.test.ts` cover 3 case:
  ```ts
  // Case A — default ecosystem
  buildAmbientHeaders({ apiToken:'x', apiLanguage:'vi', apiTimezone:'Asia/HCM' })
  // → { Token: 'x', Lng: 'vi', Tz: 'Asia/HCM' }

  // Case B — env override sang HTTP standard
  buildAmbientHeaders({ apiToken:'x', apiHeaderNames:{ token:'Authorization', tokenPrefix:'Bearer ' } })
  // → { Authorization: 'Bearer x' }

  // Case C — per-endpoint override (Swagger apiKey scheme name X-API-Key)
  buildAmbientHeaders({ apiToken:'x' }, { token:'X-API-Key', tokenPrefix:'' })
  // → { 'X-API-Key': 'x' }
  ```

### Verify
```bash
npx tsc --noEmit
npm test -- --testPathPattern="api/rest"
```

### Acceptance
- Default behavior (no config) → emit `Token`/`Lng`/`Tz` raw (match ecosystem majority)
- Per-endpoint Swagger override → emit theo `securityScheme.name` (tested ở F.15)
- Env / per-test override hoạt động (3 case unit test pass)
- `RestClient.init({ skipAmbient: ['token'] })` không inject token header (regardless tên đã resolve)
- `ambientKind('Lng')` trả `'language'` (aliases đã expand đúng — không trả null)
- `res.expectSchema({type:'object',properties:{id:{type:'number'}},required:['id']})` pass với `{id:1}`, fail với `{}`
- Mọi unit test trong `tests/unit/api/rest/` pass (đã update theo 1.10b)
- 3 service hand-written không còn emit `.header('Accept-Language'|'Authorization'|'X-Timezone', ...)`
- Existing API tests trong `tests/api/**` vẫn pass

---

## PR-2 — Swagger parser extensions

**Purpose**: Mở rộng `SwaggerParser` để extract đủ schema constraints; thêm `SwaggerSchemaExtractor` + `SwaggerSecurity`; ràng buộc circular ref + spec validation.

**Files affected**:
- [src/api/swagger/SwaggerParser.ts](../src/api/swagger/SwaggerParser.ts)
- `src/api/swagger/SwaggerSchemaExtractor.ts` (new)
- `src/api/swagger/SwaggerSecurity.ts` (new)
- `tests/api/_fixtures/system-health.yaml` (new)

### Tasks

- [ ] **2.1** Tạo fixture `tests/api/_fixtures/system-health.yaml`: 6 endpoints (GET /ping no-auth, GET /users with `Token` security, GET /users/{id} với path param, POST /users body required name+email pattern+`Lng` required header, PUT /users/{id}, DELETE /users/{id}) — bao gồm securityScheme apiKey name=`Token` in=header, một endpoint có `security: []` override
- [ ] **2.2** Mở rộng interface `SwaggerParameter` trong `SwaggerParser.ts`: thêm `enum?`, `format?`, `pattern?`, `minimum?`, `maximum?`, `minLength?`, `maxLength?`, `example?`, `default?`. Cập nhật `normalizeParameters` để map các field từ raw schema
- [ ] **2.3** Mở rộng `SwaggerRequestBody`: đổi `schema: Record<string, unknown>` thành `contents: Record<string, { schema, example? }>` (giữ tất cả content types); giữ field `contentType` và `schema` cho back-compat shorthand (= `Object.values(contents)[0]`)
- [ ] **2.4** Trong `SwaggerParser.parse()`, gọi `SwaggerParserLib.validate(input)` trước `dereference()`. Catch error, wrap thành Error với message thân thiện. Truyền option `dereference: { circular: 'ignore' }` cho dereference call
- [ ] **2.5** Sau dereference, check `parser.$refs.circular` (lưu ý: `SwaggerParserLib.dereference` trả về raw `api` object — cần dùng `new SwaggerParserLib()` instance để access `$refs`). Log warning console nếu `true`
- [ ] **2.6** Tạo file mới `src/api/swagger/SwaggerSchemaExtractor.ts`:
  - Export type `FieldConstraint { path, type, required, format?, min?, max?, minLength?, maxLength?, pattern?, enum?, example?, default? }`
  - `extractConstraints(schema, basePath = ''): FieldConstraint[]` — recurse object/array, flatten nested `required[]` thành dot-paths
  - `flattenRequiredPaths(schema): string[]` — chỉ require paths
  - Self-ref guard: nếu thấy `__circular__` marker (do swagger-parser ignore option), emit `FieldConstraint { type: 'object', required: false }` placeholder và stop recurse
- [ ] **2.7** Tạo file mới `src/api/swagger/SwaggerSecurity.ts`:
  - Export type `ResolvedAuth { required: boolean; headerName: string; prefix: string; scheme: 'apiKey'|'http-bearer'|'http-basic'|'oauth2'|'openIdConnect'|'none' }`
  - `resolveEndpointAuth(opSecurity, globalSecurity, schemes, fallback): ResolvedAuth` — logic:
    - `opSecurity === []` ⇒ `required:false`, scheme:`none`
    - `opSecurity ?? globalSecurity` first entry → lookup scheme:
      - `apiKey` + `in:header` → `headerName = scheme.name`, `prefix: ''` (raw)
      - `http` + `scheme:bearer` → `headerName: 'Authorization'`, `prefix: 'Bearer '`
      - `http` + `scheme:basic` → `headerName: 'Authorization'`, `prefix: 'Basic '`
      - `oauth2`/`openIdConnect` → `required:true` (downstream skip negative-auth)
    - Không match scheme nào ⇒ dùng `fallback = config.apiHeaderNames` (mặc định `Token`/`''`). Adapter (PR-3.2) truyền `fallback` từ `config.apiHeaderNames`.
- [ ] **2.8** Unit test `tests/unit/api/swagger/SwaggerSchemaExtractor.test.ts`: 1 case mỗi loại constraint (required, pattern, enum, min, max, minLength, maxLength, format, nullable, nested object, array items)
- [ ] **2.9** Unit test `tests/unit/api/swagger/SwaggerSecurity.test.ts`: 6 case (bearer, basic, apiKey header, apiKey cookie → required:false vì không phải header, op `[]` override, oauth2)
- [ ] **2.10** Unit test `tests/unit/api/swagger/SwaggerParser.test.ts`: parse `system-health.yaml` fixture, snapshot kết quả
- [ ] **2.11** Mở rộng `SwaggerSchemaExtractor.extractConstraints` — collect `properties[field].example`, `properties[field].default`, `properties[field].examples[0]` (OAS3) vào `FieldConstraint.example`/`default`
- [ ] **2.12** Mở rộng `SwaggerParser.normalizeRequestBody` extract cả media-type `examples` (object, OAS3) → emit array `BodyModel.examples[]` (PR-3 sẽ map vào EndpointModel)

### Verify
```bash
npx tsc --noEmit
npm test -- --testPathPattern="api/swagger"
```

### Acceptance
- Parse `system-health.yaml` không error
- `SwaggerSchemaExtractor.extractConstraints` trả về đúng số lượng constraint từ fixture
- `SwaggerSecurity.resolveEndpointAuth` xử lý đúng cả 3 case (inherit, `[]` override, non-empty)
- Circular spec (self-ref) parse được, log warning, không crash

---

## PR-3 — Shared `EndpointModel` + adapters

**Purpose**: Tạo internal unified representation cho cả Swagger và cURL.

**Files affected**:
- `src/ai/codegen/shared/EndpointModel.ts` (new)
- `src/api/swagger/SwaggerEndpointAdapter.ts` (new)
- `src/api/curl/CurlEndpointAdapter.ts` (new)
- `tests/api/_fixtures/sample-curls/` (new dir)

### Tasks

- [ ] **3.1** Tạo file `src/ai/codegen/shared/EndpointModel.ts`:
  ```ts
  export interface ParamModel { name: string; in: 'path'|'query'|'header'|'cookie'; required: boolean; constraints: FieldConstraint[]; description?: string }
  export interface BodyModel { contentType: string; schema?: Record<string, unknown>; example?: unknown; examples?: unknown[]; required: boolean; requiredPaths: string[] }
  export interface ResponseModel { statusCode: number; description: string; schema?: Record<string, unknown>; contentType?: string }
  export interface EndpointModel {
    operationId: string;
    method: HttpMethod;
    path: string;
    pathParams: ParamModel[];
    queryParams: ParamModel[];
    headerParams: {
      required: RequiredHeaderParam[];
      optional: OptionalHeaderParam[];
      ambient: { token: boolean; language: boolean; timezone: boolean };
    };
    headerOverrides?: { token?: string; language?: string; timezone?: string }; // per-endpoint header names (cURL captured)
    requestBody?: BodyModel;
    responses: ResponseModel[];
    auth: ResolvedAuth;                  // PR-2.7 (replaces EndpointAuth)
    constraints: FieldConstraint[];
    fieldExamples: Record<string, unknown>; // dot-path → example value (from PR-2.11)
    bodyExamples: unknown[];             // media-type examples merged (from PR-2.12)
    xDependsOn?: string[];               // operationId list từ Swagger `x-depends-on` extension
    deprecated: boolean;
    source: 'swagger'|'curl';
    summary?: string;
    tags: string[];
  }
  ```
- [ ] **3.2** Tạo file `src/api/swagger/SwaggerEndpointAdapter.ts`:
  - Export `swaggerToModel(group, allSchemes, globalSecurity, config): EndpointModel[]`
  - Cho mỗi `SwaggerEndpoint`: call `headerClassifier.classify({}, { swaggerHeaders, securityHeaderNames })` cho header tier; call `SwaggerSchemaExtractor.extractConstraints` cho body + params; call `SwaggerSecurity.resolveEndpointAuth(opSec, globalSec, schemes, fallback = config.apiHeaderNames)` cho auth; map `fieldExamples` (PR-2.11) + `bodyExamples` (PR-2.12); đọc `endpoint['x-depends-on']` (array operationId) vào `xDependsOn`; map sang `EndpointModel`
- [ ] **3.3** Tạo file `src/api/curl/CurlEndpointAdapter.ts`:
  - Export `curlToModel(req: RestRequest, opts: { serviceName, pathTemplate?, withResponse?, expectedStatus? }): EndpointModel`
  - Path tokenize: parse URL pathname; với mỗi segment numeric (`^\d+$`) hoặc UUID-shaped (`^[0-9a-f-]{36}$`) ⇒ thay bằng `{id}` (hoặc tên từ `--path-template` nếu cung cấp). Đưa vào `pathParams`
  - Query parse: `URL.searchParams` ⇒ `queryParams[]`, mọi key `required: false`
  - Headers ⇒ classifier; auth detect: key match `AMBIENT_TOKEN_ALIASES` (`Token`/`Authorization`/`X-API-Key`/...) ⇒ `auth.required = true`, `auth.headerName` = key name gốc, `auth.prefix` parse từ value (`^Bearer ` → `Bearer `, else `''`)
  - **Language/Timezone detection**: scan headers; key match `AMBIENT_LANGUAGE_ALIASES` ⇒ `headerParams.ambient.language = true`, capture tên gốc vào `headerOverrides.language` (template sẽ emit `init({ headerOverrides: { language: 'X-Lang' } })`). Tương tự `AMBIENT_TIMEZONE_ALIASES`. Nếu cURL KHÔNG có ⇒ `ambient.{language,timezone} = false` (không inject runtime, tránh thừa header trên API không cần)
  - Body inference: nếu body là JSON object/array ⇒ helper `inferLooseSchema(json)` recurse trả về `{ type, properties?, items? }`; `requiredPaths` = top-level keys có giá trị non-null
  - Response: nếu `withResponse` truyền ⇒ `inferLooseSchema` cho response, build `ResponseModel { statusCode: expectedStatus ?? default, schema }`. Else: empty array
  - `constraints: []` (cURL không có constraint signal)
- [ ] **3.4** Thêm helper `inferLooseSchema(value: unknown): Record<string, unknown>` trong `CurlEndpointAdapter.ts` (hoặc shared utility): không bịa format/pattern/enum, chỉ infer type theo `typeof`/`Array.isArray`
- [ ] **3.5** Tạo 4 fixture cURL trong `tests/api/_fixtures/sample-curls/`:
  - `get-no-auth.txt` (GET /ping)
  - `get-with-token.txt` (GET /users với header Token + Lng + Tz)
  - `post-with-body.txt` (POST /users body `{name, email}`)
  - `post-with-response.json` (response body cho test `--with-response` flag)
- [ ] **3.6** Unit test `tests/unit/ai/codegen/shared/SwaggerEndpointAdapter.test.ts`: parse `system-health.yaml` → snapshot `EndpointModel[]`
- [ ] **3.7** Unit test `tests/unit/ai/codegen/shared/CurlEndpointAdapter.test.ts`: parse 4 fixture cURL → snapshot `EndpointModel`, assert auth detection + path tokenization + body shape

### Verify
```bash
npx tsc --noEmit
npm test -- --testPathPattern="shared|api/curl"
```

### Acceptance
- `swaggerToModel` produce `EndpointModel[]` đúng số endpoint trong fixture
- `curlToModel` xử lý đúng path param tokenization với numeric segment
- Khi cURL có `Token` header ⇒ `model.auth.required === true`
- Khi cURL không có auth ⇒ `model.auth.required === false`

---

## PR-3.5 — Data Generation Layer

**Purpose**: Deterministic data generation từ JSON Schema + manual chain support. Thay LLM khỏi role "sinh payload" (LLM chỉ còn sinh title ở PR-6). Đạt F.4 idempotency thật.

**Decision**: Dùng lib [`json-schema-faker`](https://github.com/json-schema-faker/json-schema-faker) thay vì tự viết — cover seed, format, pattern, enum, useExamplesValue, useDefaultValue, faker integration, outputTransform, pruneProperties.

**Files affected**:
- `src/ai/data/DataFactory.ts` (new, ~150 LOC)
- `src/ai/data/DataContext.ts` (new, ~80 LOC)
- [src/ai/data/SchemaDrivenFaker.ts](../src/ai/data/SchemaDrivenFaker.ts) — rewrite thành wrapper qua `zod-to-json-schema → json-schema-faker`
- `package.json`

### Tasks

- [ ] **3.5.1** Install: `npm i json-schema-faker zod-to-json-schema randexp`. Verify compat với `@faker-js/faker@^8` — nếu jsf version mới nhất không support faker 8, lock jsf phiên bản tương thích hoặc viết adapter (smoke test: `jsf.generate({faker:'person.fullName'}, {extensions:{faker}})` phải trả về string).

- [ ] **3.5.2** Tạo `src/ai/data/DataContext.ts` (~ 60 LOC):
  ```ts
  export class DataContext {
    private store = new Map<string, unknown>();
    capture(key: string, value: unknown): void;
    get(key: string): unknown;
    has(key: string): boolean;
    resolve<T>(template: T): T;  // walk object/string, thay '${key}'/'${key.nested}' bằng store value
    clear(): void;
  }
  ```

- [ ] **3.5.3** Tạo `src/ai/data/DataFactory.ts` (~ 100 LOC) — wrapper quanh `json-schema-faker`:
  ```ts
  import { faker } from '@faker-js/faker';
  export interface BuildOpts {
    seed?: number;
    includeOptional?: boolean;
    ctx?: DataContext;
    mutation?: TestCasePlan['mutation'];
  }
  export class DataFactory {
    constructor(private jsf = configuredJsf()) {}
    async build(endpoint: EndpointModel, opts: BuildOpts = {}): Promise<unknown> {
      const schema = endpoint.requestBody?.schema;
      if (!schema) return undefined;
      const data = await this.jsf.generate(schema, {
        seed: opts.seed ?? hashCode(endpoint.operationId),
        useExamplesValue: true,
        useDefaultValue: true,
        alwaysFakeOptionals: opts.includeOptional ?? false,
        fixedProbabilities: true,
        extensions: { faker },
        outputTransform: (v: unknown) => opts.ctx ? opts.ctx.resolve(v) : v,
      });
      return applyMutation(data, opts.mutation);
    }
  }
  function configuredJsf() {
    const jsf = require('json-schema-faker');
    jsf.extend('faker', () => faker);
    return jsf;
  }
  ```
  `applyMutation` (~ 30 LOC): xử lý `missing-required` (delete field theo path), `invalid-pattern` (replace `"###"`), `invalid-enum` (replace `"__INVALID__"`), `out-of-range` (replace `Number.MAX_SAFE_INTEGER`), `type-mismatch` (swap type), `over-length` (string `'x'.repeat(constraint.maxLength+1)`).

- [ ] **3.5.4** Rewrite `src/ai/data/SchemaDrivenFaker.ts` thành wrapper:
  - `fakeFromSchema(zodSchema, opts?)` convert Zod → JSON Schema (`zod-to-json-schema`) → delegate `DataFactory.build`
  - Giữ chữ ký cũ — không break call site hiện hữu (`UserFactory`, `UserApiFactory`)

- [ ] **3.5.5** Unit tests:
  - `tests/unit/ai/data/DataFactory.test.ts`: 6 case (basic object, enum pick deterministic, pattern match, example precedence over faker, mutation apply theo path, seed determinism deep-equal 2 runs)
  - `tests/unit/ai/data/DataContext.test.ts`: capture + resolve nested template (`'${user.profile.email}'`) + clear
  - `tests/unit/ai/data/SchemaDrivenFaker.test.ts`: regression — Zod path vẫn pass cho existing factories

### Verify
```bash
npx tsc --noEmit
npm test -- --testPathPattern="ai/data"
```

### Acceptance
- `DataFactory.build(ep, {seed:42})` chạy 2 lần ⇒ deep equal output
- Schema có `example` → output dùng example (precedence over faker)
- Mutation `missing-required` cho path `email` ⇒ output không có field `email`
- `DataContext.resolve('${user.id}')` khi store có `user.id=42` ⇒ trả `42`
- Existing `UserFactory.create()` vẫn pass (regression)

---

## PR-4 — `TestCasePlanner` + strategies

**Purpose**: Deterministic planner sinh `TestCasePlan[]` từ `EndpointModel`. Strategy module-able cho Swagger (constraint-driven) và cURL (heuristic-driven).

**Files affected**:
- `src/ai/codegen/shared/TestCasePlan.ts` (new)
- `src/ai/codegen/shared/TestCasePlanner.ts` (new)
- `src/ai/codegen/shared/strategies/SwaggerNegativeStrategy.ts` (new)
- `src/ai/codegen/shared/strategies/CurlNegativeStrategy.ts` (new)

### Tasks

- [ ] **4.1** Tạo file `src/ai/codegen/shared/TestCasePlan.ts`:
  ```ts
  export type TestKind = 'positive' | 'negative-validation' | 'negative-auth-missing' | 'negative-auth-invalid' | 'negative-headers';
  export interface TestCasePlan {
    id: string;                          // stable hash cho cache key
    kind: TestKind;
    endpoint: EndpointModel;
    tags: string[];                      // chained tags
    expectedStatus: number;
    contentTypeAssertion?: string;       // null/undefined => skip
    schemaAssertion?: Record<string, unknown>;
    mutation?: {                         // chỉ cho kind 'negative-*'
      path: string;                      // field path bị mutate
      kind: 'missing-required' | 'invalid-pattern' | 'invalid-enum' | 'out-of-range' | 'over-length' | 'type-mismatch' | 'missing-header' | 'missing-token' | 'invalid-token';
      constraint?: FieldConstraint;
    };
  }
  ```
- [ ] **4.2** Tạo `src/ai/codegen/shared/TestCasePlanner.ts`:
  - Interface `PlannerStrategy { planNegative(ep: EndpointModel): TestCasePlan[] }`
  - Class `TestCasePlanner` constructor `(strategy, opts: { requiredHeaders?: string[]; authNegativeCases?: 'missing'|'invalid'|'both' })`
  - Method `plan(ep: EndpointModel): TestCasePlan[]`:
    - Build positive plan với tags `['@positive','@smoke','@contract', ...(ep.responses[2xx].schema ? ['@schema'] : []), ...(ep.deprecated ? ['@deprecated'] : [])]`. Skip `@smoke` nếu deprecated
    - Spread `strategy.planNegative(ep)`
    - Nếu `ep.auth.required && scheme === 'apiKey'`: emit `@negative-auth-missing` và/hoặc `@negative-auth-invalid` theo opts
    - Nếu `ep.headerParams.required` chứa `Lng`/`Tz` (hoặc trong `opts.requiredHeaders`): emit `@negative-headers` (skipAmbient language hoặc timezone)
    - Apply skip rules (xem 4.5)
- [ ] **4.3** Tạo `src/ai/codegen/shared/strategies/SwaggerNegativeStrategy.ts`:
  - `planNegative(ep)`: pick 1 constraint cao nhất theo priority `required > pattern > enum > min/max > minLength/maxLength`. Build `TestCasePlan { kind:'negative-validation', mutation: { path, kind: 'missing-required'|... } }`. KHÔNG fallback type-mismatch
  - DELETE method: emit `negative-validation` với `mutation.kind: 'missing-required'` cho path param (id không tồn tại), expect 404
  - Nếu không có constraint nào ⇒ trả `[]`
- [ ] **4.4** Tạo `src/ai/codegen/shared/strategies/CurlNegativeStrategy.ts`:
  - `planNegative(ep)`: với mutating method (POST/PUT/PATCH) + body JSON object:
    - 1 plan `missing-required` cho top-level key đầu (lấy từ `requiredPaths[0]`)
    - Heuristic format: scan body keys, key match `/email|mail/i` ⇒ thêm plan `invalid-pattern` với value `"not-an-email"`; `/url|uri/i` ⇒ `"not a url"`; `/phone|mobile/i` ⇒ `"abc"`. Mỗi heuristic max 1 plan
  - Plan cap: max 2 `negative-validation` per endpoint
- [ ] **4.5** Implement skip rules trong `TestCasePlanner.plan()`:
  - Endpoint có `x-internal: true` hoặc `x-no-test: true` ⇒ return `[]` (TestCasePlanner check `ep` extension fields — adapter cần forward)
  - Method `OPTIONS` ⇒ return `[]`
  - Response 2xx không có schema ⇒ skip `@schema` (đã handle trong 4.2)
  - Endpoint không có params/body ⇒ skip `negative-validation`
  - Body content-type không phải `application/json` ⇒ skip `negative-validation`; mark positive plan với note `requiresBodyBuilder: true`
  - Auth scheme `oauth2`/`openIdConnect` ⇒ skip `negative-auth-*`
  - Deprecated endpoint ⇒ strip `@smoke` khỏi positive tags, thêm `@deprecated`
- [ ] **4.6** Mỗi plan có `id` deterministic: `sha256(${endpoint.operationId}:${kind}:${mutation?.path}:${mutation?.kind})`
- [ ] **4.7** Unit test `tests/unit/ai/codegen/shared/TestCasePlanner.test.ts`: snapshot `TestCasePlan[]` cho mỗi method (GET/POST/PUT/DELETE) từ fixture `system-health.yaml`
- [ ] **4.8** Unit test cho cả 2 strategy: assert constraint priority, heuristic detection, plan count limits
- [ ] **4.9** `TestCasePlan` thêm field `dependencies?: string[]` (copy từ `endpoint.xDependsOn`). Mỗi entry = operationId của plan phụ thuộc (resource phải tồn tại trước)
- [ ] **4.10** `TestCasePlanner.plan(endpoints)` sort topological theo `dependencies` → trả `{ plans: TestCasePlan[], executionOrder: string[] }`. Throw rõ ràng nếu circular (`Cycle detected: A → B → A`). **KHÔNG** heuristic auto-detect (defer phase sau) — chỉ trust `x-depends-on` explicit từ spec

### Verify
```bash
npx tsc --noEmit
npm test -- --testPathPattern="TestCasePlanner|strategies"
```

### Acceptance
- Plan output deterministic — cùng input → cùng `TestCasePlan[]` (chạy 2 lần byte-identical)
- POST endpoint có required field → 1 `negative-validation` với `mutation.kind === 'missing-required'`
- Endpoint có security `apiKey` Token → 2 plan negative-auth (missing + invalid)
- Endpoint có `x-internal: true` → empty plan list

---

## PR-5 — Service + Test templates

**Purpose**: Deterministic renderer cho service.ts và test.ts từ `EndpointModel[]` + `EnrichedPlan[]`. Không cần LLM cho file shape.

**Files affected**:
- `src/ai/codegen/shared/templates/ServiceTemplate.ts` (new)
- `src/ai/codegen/shared/templates/TestTemplate.ts` (new)
- `tests/__golden__/` (new dir)

### Tasks

- [ ] **5.1** Tạo `src/ai/codegen/shared/templates/ServiceTemplate.ts`:
  - `renderService(group: { groupName, tagSlug }, endpoints: EndpointModel[]): string`
  - Emit `import { config } from '@core/config/ConfigLoader';` + `import { RestClient } from '@api/rest/RestClient';` + `import { RestRequestBuilder } from '@api/rest/RestRequestBuilder';`
  - 1 const `{RESOURCE}_ENDPOINT` per unique top-level path
  - 1 typed `interface {GroupName}{Operation}Request/Response` per endpoint (infer field từ `requestBody.schema` + `responses[2xx].schema`)
  - 1 method per endpoint: signature từ `pathParams` (required) + `queryParams` (required/optional) + `body` + required header params (mandatory args) + optional header params (opts? trailing bag)
  - URL composition `${config.apiUrl}${ENDPOINT}${path-template}`
  - Cho mỗi endpoint có response 2xx schema: emit `export const {OPERATION_UPPER}_RESPONSE_SCHEMA = <JSON.stringify(schema)> as const;`
  - KHÔNG emit `.header('Content-Type', ...)` cho JSON body (RestRequestBuilder.json() đã auto-set)
  - KHÔNG emit `.header('Token'|'Lng'|'Tz', ...)` (handled by RestClient ambient)
- [ ] **5.2** Tạo `src/ai/codegen/shared/templates/TestTemplate.ts`:
  - `renderTest(group, enrichedPlans: EnrichedPlan[], executionOrder?: string[]): string`
  - Imports: service class + request types + response schema consts + RestClient + `DataContext`
  - `Feature('{{groupName}} API').tag('@api').tag('@regression');`
  - `let client: RestClient; let svc: {{GroupName}}Service; let dataCtx: DataContext;` module scope
  - `Before(async () => { client = new RestClient(); await client.init(); svc = new {{GroupName}}Service(client); dataCtx = new DataContext(); });`
  - `After(async () => { dataCtx.clear(); await client.dispose(); });`
  - **Chain rendering** (PR-4.10): Render Scenario theo `executionOrder` topological. Trước Scenario có `plan.dependencies`: emit prerequisite call qua **Before each** với capture:
    ```ts
    Before(async () => {
      const created = await svc.createUser(/* fixture từ DataFactory */);
      dataCtx.capture('user.id', created.body.id);
    });
    Scenario('Get user by id', async () => {
      const res = await svc.getUser(dataCtx.get('user.id'));
      res.expectStatus(200);
    });
    ```
  - Path/query/body param dùng `dataCtx.get('${capturedKey}')` khi `plan.endpoint.path` reference resource từ dependency
  - Cho mỗi plan, render Scenario theo `kind`:
    - **positive**: `Scenario(<enriched.title>, async () => { const res = await svc.<op>(<payload>); res.expectStatus(<expectedStatus>)<.expectContentType?><.expectSchema?>; }).tag(...)`
    - **negative-validation**: payload có mutation applied (từ `DataFactory.build` với `mutation`); `res.expectStatus(4xx)`
    - **negative-auth-missing**: tạo `client2` local với `init({ skipAmbient: ['token'] })`, expect 401
    - **negative-auth-invalid**: tạo `client2` local với `init({ headerOverrides: { token: endpoint.auth.headerName }, extraHTTPHeaders: { [endpoint.auth.headerName]: 'invalid-token-for-test' } })`, expect 401
    - **negative-headers**: `init({ skipAmbient: ['language'] })` hoặc `['timezone']`, expect 400
  - Tag chain sau callback: `.tag('@<each>')` cho mỗi tag trong `plan.tags`
- [ ] **5.3** Helper `tsRenderer.ts` shared (nếu cần) — utility format identifier, escape string, indent, etc.
- [ ] **5.4** Tạo golden snapshot directory `tests/__golden__/system-health/`:
  - `services/UserService.ts`, `services/PingService.ts` (handwritten reference output)
  - `tests/api/user.test.ts`, `tests/api/ping.test.ts`
- [ ] **5.5** Unit test `tests/unit/ai/codegen/shared/templates/ServiceTemplate.test.ts`: render từ snapshot `EndpointModel[]` (PR-3 output) → assert match golden file
- [ ] **5.6** Unit test `tests/unit/ai/codegen/shared/templates/TestTemplate.test.ts`: render từ `EnrichedPlan[]` mock → assert match golden file
- [ ] **5.7** Verify rendered output compile được: write tạm vào `.tmp/test-template-output/`, chạy `tsc --noEmit`

### Verify
```bash
npx tsc --noEmit
npm test -- --testPathPattern="templates"
```

### Acceptance
- Render output match golden snapshot byte-by-byte
- Output compile với `tsc --noEmit` không error
- Service file không có `Authorization`/`Accept-Language`/`X-Timezone`/`Content-Type` header emit
- Test file có chained `.tag()` đúng pattern, có Before/After lifecycle

---

## PR-6 — Scenario enricher (title-only) + prompt rewrite

**Purpose**: Thay 2 prompt template "emit full file" bằng 1 prompt enricher CỰC HẸP; LLM **chỉ sinh title** (Gherkin-like, < 12 từ). Payload do `DataFactory` (PR-3.5) sinh deterministic → F.4 idempotency đạt thật.

**Files affected**:
- `src/ai/codegen/shared/EnrichedPlan.ts` (new)
- `src/ai/codegen/shared/ScenarioEnricher.ts` (new)
- [config/ai/prompts/swagger-to-api.prompt.md](../config/ai/prompts/swagger-to-api.prompt.md) (rewrite)
- [config/ai/prompts/curl-to-api.prompt.md](../config/ai/prompts/curl-to-api.prompt.md) (rewrite)

### Tasks

- [ ] **6.1** Tạo `src/ai/codegen/shared/EnrichedPlan.ts`:
  ```ts
  export interface EnrichedPlan { planId: string; title: string }   // KHÔNG còn payload
  export const EnrichedPlanArraySchema = z.array(z.object({
    planId: z.string(),
    title: z.string().min(5).max(80),
  }));
  ```
- [ ] **6.2** Tạo `src/ai/codegen/shared/ScenarioEnricher.ts`:
  - Class `ScenarioEnricher` constructor `(pipeline: GenerationPipeline<EnricherInput, EnrichedPlan[]>)`
  - Method `enrich(plans: TestCasePlan[], endpoint: EndpointModel): Promise<EnrichedPlan[]>`
  - Build pipeline input: compact summary của endpoint + array plans (planId + kind + mutation.kind)
  - Validate output: chỉ check title min/max length + planId match input set. **KHÔNG** validate keys/payload (đã không còn trong shape)
  - Fallback: nếu retry vẫn fail ⇒ emit `title: \`${method} ${path} — ${kind}\`` (auto-generated, deterministic)
- [ ] **6.3** Rewrite [config/ai/prompts/swagger-to-api.prompt.md](../config/ai/prompts/swagger-to-api.prompt.md):
  - System prompt: "You generate natural-language Scenario titles for pre-built API test plans. You DO NOT emit code, payloads, or assertions — only titles."
  - Input vars: `endpoint` (compact: method+path+summary), `plans` (planId + kind + mutation summary)
  - Output: JSON `EnrichedPlan[]` matching `EnrichedPlanArraySchema`
  - 1 few-shot: 4 plan (positive + 3 negative) → 4 titles
  - **Token budget < 400** (so với ~1500 cũ)
- [ ] **6.4** Rewrite [config/ai/prompts/curl-to-api.prompt.md](../config/ai/prompts/curl-to-api.prompt.md) tương tự — input thêm captured method/path/body-summary, output chỉ title.
- [ ] **6.5** Unit test `tests/unit/ai/codegen/shared/ScenarioEnricher.test.ts`: mock LLM trả output valid + invalid (title quá dài/quá ngắn/missing planId) → assert retry + fallback auto-title hoạt động
- [ ] **6.6** Integration test: run enricher trên fixture với real Cohere/Anthropic call (`SKIP_LLM=true` mặc định để CI không gọi LLM)
- [ ] **6.7** **CLI flag `--no-llm`**: bỏ qua enricher hoàn toàn, dùng auto-title `\`${method} ${path} — ${kind}\``. Phù hợp môi trường air-gapped, CI không có LLM key, hoặc debug deterministic.

### Verify
```bash
npx tsc --noEmit
npm test -- --testPathPattern="ScenarioEnricher"
```

### Acceptance
- Enricher output đúng schema zod
- Hallucinated field name → retry → fallback hoạt động
- Prompt size < 1000 tokens (so với ~1500 cũ)

---

## PR-7 — Agent orchestrators (Swagger + cURL refactor)

**Purpose**: Rút gọn `SwaggerToApiAgent` và `CurlToApiAgent` thành thin orchestrator dùng shared core.

**Files affected**:
- [src/ai/codegen/SwaggerToApiAgent.ts](../src/ai/codegen/SwaggerToApiAgent.ts) (refactor)
- [src/ai/codegen/CurlToApiAgent.ts](../src/ai/codegen/CurlToApiAgent.ts) (refactor)
- [src/ai/codegen/headerClassifier.ts](../src/ai/codegen/headerClassifier.ts) (extend opts)

### Tasks

- [ ] **7.1** Thêm `tokenHeaderName?: string` (default `'Token'`) vào `ClassifyOpts` trong `headerClassifier.ts`. Trong `classify()`, nếu `securityHeaderNames` chứa scheme name khác với `tokenHeaderName` ⇒ vẫn route ambient.token (alias logic)
- [ ] **7.2** Refactor `SwaggerToApiAgent.ts`:
  - Constructor giữ `AgentDeps`; thêm `opts: { requiredHeaders?, authNegativeCases?, exclude?, seed?, includeOptional?, noLlm? }`
  - Constructor inject `dataFactory = new DataFactory()` (PR-3.5)
  - `run(input)`:
    1. `swaggerToModel(input.group, input.securitySchemes, globalSecurity, config)` → `EndpointModel[]` (truyền `config.apiHeaderNames` làm fallback)
    2. Apply `--exclude` glob filter
    3. Với mỗi `ep`: `planner.plan(ep)` → `TestCasePlan[]` + topological `executionOrder`
    4. **`dataCtx = new DataContext()`** shared cho group; với mỗi plan: `payload = await dataFactory.build(ep, { seed: opts.seed ?? hashCode(plan.id), ctx: dataCtx, mutation: plan.mutation, includeOptional: opts.includeOptional })`
    5. `enrichedPlans = opts.noLlm ? autoTitle(plans) : await ScenarioEnricher.enrich(plans, ep)` (chỉ title; payload đã sinh ở bước 4)
    6. `ServiceTemplate.renderService(input.group, models)` → `serviceTs`
    7. `TestTemplate.renderTest(input.group, enrichedPlans, payloads, executionOrder)` → `testTs`
    8. `ApiPostValidator.createApiPostValidate()({ serviceTs, testTs })` → errors
    9. Nếu errors empty, write file via `outputMapper`; else throw
  - `runAll(parsed)` giữ signature, lặp qua groups
  - Cache key = hash của `TestCasePlan[]` IDs + `opts.seed` (không phụ thuộc LLM output)
- [ ] **7.3** Refactor `CurlToApiAgent.ts`:
  - Constructor thêm opts giống Swagger agent + `withResponse?`, `expectedStatus?`, `pathTemplate?`
  - `run(input)`:
    1. `CurlConverter.fromCurl(input.curl)` → `RestRequest`
    2. `curlToModel(req, opts)` → `EndpointModel` (capture `auth.headerName`/`prefix` + `headerOverrides.language`/`timezone` từ command — PR-3.3)
    3. `planner.plan(ep)` với `CurlNegativeStrategy`
    4. **Payload strategy** (cURL canonical truth):
       - `positive`: `payload = mergeWithFakerOverrides(req.body, uniqueFields)` — giữ captured body làm canonical, chỉ override field có regex name match `/email|username|code|sku|slug/i` bằng `faker.internet.email()` hoặc `faker.string.alphanumeric(8)` (tránh DB conflict khi rerun)
       - `negative`: `payload = await dataFactory.build(ep, { mutation, ctx: dataCtx })` áp mutation trên captured body (deep-clone + apply)
    5. Bước 5–9 giống Swagger agent (enricher title-only → service template → test template → validate → write)
- [ ] **7.4** Xóa code không dùng nữa: contextBuilder cũ trong cả 2 agent (đã thay bằng adapter + planner), TemplateEndpoint type cũ trong SwaggerToApiAgent
- [ ] **7.5** Backwards compat: giữ existing public API (`SwaggerToApiAgent.run/runAll`, `CurlToApiAgent.run`) — caller code (scripts/gen.ts) không cần đổi
- [ ] **7.6** Integration test `tests/integration/ai/codegen/SwaggerToApiAgent.test.ts`: chạy agent trên fixture `system-health.yaml` với `SKIP_LLM=true` (mock enricher trả deterministic) → diff với golden tree
- [ ] **7.7** Integration test tương tự cho `CurlToApiAgent`

### Verify
```bash
npx tsc --noEmit
npm test -- --testPathPattern="codegen/SwaggerToApiAgent|codegen/CurlToApiAgent"
```

### Acceptance
- Agent run end-to-end trên fixture không error
- Output match golden tree (với mocked enricher)
- Cache hit khi run 2 lần với cùng input
- Generated TS files compile với `tsc --noEmit`

---

## PR-8 — Validator rules + CLI flags + docs + CI

**Purpose**: Hoàn tất với validator rules mới, CLI flags, docs, CI cron daily.

**Files affected**:
- [src/ai/codegen/ApiPostValidator.ts](../src/ai/codegen/ApiPostValidator.ts)
- [scripts/gen.ts](../scripts/gen.ts)
- `package.json`
- [docs/AI_CODEGEN.md](AI_CODEGEN.md)
- `.github/workflows/api-daily-health.yml` (new)

### Tasks

- [ ] **8.1** Thêm rules vào `ApiPostValidator.ts::checkServiceRules`:
  - Cấm emit `.header('Token'|'Lng'|'Tz'|'Authorization'|'Accept-Language'|'X-Timezone'|'Content-Type', ...)` (case-insensitive regex; allow `Content-Type` nếu pair với non-JSON body — skip rule cho an toàn)
- [ ] **8.2** Thêm rules vào `ApiPostValidator.ts::checkTestRules`:
  - Mọi `expectSchema(X)` argument phải là identifier (không phải inline object literal); identifier phải xuất hiện trong service file cùng group (regex check chéo, nhận 2 string args)
  - `@negative-auth-*` Scenario phải có `init({ skipAmbient: ['token'] })` hoặc `init({ headerOverrides:..., extraHTTPHeaders:{...} })` (tên header lấy từ `endpoint.auth.headerName`, không hardcode `Token`/`Authorization`)
  - **Cấm raw `${...}` literal** trong payload/path string — phải qua `dataCtx.resolve()` hoặc `dataCtx.get()` (tránh leak template chưa resolve vào output)
  - Cập nhật signature `checkTestRules` để optional nhận `serviceTs` cho cross-file check
- [ ] **8.3** Cập nhật `scripts/gen.ts`:
  - Flags chung: `--exclude <glob>`, `--required-headers <list>`, `--auth-negative-cases <missing|invalid|both>`, `--seed <n>` (data generation seed; default = hash(input)), `--include-optional` (DataFactory opt), `--no-llm` (skip enricher, dùng auto-title), `--dry-data` (in payload stdout, không write file)
  - `gen:curl`: thêm `--with-response <path>`, `--expected-status <code>`, `--path-template <pattern>`
  - Parse và truyền vào agent constructor opts
- [ ] **8.4** Cập nhật `package.json` scripts:
  ```json
  "test:api:daily": "codeceptjs run --grep @api",
  "test:api:smoke": "codeceptjs run --grep @smoke",
  "test:api:negative": "codeceptjs run --grep '@negative-'"
  ```
  Xóa script cũ `test:api:smoke` nếu trùng (giữ một)
- [ ] **8.5** Cập nhật [codecept.conf.ts](../codecept.conf.ts) (nếu cần): thêm `retry: { Scenario: 2 }` cho `tests/api/**`
- [ ] **8.6** Tạo `.github/workflows/api-daily-health.yml`:
  - Trigger: `schedule: cron: '0 2 * * *'` (2AM UTC daily) + `workflow_dispatch`
  - Steps: checkout, setup-node, npm ci, `npm run test:api:daily`, upload allure results, post failure summary to Slack/Teams (placeholder)
- [ ] **8.7** Rewrite [docs/AI_CODEGEN.md](AI_CODEGEN.md):
  - Section "Architecture" — hybrid codegen + shared core
  - Section "Test taxonomy" — tag scheme + matrix
  - Section "Generating tests from Swagger" — CLI usage + flags
  - Section "Generating tests from cURL" — CLI usage + flags
  - Section "Daily system health check" — CI cron + scripts
  - Section "Adding a new test type" — extension points (PlannerStrategy, template)
  - **Section "Test data layer"** — `json-schema-faker` integration, `x-depends-on` Swagger extension chain example, seed override cho debug
  - **Section "Ambient headers configuration"** — bảng so sánh 3 ecosystem (default `Token` raw / `Authorization: Bearer` / custom `X-API-Key`); cách switch qua env vars; precedence chain 4 tầng; ghi rõ Lng/Tz là **optional emit** (chỉ khi config có value)
- [ ] **8.8** Cập nhật `.env.dev.example`:
  ```bash
  # === Default ecosystem (Token raw, no Bearer) ===
  API_TOKEN=
  API_LANGUAGE=vi-VN
  API_TIMEZONE=Asia/Ho_Chi_Minh
  # API_HEADER_TOKEN=Token              # default
  # API_HEADER_TOKEN_PREFIX=             # default empty (raw)
  # API_HEADER_LANGUAGE=Lng              # default
  # API_HEADER_TIMEZONE=Tz               # default

  # === Switch to Bearer auth (uncomment khi cần) ===
  # API_HEADER_TOKEN=Authorization
  # API_HEADER_TOKEN_PREFIX=Bearer 
  ```
- [ ] **8.9** Cleanup: đánh dấu deprecated `GoldenExampleLoader` (template không cần golden nữa); plan xóa ở phase tiếp theo
- [ ] **8.10** Run đầy đủ verification

### Verify
```bash
npx tsc --noEmit
npm test
npm run gen:swagger -- --input tests/api/_fixtures/system-health.yaml --output .tmp/out --test-output .tmp/tests
npm run gen:curl -- --input tests/api/_fixtures/sample-curls/post-with-body.txt --service-name Sample
npx codeceptjs run --grep @smoke
```

### Acceptance
- Generator chạy end-to-end với fixture không error
- Generated suite compile + `--grep @smoke` chạy pass (với mock server)
- Idempotent: chạy generator 2 lần ra byte-identical output
- CI workflow file valid (test với `gh workflow view`)
- docs/AI_CODEGEN.md mô tả đầy đủ pipeline mới

---

## Final Acceptance (toàn bộ refactor)

- [ ] **F.1** Toàn bộ unit tests pass
- [ ] **F.2** Generator sinh comprehensive suite cho fixture `system-health.yaml` — diff với golden tree pass
- [ ] **F.3** Generated TS compile với `tsc --noEmit` không error
- [ ] **F.4** Chạy 2 lần cùng input → byte-identical output (idempotency)
- [ ] **F.5** `npm run test:api:smoke` pass trên stub server
- [ ] **F.6** `npm run test:api:daily` pass — đây chính là daily system health check
- [ ] **F.7** Negative test cases assert đúng status (401/400/404 tùy kind)
- [ ] **F.8** `@negative-auth-missing` và `@negative-auth-invalid` cùng chạy được trên endpoint có security
- [ ] **F.9** Endpoint với `security: []` không sinh `@negative-auth-*`
- [ ] **F.10** Endpoint deprecated không có `@smoke` tag (chỉ `@regression @deprecated`)
- [ ] **F.11** Endpoint với `x-internal: true` skip hoàn toàn
- [ ] **F.12** cURL agent end-to-end test pass trên 4 fixture
- [ ] **F.13** Refactor tiết kiệm token: prompt mới < 1000 tokens (so với ~1500 cũ)
- [ ] **F.14** CI cron daily-health workflow đã merge và scheduled
- [ ] **F.15** Header token resolve động per-endpoint — fixture 3 scheme (Token raw / Authorization Bearer / X-API-Key) → 3 generated test emit đúng tên header tương ứng, KHÔNG cross-contaminate
- [ ] **F.15b** Lng/Tz chỉ emit khi config có value HOẶC endpoint/cURL khai báo cần. Endpoint không cần Lng → init không inject Lng header (verify bằng inspect Playwright trace)
- [ ] **F.16** `DataFactory.build(ep, {seed:42})` chạy 2 lần ⇒ deep equal output (seed determinism)
- [ ] **F.17** `x-depends-on` chain emit prerequisite Before + capture/get hoạt động trên stub server (POST tạo → GET by captured id)
- [ ] **F.18** cURL positive payload = captured body modulo unique field override (email/username/code)
- [ ] **F.19** `--no-llm` flag chạy được, sinh title auto pattern `${method} ${path} — ${kind}`, output deterministic

---

## Risk summary

| Risk | Likelihood | Mitigation |
|---|---|---|
| `json-schema-faker` không tương thích `@faker-js/faker@8` | Medium | Task 3.5.1 verify trước; có thể downgrade jsf hoặc adapter wrapper |
| `randexp` sinh pattern khớp nhưng không "natural" (phone, postal code) | Low | Field-name heuristic: schema có thể đính `faker:` keyword override (json-schema-faker support sẵn) |
| Manual `x-depends-on` ít user dùng vì phải sửa spec | Medium | Document trong AI_CODEGEN.md + ví dụ; defer CLI flag `--chain <opA>:<opB>` cho phase sau |
| `DataContext.resolve` đệ quy chậm trên payload lớn | Low | json-schema-faker đã guard maxDepth=5; resolve early-exit nếu không match `${...}` |
| Default `Token`/`Lng`/`Tz` gây nhầm cho team mới khi gặp API standard `Authorization` | Medium | (1) Swagger securityScheme override tự động xử lý — chỉ ảnh hưởng spec không có securitySchemes; (2) docs/AI_CODEGEN.md ghi rõ default + 2 env var để switch sang Bearer; (3) `.env.dev.example` (task 8.8) ghi luôn 2 preset commented |
| Lng/Tz emit thừa lên API không cần (gây 400 ở server strict) | Medium | Chỉ emit khi `config.apiLanguage`/`apiTimezone` có value. Per-endpoint: Swagger không khai required Lng/Tz + cURL không capture → không inject |

---

## Notes (ghi chú phát sinh trong implementation)

> Khi gặp vấn đề hoặc quyết định lệch khỏi plan, ghi vào đây — không sửa task definition.

**Deferred features** (defer sang phase sau, có lý do):
- **Cleanup hook** (After xóa resource đã tạo): cần DB connector hoặc DELETE endpoint reliable; defer
- **Auto chain heuristic** (detect path-param ↔ response-field cross endpoint): risk false-positive cao, defer; chỉ làm khi có ≥ 5 user-reported case cần
- **deepInclude assertion** từ captured response cURL: defer (`--with-response` flag)
- **oneOf/anyOf multi-variant** (Scenario.each cho mỗi variant): defer; hiện tại json-schema-faker pick first
- **CLI flag `--chain <opA>:<opB>`** thay thế x-depends-on khi spec read-only: defer

**Implementation log**:
- _(empty)_
