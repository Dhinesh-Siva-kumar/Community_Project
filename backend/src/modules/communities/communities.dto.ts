import { z } from 'zod';

// ── Community rules — a short free-text list, each entered one at a time ──────
const rulesSchema = z
  .array(z.string().trim().min(1).max(150, 'Each rule must be at most 150 characters'))
  .max(20, 'A community can have at most 20 rules')
  .optional()
  .default([]);

// ── Update fields — all fields optional so partial patches work ───────────────
const communityFields = z.object({
  name: z.string().trim().min(3, 'Community name must be at least 3 characters').max(150).optional(),
  description: z.string().trim().min(1, 'Description is required').optional(),
  image: z.string().min(1).optional(),
  location: z.string().optional(),
  pincode: z.string().optional(),
  interest_id: z.number().int().positive().optional(),
  // Individual communities can carry up to 3 categories; Hub communities
  // carry none (cleared server-side regardless of what's sent — see service).
  interest_ids: z.array(z.number().int().positive()).max(3, 'You can select up to 3 categories').optional(),
  country: z.string().optional(),
  country_id: z.number().int().positive().optional(),
  is_private: z.boolean().optional().default(false),
  is_global: z.boolean().optional().default(false),
  is_default: z.boolean().optional().default(false),
  // Which post tabs the community offers — any combination of Help,
  // Emergency and Enquire (admin-only choice; non-admin submissions always
  // end up ['ENQUIRE'] regardless of what's sent — enforced in the service).
  community_modes: z.array(z.enum(['HELP', 'EMERGENCY', 'ENQUIRE'])).min(1, 'Select at least one community mode').optional().default(['ENQUIRE']),
  // Hub = an official, admin-managed country community; Individual = a
  // regular user-interest group. Only admins may set HUB (enforced in the
  // service layer) — non-admin submissions always end up INDIVIDUAL.
  community_type: z.enum(['HUB', 'INDIVIDUAL']).optional().default('INDIVIDUAL'),
  rules: rulesSchema,
});

// ── Create — all mandatory fields are required ────────────────────────────────
export const CreateCommunityDto = z
  .object({
    name: z
      .string({ required_error: 'Community name is required' })
      .trim()
      .min(3, 'Community name must be at least 3 characters')
      .max(150, 'Community name must be at most 150 characters'),
    description: z
      .string({ required_error: 'Description is required' })
      .trim()
      .min(1, 'Description is required'),
    // Not required at the schema level — Hub communities don't require an
    // image. Individual communities' requirement is enforced below via
    // .refine, since it depends on community_type.
    image: z.string().optional(),
    // Not required at the schema level — Hub communities carry no category
    // at all. Individual communities' requirement (1–3 categories) is
    // enforced below via .refine, since it depends on community_type.
    interest_id: z.number().int().positive().optional(),
    interest_ids: z.array(z.number().int().positive()).max(3, 'You can select up to 3 categories').optional().default([]),
    country: z
      .string({ required_error: 'Please select a country' })
      .min(1, 'Please select a country'),
    country_id: z
      .number({
        required_error: 'Please select a country',
        invalid_type_error: 'Please select a country',
      })
      .int()
      .positive(),
    location: z.string().optional(),
    pincode: z.string().optional(),
    is_private: z.boolean().optional().default(false),
    is_global: z.boolean().optional().default(false),
    is_default: z.boolean().optional().default(false),
    community_modes: z.array(z.enum(['HELP', 'EMERGENCY', 'ENQUIRE'])).min(1, 'Select at least one community mode').optional().default(['ENQUIRE']),
    community_type: z.enum(['HUB', 'INDIVIDUAL']).optional().default('INDIVIDUAL'),
    rules: rulesSchema,
  })
  .refine((data) => !(data.is_private && data.is_global), {
    message: 'A community cannot be both Private and Global',
    path: ['is_global'],
  })
  .refine((data) => data.is_private || data.is_global, {
    message: 'Please select a visibility option (Private or Global)',
    path: ['visibility'],
  })
  .refine((data) => data.community_type === 'HUB' || data.interest_ids.length > 0, {
    message: 'Please select at least one category',
    path: ['interest_ids'],
  })
  .refine((data) => data.community_type === 'HUB' || !!data.image, {
    message: 'Community image is required',
    path: ['image'],
  });

