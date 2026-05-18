import type { FieldConstraint } from '@api/swagger/SwaggerSchemaExtractor';
import type { ResolvedAuth } from '@api/swagger/SwaggerSecurity';

import type { RequiredHeaderParam, OptionalHeaderParam } from '@ai/codegen/headerClassifier';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';

export interface ParamModel {
  name: string;
  in: 'path' | 'query' | 'header' | 'cookie';
  required: boolean;
  constraints: FieldConstraint[];
  description?: string;
}

export interface BodyModel {
  contentType: string;
  schema?: Record<string, unknown>;
  example?: unknown;
  examples?: unknown[];
  required: boolean;
  requiredPaths: string[];
}

export interface ResponseModel {
  statusCode: number;
  description: string;
  schema?: Record<string, unknown>;
  contentType?: string;
}

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
  /** Per-endpoint resolved header names captured from cURL (ambient kind → actual header name) */
  headerOverrides?: { token?: string; language?: string; timezone?: string };
  requestBody?: BodyModel;
  responses: ResponseModel[];
  auth: ResolvedAuth;
  constraints: FieldConstraint[];
  /** dot-path → example value, from Swagger schema field examples (PR-2.11) */
  fieldExamples: Record<string, unknown>;
  /** media-type level examples merged from requestBody (PR-2.12) */
  bodyExamples: unknown[];
  /** operationId list from Swagger x-depends-on extension */
  xDependsOn?: string[];
  deprecated: boolean;
  source: 'swagger' | 'curl';
  summary?: string;
  tags: string[];
}
