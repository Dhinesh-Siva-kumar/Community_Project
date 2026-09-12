import { z } from 'zod';

// Public, guest-facing preview/search endpoints — deliberately small and
// capped (max 8/10 results) since these back homepage cards, not full list
// pages. Kept separate from each feature's own ListXQueryDto so this module
// never inherits an admin-oriented filter by accident.

export const DiscoveryPreviewQueryDto = z.object({
  countryId: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(8).default(5),
});

export const DiscoverySearchQueryDto = z.object({
  q: z.string().min(1).max(100),
  countryId: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(10).default(5),
});

export type DiscoveryPreviewQueryDtoType = z.infer<typeof DiscoveryPreviewQueryDto>;
export type DiscoverySearchQueryDtoType = z.infer<typeof DiscoverySearchQueryDto>;
