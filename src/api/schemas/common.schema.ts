import { z } from 'zod';

export const IsoDateString = z.string().datetime({ offset: true });

export const BaseErrorSchema = z.object({
  message: z.string(),
  code: z.string().optional(),
  status: z.number().int().optional(),
});

export const PaginationSchema = z.object({
  page: z.number().int().min(1),
  limit: z.number().int().min(1),
  total: z.number().int().min(0),
  totalPages: z.number().int().min(0).optional(),
});
