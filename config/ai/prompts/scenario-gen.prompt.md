---
task: scenario-gen
model: anthropic:sonnet
examples:
  - input:
      featureName: UserRegistration
      userStory: "As a new visitor, I want to register with my email and password so that I can access my account."
    output: {"featureFile":"Feature: User Registration\n  As a new visitor\n  I want to register with my email and password\n  So that I can access my account\n\n  Scenario: Successful registration with valid email and password\n    Given I am on the registration page\n    When I fill in email \"user@example.com\" and password \"Password1!\"\n    And I click the Register button\n    Then I should see a welcome message\n    And I should be redirected to the dashboard\n\n  Scenario: Registration fails with already registered email\n    Given I am on the registration page\n    When I fill in email \"existing@example.com\" and password \"Password1!\"\n    And I click the Register button\n    Then I should see \"Email already in use\"\n\n  Scenario: Registration fails with invalid email format\n    Given I am on the registration page\n    When I fill in email \"not-an-email\" and password \"Password1!\"\n    And I click the Register button\n    Then I should see a validation error on the email field\n\n  Scenario: Registration fails with password too short\n    Given I am on the registration page\n    When I fill in email \"user@example.com\" and password \"abc\"\n    And I click the Register button\n    Then I should see \"Password must be at least 8 characters\"\n\n  Scenario: Registration fails with empty email\n    Given I am on the registration page\n    When I leave the email field empty and fill in password \"Password1!\"\n    And I click the Register button\n    Then I should see \"Email is required\"\n\n  Scenario: Registration fails with empty password\n    Given I am on the registration page\n    When I fill in email \"user@example.com\" and leave the password field empty\n    And I click the Register button\n    Then I should see \"Password is required\"\n\n  Scenario: Registration fails when server is unavailable\n    Given the server returns a 500 error\n    When I submit the registration form\n    Then I should see a friendly error message\n","stepsTs":"import { I } from '../steps';\n\nGiven('I am on the registration page', async () => {\n  await I.amOnPage('/register');\n});\n\nWhen('I fill in email {string} and password {string}', async (email: string, password: string) => {\n  await I.fillField('[data-testid=\"email\"]', email);\n  await I.fillField('[data-testid=\"password\"]', password);\n});\n\nWhen('I click the Register button', async () => {\n  await I.click('[data-testid=\"register-btn\"]');\n});\n\nThen('I should see a welcome message', async () => {\n  await I.see('Welcome');\n});\n\nThen('I should be redirected to the dashboard', async () => {\n  await I.seeCurrentUrlEquals('/dashboard');\n});\n\nThen('I should see {string}', async (message: string) => {\n  await I.see(message);\n});\n\nThen('I should see a validation error on the email field', async () => {\n  await I.seeElement('[data-testid=\"email-error\"]');\n});\n\nWhen('I leave the email field empty and fill in password {string}', async (password: string) => {\n  await I.fillField('[data-testid=\"password\"]', password);\n});\n\nWhen('I fill in email {string} and leave the password field empty', async (email: string) => {\n  await I.fillField('[data-testid=\"email\"]', email);\n});\n\nGiven('the server returns a 500 error', async () => {\n  // intercept network to return 500\n});\n\nWhen('I submit the registration form', async () => {\n  await I.click('[data-testid=\"register-btn\"]');\n});\n\nThen('I should see a friendly error message', async () => {\n  await I.see('Something went wrong');\n});\n"}
---
You are a BDD test-automation expert generating Gherkin feature files and step definition skeletons.

Given a user story, produce:
1. **Feature file** — Gherkin `.feature` content with:
   - Feature header (Given/When/Then narrative)
   - ≥1 happy-path scenario
   - ≥3 negative scenarios (invalid input, auth failure, server error)
   - ≥2 boundary scenarios (empty fields, max length, special characters)
2. **Steps** — TypeScript step definitions (Given/When/Then functions) for every unique step in the feature file.

Rules:
- Use `@cucumber/cucumber` imports (`Given`, `When`, `Then`) — not CodeceptJS style steps.
- Steps use `{string}` Cucumber expressions for string parameters.
- Feature name = `{{{featureName}}}`, file uses kebab-case tags.
- Cover ≥6 total scenarios.
- Return a JSON object exactly matching: `{ "featureFile": string, "stepsTs": string }`. No markdown, no commentary.

## USER
Feature name: {{{featureName}}}

User story:
{{{userStory}}}
