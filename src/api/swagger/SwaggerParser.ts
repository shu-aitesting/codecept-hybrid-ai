import * as fs from 'node:fs';
import * as path from 'node:path';

// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
const SwaggerParserLib = require('@apidevtools/swagger-parser');

// --- Public interfaces ---

export interface SwaggerParameter {
  name: string;
  in: 'path' | 'query' | 'header' | 'body' | 'formData' | 'cookie';
  required: boolean;
  schema?: Record<string, unknown>;
  description?: string;
  // Constraint fields (2.2) — from schema sub-object (OAS3) or param directly (Swagger 2)
  enum?: unknown[];
  format?: string;
  pattern?: string;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  example?: unknown;
  default?: unknown;
}

export interface SwaggerRequestBody {
  required: boolean;
  // Back-compat shorthand — first JSON content type
  contentType: string;
  schema: Record<string, unknown>;
  example?: unknown;
  // Full contents map (2.3) — all media types
  contents: Record<string, { schema: Record<string, unknown>; example?: unknown }>;
  // Collected examples from all media types (2.12)
  examples?: unknown[];
}

export interface SwaggerResponseSchema {
  statusCode: number;
  description: string;
  schema?: Record<string, unknown>;
}

export interface SwaggerEndpoint {
  operationId: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';
  path: string;
  summary?: string;
  description?: string;
  tags: string[];
  parameters: SwaggerParameter[];
  requestBody?: SwaggerRequestBody;
  responses: SwaggerResponseSchema[];
  security?: Array<Record<string, string[]>>;
  deprecated: boolean;
  /** True when the endpoint requires multipart/form-data or binary file upload. */
  isFileUpload: boolean;
}

export interface SwaggerGroup {
  groupName: string;
  tagSlug: string;
  endpoints: SwaggerEndpoint[];
}

export interface SwaggerParserResult {
  title: string;
  version: string;
  baseUrl: string;
  groups: SwaggerGroup[];
  securitySchemes: Record<string, unknown>;
  globalSecurity?: Array<Record<string, string[]>>;
}

const SUPPORTED_METHODS = new Set(['get', 'post', 'put', 'patch', 'delete', 'head', 'options']);

export class SwaggerParser {
  /**
   * Parse a Swagger/OpenAPI spec from a local file path or https:// URL.
   * Validates the spec, resolves all $ref references inline, and warns on circular refs.
   */
  static async parse(input: string): Promise<SwaggerParserResult> {
    const doc = await SwaggerParser.loadDocument(input);
    const endpoints = SwaggerParser.extractEndpoints(doc);
    const groups = SwaggerParser.groupByTag(endpoints);
    const baseUrl = SwaggerParser.extractBaseUrl(doc);
    const securitySchemes = SwaggerParser.extractSecuritySchemes(doc);
    const globalSecurity = SwaggerParser.extractGlobalSecurity(doc);
    const info = (doc as Record<string, unknown>)['info'] as Record<string, string> | undefined;

    return {
      title: info?.['title'] ?? 'API',
      version: info?.['version'] ?? '1.0.0',
      baseUrl,
      groups,
      securitySchemes,
      globalSecurity,
    };
  }

