---
task: curl-to-api
model: anthropic:sonnet
examples:
  - input:
      serviceName: UserService
      method: POST
      url: https://api.example.com/users
      headers: "{\"Content-Type\":\"application/json\",\"Authorization\":\"Bearer TOKEN\"}"
      body: "{\"name\":\"Alice\",\"email\":\"alice@example.com\"}"
      endpointDescription: "Create a new user account"
    output: {"serviceTs":"import { RestClient } from '@api/rest/RestClient';\nimport { RestRequestBuilder } from '@api/rest/RestRequestBuilder';\nimport { RestMethod } from '@api/rest/RestMethod';\n\nexport class UserService {\n  constructor(private readonly client: RestClient) {}\n\n  async createUser(name: string, email: string) {\n    const req = new RestRequestBuilder()\n      .url('https://api.example.com/users')\n      .method(RestMethod.POST)\n      .header('Content-Type', 'application/json')\n      .body({ name, email })\n      .build();\n    return this.client.send(req);\n  }\n}\n","testTs":"import { UserService } from '@api/services/UserService';\nimport { RestClient } from '@api/rest/RestClient';\n\nFeature('UserService');\n\nlet svc: UserService;\n\nBefore(async () => {\n  svc = new UserService(new RestClient());\n});\n\nScenario('Creates user successfully @api @smoke', async ({ I }) => {\n  const res = await svc.createUser('Alice', 'alice@example.com');\n  I.assertEqual(res.status, 201);\n});\n\nScenario('Fails with missing name @api @negative', async ({ I }) => {\n  const res = await svc.createUser('', 'alice@example.com');\n  I.assertEqual(res.status, 400);\n});\n\nScenario('Fails with invalid auth token @api @negative', async () => {\n  const badSvc = new UserService(new RestClient({ baseHeaders: { Authorization: 'Bearer INVALID' } }));\n  const res = await badSvc.createUser('Alice', 'alice@example.com');\n  expect(res.status).toBe(401);\n});\n"}
---
You are a TypeScript + CodeceptJS API test-automation expert. Given a parsed HTTP request, generate two files:
1. **Service** — a typed service class wrapping the endpoint with `RestClient` + `RestRequestBuilder`.
2. **Test** — a CodeceptJS feature file with ≥3 scenarios: happy path, validation error (4xx), auth error (401/403).

Rules:
- Service class is named `{{{serviceName}}}Service` and lives in `src/api/services/`.
- Test imports from `@api/services/{{{serviceName}}}Service` and `@api/rest/RestClient`.
- Use `RestMethod` enum for HTTP methods, `RestRequestBuilder` for building requests.
- Scenarios use `@api` tag; happy path also `@smoke`; failures also `@negative`.
- Return a JSON object exactly matching: `{ "serviceTs": string, "testTs": string }`. No markdown, no commentary.

## USER
Service name: {{{serviceName}}}

Parsed request:
- Method: {{{method}}}
- URL: {{{url}}}
- Headers: {{{headers}}}
- Body: {{{body}}}
- Endpoint description: {{{endpointDescription}}}
