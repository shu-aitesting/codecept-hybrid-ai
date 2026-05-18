import type { FieldConstraint } from '@api/swagger/SwaggerSchemaExtractor';

import type { EndpointModel } from '../EndpointModel';
import { makePlanId, MutationKind, TestCasePlan } from '../TestCasePlan';
import type { PlannerStrategy } from '../TestCasePlanner';

function constraintPriority(c: FieldConstraint): number {
  if (c.required) return 5;
  if (c.pattern) return 4;
  if (c.enum) return 3;
  if (c.min !== undefined || c.max !== undefined) return 2;
  if (c.minLength !== undefined || c.maxLength !== undefined) return 1;
  return 0;
}

function mutationKindFor(c: FieldConstraint): MutationKind {
  if (c.required) return 'missing-required';
  if (c.pattern) return 'invalid-pattern';
  if (c.enum) return 'invalid-enum';
  if (c.min !== undefined || c.max !== undefined) return 'out-of-range';
  return 'over-length';
}

export class SwaggerNegativeStrategy implements PlannerStrategy {
  planNegative(ep: EndpointModel): TestCasePlan[] {
    // DELETE with path params: non-existent resource → 404
    if (ep.method === 'DELETE' && ep.pathParams.length > 0) {
      const pathParam = ep.pathParams[0];
      return [
        {
          id: makePlanId(ep.operationId, 'negative-validation', pathParam.name, 'missing-required'),
          kind: 'negative-validation',
          endpoint: ep,
          tags: ['@negative-validation'],
          expectedStatus: 404,
          mutation: {
            path: pathParam.name,
            kind: 'missing-required',
            constraint: pathParam.constraints[0],
          },
        },
      ];
    }

    // Non-JSON body: skip validation tests
    if (ep.requestBody && ep.requestBody.contentType !== 'application/json') {
      return [];
    }

    // No constraints: nothing to test
    if (ep.constraints.length === 0) return [];

    // Pick single highest-priority constraint
    const best = ep.constraints
      .slice()
      .sort((a, b) => constraintPriority(b) - constraintPriority(a))[0];

    if (constraintPriority(best) === 0) return [];

    const mutKind = mutationKindFor(best);

    return [
      {
        id: makePlanId(ep.operationId, 'negative-validation', best.path, mutKind),
        kind: 'negative-validation',
        endpoint: ep,
        tags: ['@negative-validation'],
        expectedStatus: 400,
        mutation: {
          path: best.path,
          kind: mutKind,
          constraint: best,
        },
      },
    ];
  }
}
