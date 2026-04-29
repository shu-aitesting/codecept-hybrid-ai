/**
 * Parse an OpenAPI 3.x document into a flat list of typed Operations,
 * apply filters (tags, path glob, deprecated), and group by tag.
 */
import type { OpenAPIObject, OperationObject, PathItemObject, ParameterObject } from 'openapi3-ts';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';

export interface OperationParameter {
  name: string;
  in: 'path' | 'query' | 'header' | 'cookie';
  required: boolean;
  schema?: Record<string, unknown>;
}

export interface Operation {
  operationId: string;
  tag: string;
  method: HttpMethod;
  path: string;
  summary?: string;
  description?: string;
  parameters: OperationParameter[];
  requestBodyRef?: string;
  responseRef?: string;
  deprecated: boolean;
  security: boolean;
}

export interface ParseOptions {
  tags?: string[];
  includePaths?: string[];
  excludeDeprecated?: boolean;
}

const HTTP_METHODS: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

// ─── public API ──────────────────────────────────────────────────────────────

/**
 * Extract all operations from an OpenAPI document and apply optional filters.
 */
export function parseOperations(doc: OpenAPIObject, opts: ParseOptions = {}): Operation[] {
  const all: Operation[] = [];

  for (const [apiPath, pathItem] of Object.entries(doc.paths ?? {})) {
    for (const method of HTTP_METHODS) {
      const operationObj = (pathItem as PathItemObject)[
        method.toLowerCase() as keyof PathItemObject
      ] as OperationObject | undefined;
      if (!operationObj) continue;

      const tag = operationObj.tags?.[0] ?? 'default';
      const operationId =
        operationObj.operationId ?? `${method.toLowerCase()}${toPathIdentifier(apiPath)}`;

      const parameters: OperationParameter[] = (
        (operationObj.parameters ?? []) as ParameterObject[]
      ).map((p) => ({
        name: p.name,
        in: p.in as OperationParameter['in'],
        required: p.required ?? false,
        schema: p.schema as Record<string, unknown> | undefined,
      }));

      // Resolve first 2xx response schema ref
      const responses = operationObj.responses ?? {};
      const successCode = Object.keys(responses).find((k) => k.startsWith('2')) ?? '200';
      const responseRef = extractSchemaRef(responses[successCode]);

      // Resolve request body schema ref
      const requestBody = operationObj.requestBody;
      const requestBodyRef = requestBody ? extractBodySchemaRef(requestBody) : undefined;

      all.push({
        operationId,
        tag,
        method,
        path: apiPath,
        summary: operationObj.summary,
        description: operationObj.description,
        parameters,
        requestBodyRef,
        responseRef,
        deprecated: operationObj.deprecated ?? false,
        security: Array.isArray(operationObj.security) && operationObj.security.length > 0,
      });
    }
  }

  return applyFilters(all, opts);
}

/**
 * Group a flat list of Operations into a Map keyed by tag name.
 */
export function groupByTag(operations: Operation[]): Map<string, Operation[]> {
  const map = new Map<string, Operation[]>();
  for (const op of operations) {
    const group = map.get(op.tag) ?? [];
    group.push(op);
    map.set(op.tag, group);
  }
  return map;
}

// ─── filters ─────────────────────────────────────────────────────────────────

function applyFilters(ops: Operation[], opts: ParseOptions): Operation[] {
  let result = ops;

  if (opts.tags && opts.tags.length > 0) {
    const tagSet = new Set(opts.tags.map((t) => t.toLowerCase()));
    result = result.filter((op) => tagSet.has(op.tag.toLowerCase()));
  }

  if (opts.includePaths && opts.includePaths.length > 0) {
    result = result.filter((op) =>
      opts.includePaths!.some((pattern) => matchGlob(op.path, pattern)),
    );
  }

  if (opts.excludeDeprecated) {
    result = result.filter((op) => !op.deprecated);
  }

  return result;
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function toPathIdentifier(apiPath: string): string {
  return apiPath
    .split('/')
    .filter(Boolean)
    .map((seg) => {
      if (seg.startsWith('{') && seg.endsWith('}')) return 'By' + capitalise(seg.slice(1, -1));
      return capitalise(seg);
    })
    .join('');
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function extractSchemaRef(responseObj: unknown): string | undefined {
  if (!responseObj || typeof responseObj !== 'object') return undefined;
  const resp = responseObj as Record<string, unknown>;
  const content = resp['content'] as Record<string, unknown> | undefined;
  if (!content) return undefined;
  const mediaType = content['application/json'] as Record<string, unknown> | undefined;
  if (!mediaType) return undefined;
  const schema = mediaType['schema'] as Record<string, unknown> | undefined;
  return (schema?.['$ref'] as string | undefined) ?? undefined;
}

function extractBodySchemaRef(requestBody: unknown): string | undefined {
  if (!requestBody || typeof requestBody !== 'object') return undefined;
  const body = requestBody as Record<string, unknown>;
  const content = body['content'] as Record<string, unknown> | undefined;
  if (!content) return undefined;
  const mediaType = content['application/json'] as Record<string, unknown> | undefined;
  if (!mediaType) return undefined;
  const schema = mediaType['schema'] as Record<string, unknown> | undefined;
  return (schema?.['$ref'] as string | undefined) ?? undefined;
}

/**
 * Minimal glob matching supporting `*` (any segment chars) and `**` (any path).
 * Only handles path-style patterns used in --include-paths.
 */
function matchGlob(str: string, pattern: string): boolean {
  const regexStr = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '§DOUBLE§')
    .replace(/\*/g, '[^/]*')
    .replace(/§DOUBLE§/g, '.*');
  return new RegExp(`^${regexStr}$`).test(str);
}
