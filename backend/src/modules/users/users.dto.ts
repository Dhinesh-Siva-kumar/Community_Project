import { z } from 'zod';

export const UpdateUserDto = z.object({
  userName:             z.string().min(1).optional(),
  displayName:          z.string().min(2).max(60).optional(),
  phoneNo:              z.string().max(20).optional(),
  whatsappNo:           z.string().max(20).optional(),
  email:                z.string().email().optional(),
  countryId:            z.number().int().positive().optional(),
  stateId:              z.coerce.number().int().positive().optional(),
  cityId:               z.coerce.number().int().positive().optional(),
  bio:                  z.string().max(300).optional(),
  location:             z.string().optional(),
  pincode:              z.string().max(12).optional(),
  interests:            z.array(z.string()).optional(),
  professionalCategory: z.string().max(60).optional(),
  avatar:               z.string().optional(),
  occupation:           z.string().max(100).optional(),
  company:              z.string().max(100).optional(),
  website:              z.string().max(200).optional(),
  linkedinUrl:          z.string().max(200).optional(),
  occupationType:       z.enum(['PROFESSIONAL', 'STUDENT']).optional(),
  institution:          z.string().max(150).optional(),
  course:               z.string().max(150).optional(),
  graduationYear:       z.coerce.number().int().min(1950).max(2100).optional(),
});

export const ListUsersQueryDto = z.object({
  page:    z.coerce.number().int().min(1).default(1),
  limit:   z.coerce.number().int().min(1).max(100).default(20),
  search:  z.string().optional(),
  role:    z.enum(['ADMIN', 'USER']).optional(),
  status:  z.enum(['active', 'blocked', 'trusted']).optional(),
  joined:  z.enum(['today', '7d', '30d', '90d']).optional(),
  country: z.string().optional(),
  sortBy:  z.enum(['name', 'email', 'joined', 'role']).default('joined'),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
});

export const AdminCreateUserDto = z.object({
  userName:    z.string().min(3).max(30),
  displayName: z.string().min(1).max(60),
  email:       z.string().email().optional(),
  phoneNo:     z.string().optional(),
  password:    z.string().min(8),
  countryId:   z.number().int().positive().optional(),
});

export const AdminResetPasswordDto = z.object({
  newPassword: z.string().min(8),
});

export const AuditLogQueryDto = z.object({
  page:   z.coerce.number().int().min(1).default(1),
  limit:  z.coerce.number().int().min(1).max(100).default(20),
  action: z.string().optional(),
  userId: z.string().uuid().optional(),
});

export const ChartDataQueryDto = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'from must be YYYY-MM-DD').optional(),
  to:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'to must be YYYY-MM-DD').optional(),
});

export const BroadcastNotificationDto = z.object({
  // Kept in sync with NotificationType in notifications.service.ts — the
  // full set of DB-enum values, not just the original 10.
  type:        z.enum([
    'POST_APPROVED', 'POST_REJECTED', 'POST_PENDING', 'NEW_COMMENT', 'NEW_LIKE',
    'COMMUNITY_POST', 'USER_BLOCKED', 'USER_UNBLOCKED', 'TRUST_GRANTED',
    'EVENT_CREATED', 'JOB_POSTED',
    'COMMUNITY_PENDING', 'COMMUNITY_APPROVED', 'COMMUNITY_REJECTED',
    'BUSINESS_PENDING', 'BUSINESS_APPROVED', 'BUSINESS_REJECTED',
    'JOB_PENDING', 'JOB_APPROVED', 'JOB_REJECTED',
    'EVENT_PENDING', 'EVENT_APPROVED', 'EVENT_REJECTED',
    'TRUST_REVOKED', 'ACCOUNT_DEACTIVATED', 'PASSWORD_RESET_BY_ADMIN',
    'POST_REMOVED', 'COMMUNITY_REMOVED', 'BUSINESS_REMOVED', 'EVENT_REMOVED', 'JOB_REMOVED',
    'COMMUNITY_MEMBER_JOINED', 'WELCOME',
  ]),
  message:     z.string().min(1).max(500),
  recipient:   z.enum(['all', 'role', 'user']),
  role:        z.enum(['ADMIN', 'USER']).optional(),
  userId:      z.string().uuid().optional(),
});

export type UpdateUserDtoType            = z.infer<typeof UpdateUserDto>;
export type ListUsersQueryDtoType        = z.infer<typeof ListUsersQueryDto>;
export type AdminCreateUserDtoType       = z.infer<typeof AdminCreateUserDto>;
export type AdminResetPasswordDtoType    = z.infer<typeof AdminResetPasswordDto>;
export type AuditLogQueryDtoType         = z.infer<typeof AuditLogQueryDto>;
export type BroadcastNotificationDtoType = z.infer<typeof BroadcastNotificationDto>;
export type ChartDataQueryDtoType        = z.infer<typeof ChartDataQueryDto>;
