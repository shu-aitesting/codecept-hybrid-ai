/**
 * Deterministic service file generator from a list of Operations.
 *
 * No LLM involved — every operation maps 1-1 to a typed service method.
 * Output lives in `src/api/services/_generated/{PascalTag}Service.ts`.
 */
import Mustache from 'mustache';

import type { Operation, HttpMethod } from './OperationParser';

export interface ServiceTemplateInput {
  tag: string;
  operations: Operation[];
  schemasImportPath?: string;
}

// ─── Mustache template ────────────────────────────────────────────────────────

const SERVICE_TEMPLATE = `// AUTO-GENERATED — do not edit. Run \`npm run gen:suite\` to refresh.
import { RestClient } from '@api/rest/RestClient';
import { RestRequestBuilder } from '@api/rest/RestRequestBuilder';
import type { RestResponse } from '@api/rest/RestResponse';
{{#hasSchemas}}
import type { z } from 'zod';
import * as Schemas from '{{{schemasImportPath}}}';
{{/hasSchemas}}

export class {{{className}}} {
  constructor(private readonly client: RestClient) {}
{{#operations}}

  async {{{methodName}}}({{{paramList}}}): Promise<RestResponse> {
    const builder = new RestRequestBuilder()
      .{{{httpMethod}}}('{{{path}}}')
      {{#pathParams}}.param('{{{name}}}', String({{{name}}}))
      {{/pathParams}}{{#hasQueryParams}}.params({ {{#queryParams}}{{{name}}}: {{{name}}}{{^last}}, {{/last}}{{/queryParams}} })
      {{/hasQueryParams}}{{#hasBody}}.json(body)
      {{/hasBody}};
    return this.client.send(builder.build());
  }
{{/operations}}
}
`;

// ─── public API ──────────────────────────────────────────────────────────────

/**
 * Render a service TypeScript source file for the given tag and operations.
 */
export function renderServiceFile(input: ServiceTemplateInput): string {
  const className = toPascalCase(input.tag) + 'Service';
  const schemasImportPath = input.schemasImportPath ?? '@api/schemas';

  const operationViews = input.operations.map((op) => buildOperationView(op));
  const hasSchemas = operationViews.some((v) => v.responseRef ?? v.requestBodyRef);

  const view = {
    className,
    schemasImportPath,
    hasSchemas,
    operations: operationViews,
  };

  return Mustache.render(SERVICE_TEMPLATE, view);
}

// ─── helpers ─────────────────────────────────────────────────────────────────

interface OperationView {
  methodName: string;
  paramList: string;
  httpMethod: string;
  path: string;
  pathParams: Array<{ name: string }>;
  hasQueryParams: boolean;
  queryParams: Array<{ name: string; last: boolean }>;
  hasBody: boolean;
  responseRef?: string;
  requestBodyRef?: string;
}

function buildOperationView(op: Operation): OperationView {
  const pathParams = op.parameters.filter((p) => p.in === 'path');
  const queryParams = op.parameters.filter((p) => p.in === 'query');
  const hasBody = ['POST', 'PUT', 'PATCH'].includes(op.method);

  const paramParts: string[] = [
    ...pathParams.map((p) => `${p.name}: string`),
    ...queryParams.map((p) => `${p.name}?: string`),
    ...(hasBody ? ['body: Record<string, unknown>'] : []),
  ];

  return {
    methodName: toMethodName(op),
    paramList: paramParts.join(', '),
    httpMethod: op.method.toLowerCase() as Lowercase<HttpMethod>,
    path: buildPathExpression(op),
    pathParams: pathParams.map((p) => ({ name: p.name })),
    hasQueryParams: queryParams.length > 0,
    queryParams: queryParams.map((p, i) => ({ name: p.name, last: i === queryParams.length - 1 })),
    hasBody,
    responseRef: op.responseRef,
    requestBodyRef: op.requestBodyRef,
  };
}

function toMethodName(op: Operation): string {
  // Use the operationId if it looks camelCase already
  if (/^[a-z][a-zA-Z0-9]*$/.test(op.operationId)) return op.operationId;

  // Fall back: verb + resource from path
  const verbMap: Partial<Record<HttpMethod, string>> = {
    GET: 'get',
    POST: 'create',
    PUT: 'update',
    PATCH: 'patch',
    DELETE: 'delete',
  };
  const verb = verbMap[op.method] ?? op.method.toLowerCase();
  const resource = op.path
    .split('/')
    .filter((s) => s && !s.startsWith('{'))
    .map((s, i) => (i === 0 ? s : s.charAt(0).toUpperCase() + s.slice(1)))
    .join('');
  return verb + resource.charAt(0).toUpperCase() + resource.slice(1);
}

function buildPathExpression(op: Operation): string {
  // Replace {param} placeholders — the builder handles params separately via .param()
  return op.path.replace(/\{[^}]+\}/g, (match) => {
    const name = match.slice(1, -1);
    return `\${${name}}`;
  });
}

function toPascalCase(s: string): string {
  return s
    .split(/[-_\s]/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}