  // (2.4 + 2.5) Validate spec first, then dereference via instance to detect circular refs
  private static async loadDocument(input: string): Promise<unknown> {
    const isUrl = input.startsWith('http://') || input.startsWith('https://');
    if (!isUrl && !fs.existsSync(input)) {
      throw new Error(`Swagger spec not found: ${path.resolve(input)}`);
    }

    try {
      await SwaggerParserLib.validate(input);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Swagger spec validation failed for "${input}": ${msg}`);
    }

    // Use an instance to inspect $refs.circular after dereference
    const parser = new SwaggerParserLib();
    const api = await parser.dereference(input, {
      dereference: { circular: 'ignore' },
    });

    if (parser.$refs.circular) {
      console.warn(
        `[SwaggerParser] Circular $ref detected in "${input}". ` +
          `Circular nodes will be treated as empty objects during extraction.`,
      );
    }

    return api;
  }

  private static extractEndpoints(doc: unknown): SwaggerEndpoint[] {
    const d = doc as Record<string, unknown>;
    const paths = d['paths'] as Record<string, Record<string, unknown>> | undefined;
    if (!paths) return [];

    const isOas3 = typeof d['openapi'] === 'string';
    const endpoints: SwaggerEndpoint[] = [];

    for (const [urlPath, methods] of Object.entries(paths)) {
      if (!methods || typeof methods !== 'object') continue;

      const pathLevelParams = SwaggerParser.normalizeParameters(
        (methods['parameters'] ?? []) as unknown[],
        isOas3,
      );

      for (const [httpMethod, operation] of Object.entries(methods)) {
        if (!SUPPORTED_METHODS.has(httpMethod)) continue;

        const op = operation as Record<string, unknown>;
        const method = httpMethod.toUpperCase() as SwaggerEndpoint['method'];
        const tags = Array.isArray(op['tags']) ? (op['tags'] as string[]) : [];

        const opParams = SwaggerParser.normalizeParameters(
          (op['parameters'] ?? []) as unknown[],
          isOas3,
        );
        const mergedParams = SwaggerParser.mergeParameters(pathLevelParams, opParams);

        const requestBody = isOas3
          ? SwaggerParser.extractRequestBodyOas3(op['requestBody'])
          : SwaggerParser.extractRequestBodySwagger2(mergedParams);

        const responses = SwaggerParser.normalizeResponses(op['responses'], isOas3);

        const operationId =
          typeof op['operationId'] === 'string' && op['operationId']
            ? op['operationId']
            : SwaggerParser.generateOperationId(httpMethod, urlPath);

        // Detect file-upload endpoints:
        // - OAS3: requestBody content contains multipart/form-data
        // - Swagger 2: any param with in:formData and type:file or format:binary
        const isFileUpload = isOas3
          ? Object.keys(
              ((op['requestBody'] as Record<string, unknown> | undefined)?.['content'] ??
                {}) as Record<string, unknown>,
            ).some((ct) => ct.includes('multipart') || ct.includes('octet-stream'))
          : ((op['parameters'] as unknown[] | undefined) ?? []).some((p) => {
              const param = p as Record<string, unknown>;
              return (
                param['in'] === 'formData' &&
                (param['type'] === 'file' || param['format'] === 'binary')
              );
            });

        endpoints.push({
          operationId,
          method,
          path: urlPath,
          summary: typeof op['summary'] === 'string' ? op['summary'] : undefined,
          description: typeof op['description'] === 'string' ? op['description'] : undefined,
          tags: tags.length > 0 ? tags : ['Default'],
          parameters: isOas3
            ? mergedParams
            : mergedParams.filter((p) => p.in !== 'body' && p.in !== 'formData'),
          requestBody,
          responses,
          security: Array.isArray(op['security'])
            ? (op['security'] as Array<Record<string, string[]>>)
            : undefined,
          deprecated: op['deprecated'] === true,
          isFileUpload,
        });
      }
    }

    return endpoints;
  }

  // (2.2) Extract constraint fields from schema sub-object (OAS3) or param directly (Swagger 2)
  private static normalizeParameters(params: unknown[], isOas3: boolean): SwaggerParameter[] {
    if (!Array.isArray(params)) return [];
    return params
      .filter((p): p is Record<string, unknown> => !!p && typeof p === 'object')
      .map((p) => {
        const schema = (p['schema'] as Record<string, unknown>) ?? {};
        // OAS3: constraints are nested in schema; Swagger 2: constraints are on the param itself
        const src = isOas3 ? schema : p;

        return {
          name: String(p['name'] ?? ''),
          in: (p['in'] as SwaggerParameter['in']) ?? 'query',
          required: p['required'] === true,
          schema: Object.keys(schema).length > 0 ? schema : undefined,
          description: typeof p['description'] === 'string' ? p['description'] : undefined,
          enum: Array.isArray(src['enum']) ? (src['enum'] as unknown[]) : undefined,
          format: typeof src['format'] === 'string' ? src['format'] : undefined,
          pattern: typeof src['pattern'] === 'string' ? src['pattern'] : undefined,
          minimum: typeof src['minimum'] === 'number' ? src['minimum'] : undefined,
          maximum: typeof src['maximum'] === 'number' ? src['maximum'] : undefined,
          minLength: typeof src['minLength'] === 'number' ? src['minLength'] : undefined,
          maxLength: typeof src['maxLength'] === 'number' ? src['maxLength'] : undefined,
          example:
            src['example'] !== undefined
              ? src['example']
              : p['example'] !== undefined
                ? p['example']
                : undefined,
          default: src['default'],
        };
      });
  }

  private static mergeParameters(
    base: SwaggerParameter[],
    override: SwaggerParameter[],
  ): SwaggerParameter[] {
    const map = new Map<string, SwaggerParameter>();
    for (const p of base) map.set(`${p.in}:${p.name}`, p);
    for (const p of override) map.set(`${p.in}:${p.name}`, p);
    return [...map.values()];
  }

  // (2.3 + 2.12) Build full contents map; collect examples across all media types
  private static extractRequestBodyOas3(requestBody: unknown): SwaggerRequestBody | undefined {
    if (!requestBody || typeof requestBody !== 'object') return undefined;
    const rb = requestBody as Record<string, unknown>;
    const content = rb['content'] as Record<string, unknown> | undefined;
    if (!content) return undefined;

    const contents: Record<string, { schema: Record<string, unknown>; example?: unknown }> = {};
    const allExamples: unknown[] = [];

    for (const [ct, mediaTypeRaw] of Object.entries(content)) {
      const mediaType = (mediaTypeRaw ?? {}) as Record<string, unknown>;
      const schema = (mediaType['schema'] as Record<string, unknown>) ?? {};
      const example = mediaType['example'] as unknown | undefined;

      contents[ct] = { schema, ...(example !== undefined ? { example } : {}) };

      // Collect named examples (OAS3 `examples` object: { name: { value: ... } })
      const examplesObj = mediaType['examples'] as Record<string, unknown> | undefined;
      if (examplesObj) {
        for (const exItem of Object.values(examplesObj)) {
          const ex = exItem as Record<string, unknown> | null;
          if (ex?.['value'] !== undefined) allExamples.push(ex['value']);
        }
      }
      // Collect shorthand `example`
      if (example !== undefined) allExamples.push(example);
    }

    const contentType =
      Object.keys(content).find((k) => k.includes('json')) ?? Object.keys(content)[0];
    if (!contentType) return undefined;

    const primary = contents[contentType];

    return {
      required: rb['required'] === true,
      contentType,
      schema: primary.schema,
      example: primary.example,
      contents,
      ...(allExamples.length > 0 ? { examples: allExamples } : {}),
    };
  }

  private static extractRequestBodySwagger2(
    params: SwaggerParameter[],
  ): SwaggerRequestBody | undefined {
    const bodyParam = params.find((p) => p.in === 'body');
    if (!bodyParam) return undefined;
    const schema = bodyParam.schema ?? {};
    return {
      required: bodyParam.required,
      contentType: 'application/json',
      schema,
      example: undefined,
      contents: { 'application/json': { schema } },
    };
  }

  private static normalizeResponses(responses: unknown, isOas3: boolean): SwaggerResponseSchema[] {
    if (!responses || typeof responses !== 'object') return [];
    const result: SwaggerResponseSchema[] = [];

    for (const [code, resp] of Object.entries(responses as Record<string, unknown>)) {
      const statusCode = parseInt(code, 10);
      if (isNaN(statusCode)) continue;

      const r = resp as Record<string, unknown>;
      let schema: Record<string, unknown> | undefined;

      if (isOas3) {
        const rc = r['content'] as Record<string, unknown> | undefined;
        if (rc) {
          const mediaKey = Object.keys(rc).find((k) => k.includes('json')) ?? Object.keys(rc)[0];
          if (mediaKey) {
            const media = rc[mediaKey] as Record<string, unknown>;
            schema = media?.['schema'] as Record<string, unknown> | undefined;
          }
        }
      } else {
        schema = r['schema'] as Record<string, unknown> | undefined;
      }

      result.push({
        statusCode,
        description: typeof r['description'] === 'string' ? r['description'] : '',
        schema,
      });
    }

    return result.sort((a, b) => a.statusCode - b.statusCode);
  }

  private static groupByTag(endpoints: SwaggerEndpoint[]): SwaggerGroup[] {
    const map = new Map<string, SwaggerEndpoint[]>();
    for (const ep of endpoints) {
      const tag = ep.tags[0] ?? 'Default';
      if (!map.has(tag)) map.set(tag, []);
      map.get(tag)!.push(ep);
    }
    return [...map.entries()].map(([tag, eps]) => ({
      groupName: SwaggerParser.toPascalCase(tag),
      tagSlug: SwaggerParser.toSlug(tag),
      endpoints: eps,
    }));
  }

  private static extractBaseUrl(doc: unknown): string {
    const d = doc as Record<string, unknown>;
    if (typeof d['openapi'] === 'string') {
      const servers = d['servers'] as Array<{ url: string }> | undefined;
      if (servers?.[0]?.url) return servers[0].url.replace(/\/$/, '');
    }
    const schemes = d['schemes'] as string[] | undefined;
    const scheme = schemes?.[0] ?? 'https';
    const host = typeof d['host'] === 'string' ? d['host'] : 'api.example.com';
    const basePath = typeof d['basePath'] === 'string' ? d['basePath'] : '';
    return `${scheme}://${host}${basePath}`.replace(/\/$/, '');
  }

  private static extractSecuritySchemes(doc: unknown): Record<string, unknown> {
    const d = doc as Record<string, unknown>;
    const components = d['components'] as Record<string, unknown> | undefined;
    if (components?.['securitySchemes']) {
      return components['securitySchemes'] as Record<string, unknown>;
    }
    const securityDefs = d['securityDefinitions'] as Record<string, unknown> | undefined;
    return securityDefs ?? {};
  }

  private static extractGlobalSecurity(doc: unknown): Array<Record<string, string[]>> | undefined {
    const d = doc as Record<string, unknown>;
    return Array.isArray(d['security'])
      ? (d['security'] as Array<Record<string, string[]>>)
      : undefined;
  }

  /**
   * Extract HTTP header names from security schemes that send credentials in
   * request headers. Used by the codegen header classifier to mark these as
   * "ambient" so generated services don't redeclare them per method.
   *
   *   - `type: http, scheme: bearer|basic` → `Authorization`
   *   - `type: apiKey, in: header, name: X` → `X`
   *
   * Schemes that don't send headers (oauth2 client-side, openIdConnect,
   * apiKey-in-query, apiKey-in-cookie, mutualTLS) are ignored.
   */
  static extractSecurityHeaderNames(schemes: Record<string, unknown>): string[] {
    const names = new Set<string>();
    for (const scheme of Object.values(schemes ?? {})) {
      if (!scheme || typeof scheme !== 'object') continue;
      const s = scheme as Record<string, unknown>;
      if (s['type'] === 'http') {
        const httpScheme = typeof s['scheme'] === 'string' ? s['scheme'].toLowerCase() : '';
        if (httpScheme === 'bearer' || httpScheme === 'basic') names.add('Authorization');
        continue;
      }
      if (s['type'] === 'apiKey' && s['in'] === 'header' && typeof s['name'] === 'string') {
        names.add(s['name']);
      }
    }
    return [...names];
  }

  /**
   * Convert tag string to PascalCase group name.
   * 'gift-list' → 'GiftList', 'user_accounts' → 'UserAccounts', 'orders' → 'Orders'
   */
  static toPascalCase(tag: string): string {
    return tag
      .replace(/[_\-\s]+(.)/g, (_, c: string) => c.toUpperCase())
      .replace(/^(.)/, (c: string) => c.toUpperCase());
  }

  static toSlug(tag: string): string {
    return tag
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '');
  }

  private static generateOperationId(method: string, urlPath: string): string {
    const segments = urlPath
      .split('/')
      .filter(Boolean)
      .filter((s) => !s.startsWith('{'))
      .map((s) => s.charAt(0).toUpperCase() + s.slice(1));
    return method.toLowerCase() + segments.join('');
  }
}
