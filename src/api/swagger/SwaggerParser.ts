import * as fs from 'node:fs';
import * as path from 'node:path';

// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
const SwaggerParserLib = require('@apidevtools/swagger-parser');

// ─── Public interfaces ───────────────────────────────────────────────────────

export interface SwaggerParameter {
  name: string;
  in: 'path' | 'query' | 'header' | 'body' | 'formData' | 'cookie';
  required: boolean;
  schema?: Record<string, unknown>;
  description?: string;
}

export interface SwaggerRequestBody {
  required: boolean;
  contentType: string;
  schema: Record<string, unknown>;
  example?: Record<string, unknown>;
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
}

export interface SwaggerGroup {
  /** PascalCase group name derived from the tag, e.g. 'GiftList', 'User' */
  groupName: string;
  /** Original tag string lowercased/slugified for file naming, e.g. 'gift-list', 'user' */
  tagSlug: string;
  endpoints: SwaggerEndpoint[];
}

export interface SwaggerParserResult {
  title: string;
  version: string;
  baseUrl: string;
  groups: SwaggerGroup[];
  securitySchemes: Record<string, unknown>;
}

// ─── HTTP methods we care about ──────────────────────────────────────────────

const SUPPORTED_METHODS = new Set(['get', 'post', 'put', 'patch', 'delete', 'head', 'options']);

// ─── SwaggerParser ───────────────────────────────────────────────────────────

export class SwaggerParser {
  /**
   * Parse a Swagger/OpenAPI spec from a local file path or https:// URL.
   * Handles OAS 3.x and Swagger 2.x. Resolves all $ref references inline.
   */
  static async parse(input: string): Promise<SwaggerParserResult> {
    const doc = await SwaggerParser.loadDocument(input);
    const endpoints = SwaggerParser.extractEndpoints(doc);
    const groups = SwaggerParser.groupByTag(endpoints);
    const baseUrl = SwaggerParser.extractBaseUrl(doc);
    const securitySchemes = SwaggerParser.extractSecuritySchemes(doc);

    const info = (doc as Record<string, unknown>)['info'] as Record<string, string> | undefined;

    return {
      title: info?.['title'] ?? 'API',
      version: info?.['version'] ?? '1.0.0',
      baseUrl,
      groups,
      securitySchemes,
    };
  }

  // ─── Private: load & validate ──────────────────────────────────────────────

  private static async loadDocument(input: string): Promise<unknown> {
    const isUrl = input.startsWith('http://') || input.startsWith('https://');
    if (!isUrl && !fs.existsSync(input)) {
      throw new Error(`Swagger spec not found: ${path.resolve(input)}`);
    }
    // swagger-parser dereferences all $ref and validates the spec
    return SwaggerParserLib.dereference(input);
  }

  // ─── Private: endpoint extraction ─────────────────────────────────────────

