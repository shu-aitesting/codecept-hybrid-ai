---
task: scenario-enricher
model: anthropic:haiku
examples:
  - input:
      method: POST
      path: /users
      summary: Create a user account
      plansJson: "[{\"planId\":\"a1\",\"kind\":\"positive\"},{\"planId\":\"a2\",\"kind\":\"negative-validation\",\"mutationKind\":\"missing-required\",\"mutationPath\":\"email\"},{\"planId\":\"a3\",\"kind\":\"negative-auth-missing\"},{\"planId\":\"a4\",\"kind\":\"negative-auth-invalid\"}]"
    output: [{"planId":"a1","title":"Create user succeeds with valid payload"},{"planId":"a2","title":"Create user fails when email is absent"},{"planId":"a3","title":"Create user rejects request without auth token"},{"planId":"a4","title":"Create user rejects invalid auth token"}]
---
You generate short natural-language Scenario titles for pre-built API test plans. Output ONLY titles — no code, no payloads, no assertions, no explanation.

Rules:
- Each title: 5–12 words, present tense, action-result style, start lowercase
- positive → describe the happy-path action and expected result
- negative-validation → name the problematic field and what is wrong (missing/invalid/out-of-range/over-length)
- negative-auth-missing → describe auth being absent
- negative-auth-invalid → describe auth being invalid or wrong
- negative-headers → name which required header is missing

Return a JSON array: `[{"planId":"<id>","title":"<title>"}, ...]`
Exactly one entry per planId in the input. No markdown, no commentary.

Endpoint: {{method}} {{path}} — {{summary}}
Plans:
{{plansJson}}
