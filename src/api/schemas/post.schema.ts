import { z } from 'zod';

export const PostSchema = z.object({
  id: z.number().int().positive(),
  userId: z.number().int().positive(),
  title: z.string().min(1),
  body: z.string().min(1),
});

export const PostListSchema = z.array(PostSchema);

export const CreatePostRequestSchema = z.object({
  userId: z.number().int().positive(),
  title: z.string().min(1),
  body: z.string().min(1),
});

export type Post = z.infer<typeof PostSchema>;
export type CreatePostRequest = z.infer<typeof CreatePostRequestSchema>;
