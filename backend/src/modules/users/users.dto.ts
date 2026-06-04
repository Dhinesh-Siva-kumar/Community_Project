import { z } from 'zod';

export const UpdateUserDto = z.object({
  userName: z.string().min(1).optional(),
  displayName: z.string().min(1).optional(),
  phoneNo: z.string().optional(),
  email: z.string().email().optional(),
  countryId: z.number().int().positive().optional(),
  bio: z.string().optional(),
  location: z.string().optional(),
  pincode: z.string().optional(),
  interests: z.array(z.string()).optional(),
  professionalCategory: z.string().optional(),
  avatar: z.string().optional(),
});

export const ListUsersQueryDto = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
});

export type UpdateUserDtoType = z.infer<typeof UpdateUserDto>;
export type ListUsersQueryDtoType = z.infer<typeof ListUsersQueryDto>;
