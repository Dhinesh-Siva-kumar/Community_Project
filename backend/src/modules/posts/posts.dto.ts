import { z } from 'zod';

// Refined below rather than inline: .superRefine() returns a ZodEffects,
// which no longer exposes .partial()/.omit(), so the update variants have to
// branch off the plain object first.
const PostBaseDto = z.object({
  content: z.string().min(1, 'Content is required'),
  communityId: z.string().uuid('Valid community ID required'),
  type: z.enum(['GENERAL', 'HELP', 'EMERGENCY', 'ENQUIRY']).optional(),
  images: z
    .union([z.array(z.string()), z.string()])
    .transform((value) => (typeof value === 'string' ? [value] : value))
    .optional(),
  // A multipart form has no way to send null, so an empty string is how the
  // client says "clear the video"; normalise it here.
  video: z
    .union([z.string(), z.null()])
    .transform((value) => (typeof value === 'string' && value.length === 0 ? null : value))
    .optional(),
});

/**
 * A post carries EITHER images OR a video, never both — the feed renders one
 * or the other, and allowing both would leave the combination undefined on
 * every surface that displays a post.
 */
function assertMediaExclusive(
  value: { images?: string[]; video?: string | null },
  ctx: z.RefinementCtx,
): void {
  if (value.images?.length && value.video) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['video'],
      message: 'A post can have either images or a video, not both',
    });
  }
}

export const CreatePostDto = PostBaseDto.superRefine(assertMediaExclusive);

export const UpdatePostDto = PostBaseDto.partial().superRefine(assertMediaExclusive);

export const UpdatePostBodyDto = PostBaseDto.omit({ communityId: true })
  .partial()
  .superRefine(assertMediaExclusive);

export const ListPostsQueryDto = z.object({
  communityId: z.string().uuid().optional(),
  type: z.enum(['GENERAL', 'HELP', 'EMERGENCY', 'ENQUIRY']).optional(),
  joined: z.coerce.boolean().optional(), // true = only posts from communities the caller has joined
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
  sortBy:   z.enum(['joined', 'community', 'submitter']).default('joined'),
  sortDir:  z.enum(['asc', 'desc']).default('desc'),
  authorStatus: z.enum(['trusted', 'untrusted']).optional(),
});

export const ListMyPostsQueryDto = z.object({
  page:   z.coerce.number().int().min(1).default(1),
  limit:  z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'NEEDS_INFO']).optional(),
  communityId: z.string().uuid().optional(),
});

export const RejectPostDto = z.object({
  reason: z.string().trim().max(500).optional(),
});

export const RequestMoreInfoPostDto = z.object({
  reason: z.string({ required_error: 'Please describe what information is needed' })
    .trim()
    .min(1, 'Please describe what information is needed')
    .max(500),
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
export type RequestMoreInfoPostDtoType = z.infer<typeof RequestMoreInfoPostDto>;