  private static extractEndpoints(doc: unknown): SwaggerEndpoint[] {
    const d = doc as Record<string, unknown>;
    const paths = d['paths'] as Record<string, Record<string, unknown>> | undefined;
    if (!paths) return [];

    const isOas3 = typeof d['openapi'] === 'string';
    const endpoints: SwaggerEndpoint[] = [];

    for (const [urlPath, methods] of Object.entries(paths)) {
      if (!methods || typeof methods !== 'object') continue;

      // Collect path-level parameters (inherited by all methods)
      const pathLevelParams = SwaggerParser.normalizeParameters(
        (methods['parameters'] ?? []) as unknown[],
        isOas3,
      );

      for (const [httpMethod, operation] of Object.entries(methods)) {
        if (!SUPPORTED_METHODS.has(httpMethod)) continue;
        const op = operation as Record<string, unknown>;

        const method = httpMethod.toUpperCase() as SwaggerEndpoint['method'];
        const tags = Array.isArray(op['tags']) ? (op['tags'] as string[]) : [];

        // Merge path-level params with operation-level params (operation wins on name clash)
        const opParams = SwaggerParser.normalizeParameters(
          (op['parameters'] ?? []) as unknown[],
          isOas3,
        );
        const mergedParams = SwaggerParser.mergeParameters(pathLevelParams, opParams);

        const requestBody = isOas3
          ? SwaggerParser.extractRequestBodyOas3(op['requestBody'])
          : SwaggerParser.extractRequestBodySwagger2(mergedParams);

        const responses = SwaggerParser.normalizeResponses(op['responses'], isOas3);

        // Generate operationId if missing
        const operationId =
          typeof op['operationId'] === 'string' && op['operationId']
            ? op['operationId']
            : SwaggerParser.generateOperationId(httpMethod, urlPath);

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
        });
      }
    }

    return endpoints;
  }

  // ─── Private: parameter normalization ─────────────────────────────────────

  private static normalizeParameters(params: unknown[], _isOas3: boolean): SwaggerParameter[] {
    if (!Array.isArray(params)) return [];
    return params
      .filter((p): p is Record<string, unknown> => !!p && typeof p === 'object')
      .map((p) => ({
        name: String(p['name'] ?? ''),
        in: (p['in'] as SwaggerParameter['in']) ?? 'query',
        required: p['required'] === true,
        schema: (p['schema'] as Record<string, unknown>) ?? undefined,
        description: typeof p['description'] === 'string' ? p['description'] : undefined,
      }));
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

  // ─── Private: request body ─────────────────────────────────────────────────

  private static extractRequestBodyOas3(requestBody: unknown): SwaggerRequestBody | undefined {
    if (!requestBody || typeof requestBody !== 'object') return undefined;
    const rb = requestBody as Record<string, unknown>;
    const content = rb['content'] as Record<string, unknown> | undefined;
    if (!content) return undefined;

    // Prefer application/json; fall back to first content type
    const contentType =
      Object.keys(content).find((k) => k.includes('json')) ?? Object.keys(content)[0];
    if (!contentType) return undefined;

    const mediaType = content[contentType] as Record<string, unknown>;
    const schema = (mediaType?.['schema'] as Record<string, unknown>) ?? {};
    const example = mediaType?.['example'] as Record<string, unknown> | undefined;

    return {
      required: rb['required'] === true,
      contentType,
      schema,
      example,
    };
  }

  private static extractRequestBodySwagger2(
    params: SwaggerParameter[],
  ): SwaggerRequestBody | undefined {
    const bodyParam = params.find((p) => p.in === 'body');
    if (!bodyParam) return undefined;
    return {
      required: bodyParam.required,
      contentType: 'application/json',
      schema: bodyParam.schema ?? {},
      example: undefined,
    };
  }

  // ─── Private: response normalization ──────────────────────────────────────

  private static normalizeResponses(responses: unknown, isOas3: boolean): SwaggerResponseSchema[] {
    if (!responses || typeof responses !== 'object') return [];
    const result: SwaggerResponseSchema[] = [];

    for (const [code, resp] of Object.entries(responses as Record<string, unknown>)) {
      const statusCode = parseInt(code, 10);
      if (isNaN(statusCode)) continue;

      const r = resp as Record<string, unknown>;
      let schema: Record<string, unknown> | undefined;

      if (isOas3) {
        const content = r['content'] as Record<string, unknown> | undefined;
        if (content) {
          const mediaKey =
            Object.keys(content).find((k) => k.includes('json')) ?? Object.keys(content)[0];
          if (mediaKey) {
            const media = content[mediaKey] as Record<string, unknown>;
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

  // ─── Private: grouping ────────────────────────────────────────────────────

  private static groupByTag(endpoints: SwaggerEndpoint[]): SwaggerGroup[] {
    const map = new Map<string, SwaggerEndpoint[]>();

    for (const ep of endpoints) {
      // An endpoint can have multiple tags — assign to first tag only
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

  // ─── Private: base URL extraction ─────────────────────────────────────────

  private static extractBaseUrl(doc: unknown): string {
    const d = doc as Record<string, unknown>;

    // OAS 3: doc.servers[0].url
    if (typeof d['openapi'] === 'string') {
      const servers = d['servers'] as Array<{ url: string }> | undefined;
      if (servers?.[0]?.url) return servers[0].url.replace(/\/$/, '');
    }

    // Swagger 2: scheme + host + basePath
    const schemes = d['schemes'] as string[] | undefined;
    const scheme = schemes?.[0] ?? 'https';
    const host = typeof d['host'] === 'string' ? d['host'] : 'api.example.com';
    const basePath = typeof d['basePath'] === 'string' ? d['basePath'] : '';
    return `${scheme}://${host}${basePath}`.replace(/\/$/, '');
  }

  // ─── Private: security schemes ────────────────────────────────────────────

  private static extractSecuritySchemes(doc: unknown): Record<string, unknown> {
    const d = doc as Record<string, unknown>;

    // OAS 3
    const components = d['components'] as Record<string, unknown> | undefined;
    if (components?.['securitySchemes']) {
      return components['securitySchemes'] as Record<string, unknown>;
    }

    // Swagger 2
    const securityDefs = d['securityDefinitions'] as Record<string, unknown> | undefined;
    return securityDefs ?? {};
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

  // ─── Private: string helpers ──────────────────────────────────────────────

  /**
   * Convert tag string to PascalCase group name.
   * 'gift-list' → 'GiftList', 'user_accounts' → 'UserAccounts', 'orders' → 'Orders'
   */
  static toPascalCase(tag: string): string {
    return tag
      .replace(/[_\-\s]+(.)/g, (_, c: string) => c.toUpperCase())
      .replace(/^(.)/, (c: string) => c.toUpperCase());
  }

  /** Convert tag to lowercase slug for file names. 'Gift List' → 'gift-list' */
  static toSlug(tag: string): string {
    return tag
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '');
  }

  /**
   * Generate a fallback operationId when the spec omits one.
   * 'get /users/{id}' → 'getUsers'
   */
  private static generateOperationId(method: string, urlPath: string): string {
    const segments = urlPath
      .split('/')
      .filter(Boolean)
      .filter((s) => !s.startsWith('{'))
      .map((s) => s.charAt(0).toUpperCase() + s.slice(1));
    return method.toLowerCase() + segments.join('');
  }
}
