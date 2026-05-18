import { z } from 'zod';

export interface EnrichedPlan {
  planId: string;
  title: string;
}

export const EnrichedPlanArraySchema = z.array(
  z.object({
    planId: z.string(),
    title: z.string().min(5).max(80),
  }),
);
