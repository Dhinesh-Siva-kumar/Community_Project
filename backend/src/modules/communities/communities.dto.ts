import { z } from 'zod';

export const CreateCommunityDto = z.object({
  name: z.string().min(1, 'Community name is required'),
  description: z.string().optional(),
  image: z.string().optional(),
  location: z.string().optional(),
  pincode: z.string().optional(),
});

export const UpdateCommunityDto = CreateCommunityDto.partial();

export const ListCommunitiesQueryDto = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  pincode: z.string().optional(),
});

export const PaginationQueryDto = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type CreateCommunityDtoType = z.infer<typeof CreateCommunityDto>;
export type UpdateCommunityDtoType = z.infer<typeof UpdateCommunityDto>;
export type ListCommunitiesQueryDtoType = z.infer<typeof ListCommunitiesQueryDto>;
