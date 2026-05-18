import { ambientKind, isSkippedHeader } from '@api/rest/ambientHeaders';
import { RestRequest } from '@api/rest/RestRequest';
import type { ResolvedAuth } from '@api/swagger/SwaggerSecurity';

import { classify } from '@ai/codegen/headerClassifier';
import {
  EndpointModel,
  ParamModel,
  BodyModel,
  ResponseModel,
  HttpMethod,
} from '@ai/codegen/shared/EndpointModel';

const NUMERIC_SEGMENT = /^\d+$/;
const UUID_SEGMENT = /^[0-9a-f-]{36}$/i;

export interface CurlToModelOpts {
  serviceName: string;
  pathTemplate?: string;
  withResponse?: unknown;
  expectedStatus?: number;
}

export function curlToModel(req: RestRequest, opts: CurlToModelOpts): EndpointModel {
  const parsed = new URL(req.url);
  const { tokenizedPath, pathParams } = tokenizePath(parsed.pathname, opts.pathTemplate);

  // Query params from URL (CurlConverter stores them in the URL, not req.params)
  const queryParams: ParamModel[] = [];
  parsed.searchParams.forEach((_value, key) => {
    queryParams.push({ name: key, in: 'query', required: false, constraints: [] });
  });

  const headers = req.headers as Record<string, string>;

  // Classify non-ambient headers into required/optional params
  const classification = classify(headers, {});

  // Detect ambient header details (name, prefix) from raw headers
  let authRequired = false;
  let authHeaderName = '';
  let authPrefix = '';
  const headerOverrides: { token?: string; language?: string; timezone?: string } = {};

  for (const [key, rawValue] of Object.entries(headers)) {
    if (isSkippedHeader(key)) continue;
    const kind = ambientKind(key);
    const value = String(rawValue ?? '');
    if (kind === 'token') {
      authRequired = true;
      authHeaderName = key;
      if (value.startsWith('Bearer ')) {
        authPrefix = 'Bearer ';
      } else if (value.startsWith('Basic ')) {
        authPrefix = 'Basic ';
      }
    } else if (kind === 'language') {
      headerOverrides.language = key;
    } else if (kind === 'timezone') {
      headerOverrides.timezone = key;
    }
  }

  const auth: ResolvedAuth = authRequired
    ? {
        required: true,
        headerName: authHeaderName,
        prefix: authPrefix,
        scheme: authPrefix.startsWith('Bearer')
          ? 'http-bearer'
          : authPrefix.startsWith('Basic')
            ? 'http-basic'
            : 'apiKey',
      }
    : { required: false, headerName: '', prefix: '', scheme: 'none' };

  const hasLanguage = Object.keys(headers).some(
    (k) => !isSkippedHeader(k) && ambientKind(k) === 'language',
  );
  const hasTimezone = Object.keys(headers).some(
    (k) => !isSkippedHeader(k) && ambientKind(k) === 'timezone',
  );

  // Request body
  let requestBody: BodyModel | undefined;
  if (req.body !== undefined && req.body !== null) {
    const schema = inferLooseSchema(req.body);
    const requiredPaths =
      typeof req.body === 'object' && !Array.isArray(req.body) && req.body !== null
        ? Object.entries(req.body as Record<string, unknown>)
            .filter(([, v]) => v !== null && v !== undefined)
            .map(([k]) => k)
        : [];
    requestBody = {
      contentType: 'application/json',
      schema,
      example: req.body,
      required: true,
      requiredPaths,
    };
  }

  // Response (only when withResponse is provided via --with-response flag)
  const responses: ResponseModel[] = [];
  if (opts.withResponse !== undefined) {
    responses.push({
      statusCode: opts.expectedStatus ?? 200,
      description: 'Response',
      schema: inferLooseSchema(opts.withResponse),
      contentType: 'application/json',
    });
  }

  const method = String(req.method).toUpperCase() as HttpMethod;

  // Generate operationId from method + non-param path segments
  const opSegments = tokenizedPath
    .split('/')
    .filter(Boolean)
    .filter((s) => !s.startsWith('{'))
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1));
  const operationId = `${method.toLowerCase()}${opSegments.join('')}`;

  return {
    operationId,
    method,
    path: tokenizedPath,
    pathParams,
    queryParams,
    headerParams: {
      required: classification.requiredParams,
      optional: classification.optionalParams,
      ambient: {
        token: authRequired,
        language: hasLanguage,
        timezone: hasTimezone,
      },
    },
    headerOverrides: Object.keys(headerOverrides).length > 0 ? headerOverrides : undefined,
    requestBody,
    responses,
    auth,
    constraints: [],
    fieldExamples: {},
    bodyExamples: [],
    deprecated: false,
    source: 'curl',
    tags: [opts.serviceName],
  };
}

function tokenizePath(
  pathname: string,
  pathTemplate?: string,
): { tokenizedPath: string; pathParams: ParamModel[] } {
  if (pathTemplate) {
    const pathParams: ParamModel[] = [];
    for (const m of pathTemplate.matchAll(/\{(\w+)\}/g)) {
      pathParams.push({ name: m[1], in: 'path', required: true, constraints: [] });
    }
    return { tokenizedPath: pathTemplate, pathParams };
  }

  const segments = pathname.split('/');
  const pathParams: ParamModel[] = [];
  let paramIndex = 0;

  const tokenized = segments.map((seg) => {
    if (NUMERIC_SEGMENT.test(seg) || UUID_SEGMENT.test(seg)) {
      const paramName = paramIndex === 0 ? 'id' : `id${paramIndex + 1}`;
      paramIndex++;
      pathParams.push({ name: paramName, in: 'path', required: true, constraints: [] });
      return `{${paramName}}`;
    }
    return seg;
  });

  return { tokenizedPath: tokenized.join('/'), pathParams };
}

/** Infer a loose JSON Schema from a runtime value — only type/properties/items, no format/pattern/enum. */
export function inferLooseSchema(value: unknown): Record<string, unknown> {
  if (value === null) return { type: 'null' };
  if (Array.isArray(value)) {
    if (value.length > 0) return { type: 'array', items: inferLooseSchema(value[0]) };
    return { type: 'array' };
  }
  if (typeof value === 'object') {
    const properties: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      properties[k] = inferLooseSchema(v);
    }
    return { type: 'object', properties };
  }
  if (typeof value === 'number') {
    return Number.isInteger(value) ? { type: 'integer' } : { type: 'number' };
  }
  if (typeof value === 'boolean') return { type: 'boolean' };
  return { type: 'string' };
}
