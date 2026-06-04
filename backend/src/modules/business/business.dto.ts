import { z } from 'zod';

export const CreateBusinessCategoryDto = z.object({
  name: z.string().min(1, 'Category name is required'),
  icon: z.string().optional(),
});

export const CreateBusinessDto = z.object({
  name: z.string().min(1, 'Business name is required'),
  categoryId: z.string().uuid('Valid category ID required'),
  description: z.string().optional(),
  images: z.array(z.string()).optional(),
  address: z.string().optional(),
  pincode: z.string().optional(),
  country: z.string().optional(),
  location: z.string().optional(),
  latitude: z.coerce.number().optional(),
  longitude: z.coerce.number().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  website: z.string().optional(),
  openingHours: z.string().optional(),
});

export const UpdateBusinessDto = CreateBusinessDto.partial();

export const ListBusinessQueryDto = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  categoryId: z.string().uuid().optional(),
  pincode: z.string().optional(),
  search: z.string().optional(),
});

export type CreateBusinessDtoType = z.infer<typeof CreateBusinessDto>;
export type UpdateBusinessDtoType = z.infer<typeof UpdateBusinessDto>;
export type CreateBusinessCategoryDtoType = z.infer<typeof CreateBusinessCategoryDto>;
export type ListBusinessQueryDtoType = z.infer<typeof ListBusinessQueryDto>;
