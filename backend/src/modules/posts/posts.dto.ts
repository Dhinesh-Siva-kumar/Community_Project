import { z } from 'zod';

export const CreatePostDto = z.object({
  content: z.string().min(1, 'Content is required'),
  communityId: z.string().uuid('Valid community ID required'),
  type: z.enum(['GENERAL', 'HELP', 'EMERGENCY', 'ENQUIRY']).optional(),
  images: z
    .union([z.array(z.string()), z.string()])
    .transform((value) => (typeof value === 'string' ? [value] : value))
    .optional(),
});

export const UpdatePostDto = CreatePostDto.partial();

export const UpdatePostBodyDto = CreatePostDto.omit({ communityId: true }).partial();

export const ListPostsQueryDto = z.object({
  communityId: z.string().uuid().optional(),
  type: z.enum(['GENERAL', 'HELP', 'EMERGENCY', 'ENQUIRY']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const ListPendingPostsQueryDto = z.object({
  page:     z.coerce.number().int().min(1).default(1),
  limit:    z.coerce.number().int().min(1).max(100).default(20),
  search:   z.string().optional(),
  country:  z.string().optional(),
  type:     z.enum(['GENERAL', 'HELP', 'EMERGENCY', 'ENQUIRY']).optional(),
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'dateFrom must be YYYY-MM-DD').optional(),
  dateTo:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'dateTo must be YYYY-MM-DD').optional(),
  sortBy:   z.enum(['joined', 'community']).default('joined'),
  sortDir:  z.enum(['asc', 'desc']).default('desc'),
  authorStatus: z.enum(['trusted', 'untrusted']).optional(),
});

export const ListMyPostsQueryDto = z.object({
  page:   z.coerce.number().int().min(1).default(1),
  limit:  z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED']).optional(),
  communityId: z.string().uuid().optional(),
});

export const RejectPostDto = z.object({
  reason: z.string().trim().max(500).optional(),
});

export const AddCommentDto = z.object({
  content: z.string().min(1, 'Comment content is required'),
});

export const PaginationQueryDto = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type CreatePostDtoType = z.infer<typeof CreatePostDto>;
export type UpdatePostBodyDtoType = z.infer<typeof UpdatePostBodyDto>;
export type ListPostsQueryDtoType = z.infer<typeof ListPostsQueryDto>;
export type ListPendingPostsQueryDtoType = z.infer<typeof ListPendingPostsQueryDto>;
export type ListMyPostsQueryDtoType = z.infer<typeof ListMyPostsQueryDto>;
export type RejectPostDtoType = z.infer<typeof RejectPostDto>;
