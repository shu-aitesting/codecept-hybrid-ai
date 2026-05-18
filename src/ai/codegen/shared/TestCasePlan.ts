import { createHash } from 'node:crypto';

import type { FieldConstraint } from '@api/swagger/SwaggerSchemaExtractor';

import type { EndpointModel } from './EndpointModel';

export type TestKind =
  | 'positive'
  | 'negative-validation'
  | 'negative-auth-missing'
  | 'negative-auth-invalid'
  | 'negative-headers';

export type MutationKind =
  | 'missing-required'
  | 'invalid-pattern'
  | 'invalid-enum'
  | 'out-of-range'
  | 'over-length'
  | 'type-mismatch'
  | 'missing-header'
  | 'missing-token'
  | 'invalid-token';

export interface TestCasePlan {
  id: string;
  kind: TestKind;
  endpoint: EndpointModel;
  tags: string[];
  expectedStatus: number;
  contentTypeAssertion?: string;
  schemaAssertion?: Record<string, unknown>;
  mutation?: {
    path: string;
    kind: MutationKind;
    constraint?: FieldConstraint;
  };
  /** operationId list copied from endpoint.xDependsOn (PR-4.9) */
  dependencies?: string[];
}

/** Stable deterministic ID: sha256(operationId:kind:mutationPath:mutationKind) */
export function makePlanId(
  operationId: string,
  kind: string,
  mutationPath?: string,
  mutationKind?: string,
): string {
  return createHash('sha256')
    .update(`${operationId}:${kind}:${mutationPath ?? ''}:${mutationKind ?? ''}`)
    .digest('hex');
}
