import type { EndpointModel } from '@ai/codegen/shared/EndpointModel';
import type { TestCasePlan } from '@ai/codegen/shared/TestCasePlan';

import { toPascalCase, toConstCase } from './tsRenderer';

export interface RenderablePlan {
  plan: TestCasePlan;
  title: string;
  payload?: unknown;
}

export function renderTest(
  group: { groupName: string; tagSlug: string },
  renderablePlans: RenderablePlan[],
  executionOrder?: string[],
  opts?: { serviceImportPath?: string },
): string {
  const groupPascal = toPascalCase(group.groupName);
  const className = `${groupPascal}Service`;
  const importPath = opts?.serviceImportPath ?? `../../services/${groupPascal}Service`;

  // Collect schema const names and request interface names used in plans
  const schemaConstNames: string[] = [];
  const requestTypeNames: string[] = [];
  const seen = new Set<string>();
  for (const { plan } of renderablePlans) {
    if (plan.schemaAssertion) {
      const name = `${toConstCase(plan.endpoint.operationId)}_RESPONSE_SCHEMA`;
      if (!seen.has(name)) {
        seen.add(name);
        schemaConstNames.push(name);
      }
    }
    if (plan.endpoint.requestBody?.schema) {
      const typeName = `${toPascalCase(plan.endpoint.operationId)}Request`;
      if (!seen.has(typeName)) {
        seen.add(typeName);
        requestTypeNames.push(typeName);
      }
    }
  }

  // Sort plans by execution order if provided
  const sortedPlans = executionOrder
    ? [...renderablePlans].sort((a, b) => {
        const ai = executionOrder.indexOf(a.plan.endpoint.operationId);
        const bi = executionOrder.indexOf(b.plan.endpoint.operationId);
        return (ai === -1 ? Infinity : ai) - (bi === -1 ? Infinity : bi);
      })
    : renderablePlans;

  const lines: string[] = [];

  // Imports
  const namedImports = [className, ...schemaConstNames, ...requestTypeNames].join(', ');
  lines.push(`import { RestClient } from '@api/rest/RestClient';`);
  lines.push(`import { DataContext } from '@ai/data/DataContext';`);
  lines.push(`import { ${namedImports} } from '${importPath}';`);
  lines.push('');

  // Feature declaration
  lines.push(`Feature('${groupPascal} API').tag('@api').tag('@regression');`);
  lines.push('');

  // Module-scope state
  lines.push(`let client: RestClient;`);
  lines.push(`let svc: ${className};`);
  lines.push(`let dataCtx: DataContext;`);
  lines.push('');

  // Before hook
  lines.push(`Before(async () => {`);
  lines.push(`  client = new RestClient();`);
  lines.push(`  await client.init();`);
  lines.push(`  svc = new ${className}(client);`);
  lines.push(`  dataCtx = new DataContext();`);
  lines.push(`});`);
  lines.push('');

  // After hook
  lines.push(`After(async () => {`);
  lines.push(`  dataCtx.clear();`);
  lines.push(`  await client.dispose();`);
  lines.push(`});`);
  lines.push('');

  // Scenarios
  for (const rp of sortedPlans) {
    lines.push(renderScenario(rp, className));
    lines.push('');
  }

  // Remove trailing blank lines, add final newline
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  lines.push('');

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Scenario rendering
// ---------------------------------------------------------------------------

function renderScenario(rp: RenderablePlan, className: string): string {
  const { plan, title } = rp;
  const tagChain = plan.tags.map((t) => `.tag('${t}')`).join('');
  const body = renderBody(rp, className);
  return `Scenario('${escapeStr(title)}', async () => {\n${body}\n})${tagChain};`;
}

function renderBody(rp: RenderablePlan, className: string): string {
  switch (rp.plan.kind) {
    case 'positive':
      return renderPositiveBody(rp);
    case 'negative-validation':
      return renderNegativeValidationBody(rp, className);
    case 'negative-auth-missing':
      return renderNegativeAuthMissingBody(rp, className);
    case 'negative-auth-invalid':
      return renderNegativeAuthInvalidBody(rp, className);
    case 'negative-headers':
      return renderNegativeHeadersBody(rp, className);
  }
}

function renderPositiveBody(rp: RenderablePlan): string {
  const { plan } = rp;
  const call = buildServiceCall(rp, 'svc');
  const schemaConst = plan.schemaAssertion
    ? `${toConstCase(plan.endpoint.operationId)}_RESPONSE_SCHEMA`
    : null;

  const lines: string[] = [`  const res = await ${call};`];
  let chain = `  res.expectStatus(${plan.expectedStatus})`;
  if (plan.contentTypeAssertion)
    chain += `\n    .expectContentType('${plan.contentTypeAssertion}')`;
  if (schemaConst) chain += `\n    .expectSchema(${schemaConst})`;
  lines.push(chain + ';');
  return lines.join('\n');
}

function renderNegativeValidationBody(rp: RenderablePlan, _className: string): string {
  const { plan, payload } = rp;
  const lines: string[] = [];

  if (payload !== undefined) {
    const opPascal = toPascalCase(plan.endpoint.operationId);
    lines.push(`  const payload = ${JSON.stringify(payload)} as ${opPascal}Request;`);
    const call = buildServiceCallWithPayloadVar(rp, 'svc', 'payload');
    lines.push(`  const res = await ${call};`);
  } else {
    const call = buildServiceCall(rp, 'svc');
    lines.push(`  const res = await ${call};`);
  }

  lines.push(`  res.expectStatus(${plan.expectedStatus});`);
  return lines.join('\n');
}

function renderNegativeAuthMissingBody(rp: RenderablePlan, className: string): string {
  const { plan } = rp;
  const call = buildServiceCall(rp, 'svc2');
  return [
    `  const client2 = new RestClient();`,
    `  await client2.init({ skipAmbient: ['token'] });`,
    `  const svc2 = new ${className}(client2);`,
    `  const res = await ${call};`,
    `  res.expectStatus(${plan.expectedStatus});`,
    `  await client2.dispose();`,
  ].join('\n');
}

function renderNegativeAuthInvalidBody(rp: RenderablePlan, className: string): string {
  const { plan } = rp;
  const ep = plan.endpoint;
  const headerName = ep.auth.headerName || 'Token';
  const call = buildServiceCall(rp, 'svc2');
  return [
    `  const client2 = new RestClient();`,
    `  await client2.init({`,
    `    headerOverrides: { token: '${headerName}' },`,
    `    extraHTTPHeaders: { '${headerName}': 'invalid-token-for-test' },`,
    `  });`,
    `  const svc2 = new ${className}(client2);`,
    `  const res = await ${call};`,
    `  res.expectStatus(${plan.expectedStatus});`,
    `  await client2.dispose();`,
  ].join('\n');
}

function renderNegativeHeadersBody(rp: RenderablePlan, className: string): string {
  const { plan } = rp;
  const ambientKind = plan.mutation?.path ?? 'language';
  const call = buildServiceCall(rp, 'svc2');
  return [
    `  const client2 = new RestClient();`,
    `  await client2.init({ skipAmbient: ['${ambientKind}'] });`,
    `  const svc2 = new ${className}(client2);`,
    `  const res = await ${call};`,
    `  res.expectStatus(${plan.expectedStatus});`,
    `  await client2.dispose();`,
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Service call construction
// ---------------------------------------------------------------------------

function buildServiceCall(rp: RenderablePlan, svcVar: string): string {
  return buildServiceCallWithPayloadVar(rp, svcVar, undefined);
}

function buildServiceCallWithPayloadVar(
  rp: RenderablePlan,
  svcVar: string,
  payloadVar: string | undefined,
): string {
  const { plan, payload } = rp;
  const ep = plan.endpoint;
  const opPascal = toPascalCase(ep.operationId);
  const args: string[] = [];

  // Path params
  for (const p of ep.pathParams) {
    const isMutated = plan.kind !== 'positive' && plan.mutation?.path === p.name;
    const tsType = p.constraints[0]?.type;
    args.push(isMutated ? '0' : tsType === 'integer' || tsType === 'number' ? '1' : "'1'");
  }

  // Body
  if (ep.requestBody) {
    if (payloadVar) {
      args.push(payloadVar);
    } else if (payload !== undefined) {
      args.push(`${JSON.stringify(payload)} as ${opPascal}Request`);
    } else {
      const baseBody = ep.requestBody.example ?? {};
      const isBodyMutation =
        plan.kind === 'negative-validation' &&
        plan.mutation != null &&
        !ep.pathParams.some((p) => p.name === plan.mutation!.path) &&
        !ep.queryParams.some((q) => q.name === plan.mutation!.path);

      const body = isBodyMutation ? applyBodyMutation(baseBody, plan.mutation!) : baseBody;
      args.push(
        ep.requestBody.schema
          ? `${JSON.stringify(body)} as ${opPascal}Request`
          : JSON.stringify(body),
      );
    }
  }

  // Required non-ambient header params
  for (const h of ep.headerParams.required) {
    args.push(`'placeholder-${h.name}'`);
  }

  // Optional query/header params (only for query-param mutation or opts needed)
  const optsArg = buildOptsArg(ep, plan);
  if (optsArg !== null) args.push(optsArg);

  return `${svcVar}.${ep.operationId}(${args.join(', ')})`;
}

function buildOptsArg(ep: EndpointModel, plan: TestCasePlan): string | null {
  const hasOptQuery = ep.queryParams.some((q) => !q.required);
  const hasOptHeader = ep.headerParams.optional.length > 0;
  if (!hasOptQuery && !hasOptHeader) return null;

  // For negative-validation on an optional query param: pass mutated value
  if (plan.kind === 'negative-validation' && plan.mutation) {
    const isQueryMutation = ep.queryParams.some(
      (q) => q.name === plan.mutation!.path && !q.required,
    );
    if (isQueryMutation) {
      const c = plan.mutation.constraint;
      let mutVal: number | string | null = -1;
      if (plan.mutation.kind === 'out-of-range') {
        if (c?.max !== undefined) mutVal = c.max + 1;
        else if (c?.min !== undefined) mutVal = Math.max(0, c.min - 1);
      } else if (plan.mutation.kind === 'invalid-pattern') {
        mutVal = 'invalid-value';
      }
      return JSON.stringify({ [plan.mutation.path]: mutVal });
    }
  }

  // Positive and other non-query-mutation plans: omit opts (use defaults)
  return null;
}

// ---------------------------------------------------------------------------
// Mutation application (when DataFactory is not wired yet, PR-5 fallback)
// ---------------------------------------------------------------------------

function applyBodyMutation(
  body: unknown,
  mutation: NonNullable<TestCasePlan['mutation']>,
): unknown {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return body;
  const obj = { ...(body as Record<string, unknown>) };
  switch (mutation.kind) {
    case 'missing-required':
      delete obj[mutation.path];
      break;
    case 'invalid-pattern':
      obj[mutation.path] = 'invalid__value';
      break;
    case 'invalid-enum':
      obj[mutation.path] = '__INVALID_ENUM__';
      break;
    case 'out-of-range': {
      const c = mutation.constraint;
      obj[mutation.path] =
        c?.max !== undefined ? c.max + 1 : c?.min !== undefined ? Math.max(0, c.min - 1) : -1;
      break;
    }
    case 'over-length':
      obj[mutation.path] = 'x'.repeat((mutation.constraint?.maxLength ?? 0) + 1);
      break;
    default:
      break;
  }
  return obj;
}

function escapeStr(str: string): string {
  return str.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}
