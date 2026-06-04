import { z } from 'zod';

export const CreatePostDto = z.object({
  content: z.string().min(1, 'Content is required'),
  communityId: z.string().uuid('Valid community ID required'),
  type: z.enum(['GENERAL', 'HELP', 'EMERGENCY']).optional(),
  images: z.array(z.string()).optional(),
});

export const UpdatePostDto = CreatePostDto.partial();

export const ListPostsQueryDto = z.object({
  communityId: z.string().uuid().optional(),
  type: z.enum(['GENERAL', 'HELP', 'EMERGENCY']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const AddCommentDto = z.object({
  content: z.string().min(1, 'Comment content is required'),
});

export const PaginationQueryDto = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type CreatePostDtoType = z.infer<typeof CreatePostDto>;
export type ListPostsQueryDtoType = z.infer<typeof ListPostsQueryDto>;
