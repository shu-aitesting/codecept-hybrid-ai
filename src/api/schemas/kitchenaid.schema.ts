import { z } from 'zod';

export const KitchenaidResponseSchema = z.object({
  id: z.number().int().positive(),
  name: z.string(),
  seoName: z.string(),
  // Add other expected fields based on the actual response
});

export type KitchenaidResponse = z.infer<typeof KitchenaidResponseSchema>;
