import type { EndpointModel } from './EndpointModel';
import { makePlanId, TestCasePlan } from './TestCasePlan';

export interface PlannerStrategy {
  planNegative(ep: EndpointModel): TestCasePlan[];
}

export interface PlannerOpts {
  /** Extra header names (beyond ambient language/timezone) to generate @negative-headers tests for */
  requiredHeaders?: string[];
  /** Which auth negative cases to emit for apiKey endpoints (default: 'both') */
  authNegativeCases?: 'missing' | 'invalid' | 'both';
}

export class TestCasePlanner {
  constructor(
    private readonly strategy: PlannerStrategy,
    private readonly opts: PlannerOpts = {},
  ) {}

  /** Plan test cases for a single endpoint. */
  plan(ep: EndpointModel): TestCasePlan[] {
    // --- Skip rules (4.5) ---
    // x-internal / x-no-test: endpoint carries these as extra fields via spread
    const epAny = ep as unknown as Record<string, unknown>;
    if (epAny['x-internal'] === true || epAny['x-no-test'] === true) return [];
    if (ep.method === 'OPTIONS') return [];

    const plans: TestCasePlan[] = [];

    // First 2xx response (may be undefined for edge-case specs)
    const resp2xx = ep.responses.find((r) => r.statusCode >= 200 && r.statusCode < 300);

    // --- Positive plan (4.2) ---
    const positiveTags: string[] = ['@positive', '@contract'];
    if (!ep.deprecated) positiveTags.push('@smoke');
    if (resp2xx?.schema) positiveTags.push('@schema');
    if (ep.deprecated) positiveTags.push('@deprecated');

    plans.push({
      id: makePlanId(ep.operationId, 'positive'),
      kind: 'positive',
      endpoint: ep,
      tags: positiveTags,
      expectedStatus: resp2xx?.statusCode ?? 200,
      contentTypeAssertion: resp2xx?.contentType,
      schemaAssertion: resp2xx?.schema,
      dependencies: ep.xDependsOn ? [...ep.xDependsOn] : undefined,
    });

    // --- Negative-validation from strategy ---
    // Skip entirely when body content-type is non-JSON (strategy checks internally too, but
    // we also guard here so no negative plans are generated for form/multipart endpoints).
    if (
      !ep.requestBody ||
      ep.requestBody.contentType === 'application/json' ||
      ep.method === 'DELETE'
    ) {
      plans.push(...this.strategy.planNegative(ep));
    }

    // --- Negative-auth plans (4.2) ---
    // Only for apiKey scheme; oauth2/openIdConnect skipped per 4.5
    if (ep.auth.required && ep.auth.scheme === 'apiKey') {
      const authNeg = this.opts.authNegativeCases ?? 'both';

      if (authNeg === 'missing' || authNeg === 'both') {
        plans.push({
          id: makePlanId(ep.operationId, 'negative-auth-missing'),
          kind: 'negative-auth-missing',
          endpoint: ep,
          tags: ['@negative-auth-missing'],
          expectedStatus: 401,
          mutation: { path: ep.auth.headerName, kind: 'missing-token' },
        });
      }

      if (authNeg === 'invalid' || authNeg === 'both') {
        plans.push({
          id: makePlanId(ep.operationId, 'negative-auth-invalid'),
          kind: 'negative-auth-invalid',
          endpoint: ep,
          tags: ['@negative-auth-invalid'],
          expectedStatus: 401,
          mutation: { path: ep.auth.headerName, kind: 'invalid-token' },
        });
      }
    }

    // --- Negative-headers plans (4.2) ---
    if (ep.headerParams.ambient.language) {
      plans.push({
        id: makePlanId(ep.operationId, 'negative-headers', 'language', 'missing-header'),
        kind: 'negative-headers',
        endpoint: ep,
        tags: ['@negative-headers'],
        expectedStatus: 400,
        mutation: { path: 'language', kind: 'missing-header' },
      });
    }

    if (ep.headerParams.ambient.timezone) {
      plans.push({
        id: makePlanId(ep.operationId, 'negative-headers', 'timezone', 'missing-header'),
        kind: 'negative-headers',
        endpoint: ep,
        tags: ['@negative-headers'],
        expectedStatus: 400,
        mutation: { path: 'timezone', kind: 'missing-header' },
      });
    }

    // opts.requiredHeaders: manual override for extra headers to test
    for (const header of this.opts.requiredHeaders ?? []) {
      const alreadyCovered = plans.some(
        (p) => p.kind === 'negative-headers' && p.mutation?.path === header,
      );
      if (!alreadyCovered) {
        plans.push({
          id: makePlanId(ep.operationId, 'negative-headers', header, 'missing-header'),
          kind: 'negative-headers',
          endpoint: ep,
          tags: ['@negative-headers'],
          expectedStatus: 400,
          mutation: { path: header, kind: 'missing-header' },
        });
      }
    }

    return plans;
  }

