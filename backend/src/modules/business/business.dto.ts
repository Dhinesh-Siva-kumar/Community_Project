import { z } from 'zod';

export const CreateBusinessCategoryDto = z.object({
  name: z.string().min(2, 'Category name must be at least 2 characters').max(100, 'Category name must be at most 100 characters'),
  icon: z.string().optional(),
  description: z.string().max(300, 'Description must be at most 300 characters').optional(),
});

export const UpdateBusinessCategoryDto = CreateBusinessCategoryDto.partial();
export type UpdateBusinessCategoryDtoType = z.infer<typeof UpdateBusinessCategoryDto>;

export const CreateBusinessDto = z.object({
  name: z.string().min(2, 'Business name must be at least 2 characters').max(100, 'Business name must be at most 100 characters'),
  categoryId: z.string().uuid('Valid category ID required'),
  description: z.string().min(10, 'Description must be at least 10 characters').max(1000, 'Description must be at most 1000 characters'),
  images: z.array(z.string()).optional(),
  address: z.string().min(5, 'Address must be at least 5 characters').max(500, 'Address must be at most 500 characters'),
  pincode: z.string().optional(),
  country: z.string().optional(),
  location: z.string().optional(),
  latitude: z.coerce.number().optional(),
  longitude: z.coerce.number().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  website: z.string().optional(),
  openingHours: z.string().optional(),
  // New fields
  city: z.string().min(1, 'City is required'),
  state: z.string().min(1, 'State is required'),
  openingDays: z.string().optional(),
  whatsapp: z.string().optional(),
  mapsLink: z.string().optional(),
  logo: z.string().optional(),
});

export const UpdateBusinessDto = CreateBusinessDto.partial();

export const ListBusinessQueryDto = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  categoryId: z.string().uuid().optional(),
  categoryIds: z.string().optional(),
  pincode: z.string().optional(),
  search: z.string().optional(),
  country: z.string().optional(),
  openingHours: z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  status: z.enum(['active', 'inactive']).optional(),
  sortBy: z.enum(['name', 'joined']).default('joined'),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
});

export type CreateBusinessDtoType = z.infer<typeof CreateBusinessDto>;
export type UpdateBusinessDtoType = z.infer<typeof UpdateBusinessDto>;
export type CreateBusinessCategoryDtoType = z.infer<typeof CreateBusinessCategoryDto>;
export type ListBusinessQueryDtoType = z.infer<typeof ListBusinessQueryDto>;
