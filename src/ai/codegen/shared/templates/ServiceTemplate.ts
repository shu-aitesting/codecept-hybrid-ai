import type { EndpointModel } from '@ai/codegen/shared/EndpointModel';

import { toPascalCase, toConstCase, schemaToInterface } from './tsRenderer';

export function renderService(
  group: { groupName: string; tagSlug: string },
  endpoints: EndpointModel[],
): string {
  const className = `${toPascalCase(group.groupName)}Service`;

  // Unique base-path constants (strip path params, deduplicate)
  const constMap = buildEndpointConstMap(endpoints);

  // Per-endpoint declarations
  const schemaConsts: string[] = [];
  const interfaces: string[] = [];
  const methods: string[] = [];

  for (const ep of endpoints) {
    const opPascal = toPascalCase(ep.operationId);

    if (ep.requestBody?.schema) {
      interfaces.push(schemaToInterface(`${opPascal}Request`, ep.requestBody.schema));
    }

    const resp2xx = ep.responses.find((r) => r.statusCode >= 200 && r.statusCode < 300 && r.schema);
    if (resp2xx?.schema) {
      schemaConsts.push(
        `export const ${toConstCase(ep.operationId)}_RESPONSE_SCHEMA = ${JSON.stringify(resp2xx.schema, null, 2)} as const;`,
      );
      interfaces.push(schemaToInterface(`${opPascal}Response`, resp2xx.schema));
    }

    methods.push(buildMethod(ep, constMap));
  }

  // Assemble file: each major block separated by a blank line
  const sections: string[][] = [];

  sections.push([
    `import { config } from '@core/config/ConfigLoader';`,
    `import { RestClient } from '@api/rest/RestClient';`,
    `import { RestRequestBuilder } from '@api/rest/RestRequestBuilder';`,
  ]);

  sections.push([...constMap.entries()].map(([k, v]) => `const ${k} = '${v}';`));

  for (const sc of schemaConsts) {
    sections.push([sc]);
  }

  for (const iface of interfaces) {
    sections.push([iface]);
  }

  const classLines: string[] = [
    `export class ${className} {`,
    `  constructor(private readonly client: RestClient) {}`,
  ];
  for (const method of methods) {
    classLines.push('');
    classLines.push(method);
  }
  classLines.push('}');
  sections.push(classLines);

  return sections.map((s) => s.join('\n')).join('\n\n') + '\n';
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildEndpointConstMap(endpoints: EndpointModel[]): Map<string, string> {
  const result = new Map<string, string>();
  const seen = new Set<string>();
  for (const ep of endpoints) {
    const base = extractBasePath(ep.path);
    if (!seen.has(base)) {
      seen.add(base);
      const name = base.replace(/^\//, '').replace(/\//g, '_').toUpperCase() || 'ROOT';
      result.set(`${name}_ENDPOINT`, base);
    }
  }
  return result;
}

function extractBasePath(path: string): string {
  const parts = path.split('/');
  const base: string[] = [];
  for (const part of parts) {
    if (part.startsWith('{')) break;
    base.push(part);
  }
  return base.join('/') || '/';
}

function buildMethodUrl(ep: EndpointModel, constMap: Map<string, string>): string {
  // Replace {param} placeholders with ${param} template expressions
  const withParams = ep.path.replace(/\{([^}]+)\}/g, (_, n: string) => '${' + n + '}');

  let bestConstName = '';
  let bestLen = 0;
  for (const [constName, constPath] of constMap) {
    if (withParams.startsWith(constPath) && constPath.length > bestLen) {
      bestConstName = constName;
      bestLen = constPath.length;
    }
  }

  const constRef = bestConstName ? '${' + bestConstName + '}' : '';
  const remaining = withParams.slice(bestLen);
  return '`' + '${config.apiUrl}' + constRef + remaining + '`';
}

function constraintToTsType(typeName: string | undefined): string {
  switch (typeName) {
    case 'integer':
    case 'number':
      return 'number';
    case 'boolean':
      return 'boolean';
    default:
      return 'string';
  }
}

function buildMethod(ep: EndpointModel, constMap: Map<string, string>): string {
  const opPascal = toPascalCase(ep.operationId);
  const url = buildMethodUrl(ep, constMap);
  const verb = ep.method.toLowerCase();

  const optQueryParams = ep.queryParams.filter((q) => !q.required);
  const reqQueryParams = ep.queryParams.filter((q) => q.required);
  const hasOptional = optQueryParams.length > 0 || ep.headerParams.optional.length > 0;

  // Build parameter list
  const params: string[] = [];

  for (const p of ep.pathParams) {
    params.push(`${p.name}: ${constraintToTsType(p.constraints[0]?.type)}`);
  }
  for (const q of reqQueryParams) {
    params.push(`${q.name}: ${constraintToTsType(q.constraints[0]?.type)}`);
  }
  if (ep.requestBody) {
    const bodyType = ep.requestBody.schema ? `${opPascal}Request` : 'unknown';
    params.push(`body: ${bodyType}`);
  }
  for (const h of ep.headerParams.required) {
    params.push(`${h.paramName}: ${h.type}`);
  }
  if (hasOptional) {
    const optParts: string[] = [];
    for (const q of optQueryParams) {
      optParts.push(`${q.name}?: ${constraintToTsType(q.constraints[0]?.type)}`);
    }
    for (const h of ep.headerParams.optional) {
      optParts.push(`${h.paramName}?: string`);
    }
    params.push(`opts?: { ${optParts.join('; ')} }`);
  }

  const sig = params.join(', ');
  const lines: string[] = [`  async ${ep.operationId}(${sig}) {`];

  if (hasOptional) {
    // Mutable builder — needed for conditional query/header calls
    lines.push(`    const builder = new RestRequestBuilder().${verb}(${url});`);
    if (ep.requestBody) lines.push(`    builder.json(body);`);
    for (const h of ep.headerParams.required) {
      lines.push(`    builder.header('${h.name}', ${h.paramName});`);
    }
    for (const q of optQueryParams) {
      lines.push(
        `    if (opts?.${q.name} !== undefined) builder.query('${q.name}', opts.${q.name}!);`,
      );
    }
    for (const h of ep.headerParams.optional) {
      lines.push(
        `    if (opts?.${h.paramName} !== undefined) builder.header('${h.name}', opts.${h.paramName}!);`,
      );
    }
    lines.push(`    return this.client.send(builder.build());`);
  } else {
    // Fluent chain — simpler when no conditional logic needed
    const chain: string[] = [`    const req = new RestRequestBuilder()`];
    chain.push(`      .${verb}(${url})`);
    if (ep.requestBody) chain.push(`      .json(body)`);
    for (const h of ep.headerParams.required) {
      chain.push(`      .header('${h.name}', ${h.paramName})`);
    }
    chain.push(`      .build();`);
    lines.push(chain.join('\n'));
    lines.push(`    return this.client.send(req);`);
  }

  lines.push(`  }`);
  return lines.join('\n');
}
