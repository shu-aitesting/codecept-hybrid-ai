import { SwaggerParser, SwaggerGroup, SwaggerParameter } from '@api/swagger/SwaggerParser';
import { SwaggerSchemaExtractor, FieldConstraint } from '@api/swagger/SwaggerSchemaExtractor';
import { resolveEndpointAuth } from '@api/swagger/SwaggerSecurity';

import { classify, SwaggerHeaderInput } from '@ai/codegen/headerClassifier';
import {
  EndpointModel,
  ParamModel,
  BodyModel,
  ResponseModel,
  HttpMethod,
} from '@ai/codegen/shared/EndpointModel';

export function swaggerToModel(
  group: SwaggerGroup,
  allSchemes: Record<string, unknown>,
  globalSecurity: Array<Record<string, string[]>> | undefined,
  config: {
    apiHeaderNames: { token: string; tokenPrefix: string; language: string; timezone: string };
  },
): EndpointModel[] {
  const securityHeaderNames = SwaggerParser.extractSecurityHeaderNames(allSchemes);
  const fallback = {
    token: config.apiHeaderNames.token,
    tokenPrefix: config.apiHeaderNames.tokenPrefix,
  };

  return group.endpoints.map((ep) => {
    // Header classification
    const swaggerHeaders: SwaggerHeaderInput[] = ep.parameters
      .filter((p) => p.in === 'header')
      .map((p) => ({
        name: p.name,
        required: p.required,
        schema: p.schema
          ? {
              type:
                typeof (p.schema as Record<string, unknown>)['type'] === 'string'
                  ? String((p.schema as Record<string, unknown>)['type'])
                  : 'string',
            }
          : undefined,
        description: p.description,
      }));

    const classification = classify({}, { swaggerHeaders, securityHeaderNames });

    // Body field constraints
    const bodyConstraints: FieldConstraint[] = ep.requestBody?.schema
      ? SwaggerSchemaExtractor.extractConstraints(ep.requestBody.schema)
      : [];

    // Path + query param constraints (header params handled via ambient/classification)
    const paramConstraints: FieldConstraint[] = ep.parameters
      .filter((p) => p.in === 'path' || p.in === 'query')
      .map(paramToConstraint);

    const allConstraints = [...paramConstraints, ...bodyConstraints];

    // fieldExamples: dot-path → example from body field constraints
    const fieldExamples: Record<string, unknown> = {};
    for (const c of bodyConstraints) {
      if (c.example !== undefined) fieldExamples[c.path] = c.example;
    }

    // bodyExamples: from requestBody.examples (populated by SwaggerParser PR-2.12)
    const bodyExamples: unknown[] = ep.requestBody?.examples ?? [];

    // Auth resolution
    const auth = resolveEndpointAuth(
      ep.security ?? undefined,
      globalSecurity,
      allSchemes,
      fallback,
    );

    // Path params
    const pathParams: ParamModel[] = ep.parameters
      .filter((p) => p.in === 'path')
      .map((p) => ({
        name: p.name,
        in: 'path' as const,
        required: p.required,
        constraints: [paramToConstraint(p)],
        description: p.description,
      }));

    // Query params
    const queryParams: ParamModel[] = ep.parameters
      .filter((p) => p.in === 'query')
      .map((p) => ({
        name: p.name,
        in: 'query' as const,
        required: p.required,
        constraints: [paramToConstraint(p)],
        description: p.description,
      }));

    // Request body model
    const requestBody: BodyModel | undefined = ep.requestBody
      ? {
          contentType: ep.requestBody.contentType,
          schema: ep.requestBody.schema,
          example: ep.requestBody.example,
          examples: ep.requestBody.examples,
          required: ep.requestBody.required,
          requiredPaths: SwaggerSchemaExtractor.flattenRequiredPaths(ep.requestBody.schema),
        }
      : undefined;

    // Response models
    const responses: ResponseModel[] = ep.responses.map((r) => ({
      statusCode: r.statusCode,
      description: r.description,
      schema: r.schema,
      contentType: r.schema ? 'application/json' : undefined,
    }));

    // x-depends-on Swagger extension
    const epRaw = ep as unknown as Record<string, unknown>;
    const xDependsOnRaw = epRaw['x-depends-on'];
    const xDependsOn: string[] | undefined = Array.isArray(xDependsOnRaw)
      ? xDependsOnRaw.filter((v): v is string => typeof v === 'string')
      : undefined;

    return {
      operationId: ep.operationId,
      method: ep.method as HttpMethod,
      path: ep.path,
      pathParams,
      queryParams,
      headerParams: {
        required: classification.requiredParams,
        optional: classification.optionalParams,
        ambient: {
          // auth.required is the authoritative source — per-endpoint security:[] override wins
          token: auth.required,
          language: !!classification.ambient.language,
          timezone: !!classification.ambient.timezone,
        },
      },
      requestBody,
      responses,
      auth,
      constraints: allConstraints,
      fieldExamples,
      bodyExamples,
      xDependsOn,
      deprecated: ep.deprecated,
      source: 'swagger',
      summary: ep.summary,
      tags: ep.tags,
    };
  });
}

function paramToConstraint(p: SwaggerParameter): FieldConstraint {
  const schema = (p.schema ?? {}) as Record<string, unknown>;
  const schemaType = typeof schema['type'] === 'string' ? schema['type'] : 'string';
  const c: FieldConstraint = {
    path: p.name,
    type: schemaType,
    required: p.required,
  };
  if (p.format) c.format = p.format;
  if (p.minimum !== undefined) c.min = p.minimum;
  if (p.maximum !== undefined) c.max = p.maximum;
  if (p.minLength !== undefined) c.minLength = p.minLength;
  if (p.maxLength !== undefined) c.maxLength = p.maxLength;
  if (p.pattern) c.pattern = p.pattern;
  if (p.enum) c.enum = p.enum;
  if (p.example !== undefined) c.example = p.example;
  if (p.default !== undefined) c.default = p.default;
  return c;
}
