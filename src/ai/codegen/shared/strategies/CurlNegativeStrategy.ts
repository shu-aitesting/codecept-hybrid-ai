import type { EndpointModel } from '../EndpointModel';
import { makePlanId, TestCasePlan } from '../TestCasePlan';
import type { PlannerStrategy } from '../TestCasePlanner';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH']);

const EMAIL_RE = /email|mail/i;
const URL_RE = /url|uri/i;
const PHONE_RE = /phone|mobile/i;

export class CurlNegativeStrategy implements PlannerStrategy {
  planNegative(ep: EndpointModel): TestCasePlan[] {
    if (!MUTATING_METHODS.has(ep.method)) return [];
    if (!ep.requestBody || ep.requestBody.contentType !== 'application/json') return [];

    const plans: TestCasePlan[] = [];
    const requiredPaths = ep.requestBody.requiredPaths;

    // 1 plan: missing first required field
    if (requiredPaths.length > 0) {
      const firstRequired = requiredPaths[0];
      plans.push({
        id: makePlanId(ep.operationId, 'negative-validation', firstRequired, 'missing-required'),
        kind: 'negative-validation',
        endpoint: ep,
        tags: ['@negative-validation'],
        expectedStatus: 400,
        mutation: { path: firstRequired, kind: 'missing-required' },
      });
    }

    // Heuristic format plans (max 1 per heuristic, cap total at 2)
    if (plans.length < 2 && ep.requestBody.schema) {
      const properties = (ep.requestBody.schema as Record<string, unknown>)['properties'] as
        | Record<string, unknown>
        | undefined;

      if (properties) {
        const covered = new Set(plans.map((p) => p.mutation?.path));

        for (const key of Object.keys(properties)) {
          if (plans.length >= 2) break;
          if (covered.has(key)) continue;

          if (EMAIL_RE.test(key) || URL_RE.test(key) || PHONE_RE.test(key)) {
            plans.push({
              id: makePlanId(ep.operationId, 'negative-validation', key, 'invalid-pattern'),
              kind: 'negative-validation',
              endpoint: ep,
              tags: ['@negative-validation'],
              expectedStatus: 400,
              mutation: { path: key, kind: 'invalid-pattern' },
            });
            covered.add(key);
          }
        }
      }
    }

    return plans;
  }
}