  /**
   * Plan all endpoints in topological dependency order (4.10).
   * Throws if xDependsOn forms a cycle.
   */
  planAll(endpoints: EndpointModel[]): { plans: TestCasePlan[]; executionOrder: string[] } {
    const executionOrder = this.topoSort(endpoints);
    const ordered = executionOrder.map((id) => endpoints.find((e) => e.operationId === id)!);

    const plans: TestCasePlan[] = [];
    for (const ep of ordered) {
      plans.push(...this.plan(ep));
    }
    return { plans, executionOrder };
  }

  // --- Kahn's topological sort ---
  private topoSort(endpoints: EndpointModel[]): string[] {
    const ids = new Set(endpoints.map((e) => e.operationId));
    const inDegree = new Map<string, number>(endpoints.map((e) => [e.operationId, 0]));
    const adj = new Map<string, string[]>(endpoints.map((e) => [e.operationId, []]));

    for (const ep of endpoints) {
      for (const dep of ep.xDependsOn ?? []) {
        if (!ids.has(dep)) continue; // external dep — ignore
        adj.get(dep)!.push(ep.operationId);
        inDegree.set(ep.operationId, (inDegree.get(ep.operationId) ?? 0) + 1);
      }
    }

    const queue = [...inDegree.entries()]
      .filter(([, deg]) => deg === 0)
      .map(([id]) => id)
      .sort();

    const order: string[] = [];
    while (queue.length > 0) {
      const node = queue.shift()!;
      order.push(node);
      const neighbours = (adj.get(node) ?? []).sort();
      for (const neighbour of neighbours) {
        const newDeg = (inDegree.get(neighbour) ?? 0) - 1;
        inDegree.set(neighbour, newDeg);
        if (newDeg === 0) {
          queue.push(neighbour);
          queue.sort();
        }
      }
    }

    if (order.length !== endpoints.length) {
      const remaining = endpoints.map((e) => e.operationId).filter((id) => !order.includes(id));
      const cycle = this.detectCycle(remaining, adj);
      throw new Error(`Cycle detected: ${cycle.join(' → ')}`);
    }

    return order;
  }

  private detectCycle(nodes: string[], adj: Map<string, string[]>): string[] {
    const visited = new Set<string>();
    const stack: string[] = [];

    const dfs = (node: string): string[] | null => {
      if (stack.includes(node)) {
        const start = stack.indexOf(node);
        return [...stack.slice(start), node];
      }
      if (visited.has(node)) return null;
      visited.add(node);
      stack.push(node);
      for (const neighbour of adj.get(node) ?? []) {
        const cycle = dfs(neighbour);
        if (cycle) return cycle;
      }
      stack.pop();
      return null;
    };

    for (const node of nodes) {
      const cycle = dfs(node);
      if (cycle) return cycle;
    }
    return nodes.slice(0, 2).concat([nodes[0] ?? '']);
  }
}
