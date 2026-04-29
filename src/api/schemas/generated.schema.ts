import { z } from 'zod';

export const BrandResponseSchema = z.object({
  id: z.number().int().positive(),
  seoName: z.string(),
  name: z.string(),
  description: z.string().optional(),
  imageUrl: z.string().url().optional(),
});

export type BrandResponse = z.infer<typeof BrandResponseSchema>;
