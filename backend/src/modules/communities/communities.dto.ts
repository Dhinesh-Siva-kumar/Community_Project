import { z } from 'zod';

// ── Update fields — all fields optional so partial patches work ───────────────
const communityFields = z.object({
  name: z.string().trim().min(3, 'Community name must be at least 3 characters').max(150).optional(),
  description: z.string().trim().min(1, 'Description is required').optional(),
  image: z.string().min(1).optional(),
  location: z.string().optional(),
  pincode: z.string().optional(),
  interest_id: z.number().int().positive().optional(),
  country: z.string().optional(),
  country_id: z.number().int().positive().optional(),
  is_private: z.boolean().optional().default(false),
  is_global: z.boolean().optional().default(false),
  is_default: z.boolean().optional().default(false),
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
    image: z
      .string({ required_error: 'Community image is required' })
      .min(1, 'Community image is required'),
    interest_id: z
      .number({
        required_error: 'Please select a category',
        invalid_type_error: 'Please select a category',
      })
      .int()
      .positive('Please select a valid category'),
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
  })
  .refine((data) => !(data.is_private && data.is_global), {
    message: 'A community cannot be both Private and Global',
    path: ['is_global'],
  })
  .refine((data) => data.is_private || data.is_global, {
    message: 'Please select a visibility option (Private or Global)',
    path: ['visibility'],
  });

export const UpdateCommunityDto = communityFields;

export const ListCommunitiesQueryDto = z.object({
  page:       z.coerce.number().int().min(1).default(1),
  limit:      z.coerce.number().int().min(1).max(100).default(20),
  search:     z.string().optional(),
  pincode:    z.string().optional(),
  // ── New filter params ──────────────────────────────────────
  country:    z.string().optional(),
  category:   z.string().optional(),
  visibility: z.enum(['global', 'private', 'default']).optional(),
  from_date:  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'from_date must be YYYY-MM-DD').optional(),
  to_date:    z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'to_date must be YYYY-MM-DD').optional(),
});

export const PaginationQueryDto = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type CreateCommunityDtoType = z.infer<typeof CreateCommunityDto>;
export type UpdateCommunityDtoType = z.infer<typeof UpdateCommunityDto>;
export type ListCommunitiesQueryDtoType = z.infer<typeof ListCommunitiesQueryDto>;