export const UpdateCommunityDto = communityFields;

export const ListCommunitiesQueryDto = z.object({
  page:       z.coerce.number().int().min(1).default(1),
  limit:      z.coerce.number().int().min(1).max(100).default(20),
  search:     z.string().optional(),
  pincode:    z.string().optional(),
  // ── New filter params ──────────────────────────────────────
  country:       z.string().optional(),
  category:      z.string().optional(),
  visibility:    z.enum(['global', 'private', 'default']).optional(),
  community_mode: z.enum(['HELP', 'EMERGENCY', 'ENQUIRE']).optional(),
  community_type: z.enum(['HUB', 'INDIVIDUAL']).optional(),
  is_default:    z.enum(['true', 'false']).optional().transform((v) => (v === undefined ? undefined : v === 'true')),
  from_date:  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'from_date must be YYYY-MM-DD').optional(),
  to_date:    z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'to_date must be YYYY-MM-DD').optional(),
  joined:     z.coerce.boolean().optional(),   // true = return only communities the caller has joined
  status:     z.enum(['active', 'inactive']).optional(),
  // Moderation status — distinct from `status` above (which means active/inactive).
  // Accepts a single value or a comma-separated list (e.g. the user-side
  // "Pending Approval" tab needs both PENDING and NEEDS_INFO submissions).
  approvalStatus: z.string().optional()
    .transform((v) => (v ? v.split(',').map((s) => s.trim()) : undefined))
    .pipe(z.array(z.enum(['PENDING', 'APPROVED', 'REJECTED', 'NEEDS_INFO'])).optional()),
  // Admin community-management list: rejected communities aren't relevant there
  // (they belong on the Approval page's Community tab) — hide them without
  // narrowing down to a single approvalStatus.
  excludeRejected: z.coerce.boolean().optional(),
  sortBy:     z.enum(['name', 'joined', 'category', 'country', 'visibility', 'members', 'posts', 'status']).default('joined'),
  sortDir:    z.enum(['asc', 'desc']).default('desc'),
});

export const PaginationQueryDto = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const ListPendingCommunitiesQueryDto = z.object({
  page:     z.coerce.number().int().min(1).default(1),
  limit:    z.coerce.number().int().min(1).max(100).default(20),
  search:   z.string().optional(),
  country:  z.string().optional(),
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'dateFrom must be YYYY-MM-DD').optional(),
  dateTo:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'dateTo must be YYYY-MM-DD').optional(),
  visibility: z.enum(['global', 'private']).optional(),
  is_default: z.enum(['true', 'false']).optional().transform((v) => (v === undefined ? undefined : v === 'true')),
  sortBy:   z.enum(['joined', 'name', 'submitter', 'country']).default('joined'),
  sortDir:  z.enum(['asc', 'desc']).default('desc'),
});

export const RejectCommunityDto = z.object({
  reason: z.string().trim().max(500).optional(),
});

export const RequestMoreInfoCommunityDto = z.object({
  reason: z.string({ required_error: 'Please describe what information is needed' })
    .trim()
    .min(1, 'Please describe what information is needed')
    .max(500),
});

export const SuggestedCommunitiesQueryDto = z.object({
  limit: z.coerce.number().int().min(1).max(20).default(8),
});

export type CreateCommunityDtoType = z.infer<typeof CreateCommunityDto>;
export type UpdateCommunityDtoType = z.infer<typeof UpdateCommunityDto>;
export type ListCommunitiesQueryDtoType = z.infer<typeof ListCommunitiesQueryDto>;
export type ListPendingCommunitiesQueryDtoType = z.infer<typeof ListPendingCommunitiesQueryDto>;
export type RejectCommunityDtoType = z.infer<typeof RejectCommunityDto>;
export type RequestMoreInfoCommunityDtoType = z.infer<typeof RequestMoreInfoCommunityDto>;
export type SuggestedCommunitiesQueryDtoType = z.infer<typeof SuggestedCommunitiesQueryDto>;
