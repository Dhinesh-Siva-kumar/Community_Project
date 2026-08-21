import { z } from 'zod';
import { ALL_NOTIFICATION_TYPES } from './notifications.service';

export const PaginationQueryDto = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const UpdatePreferencesDto = z.object({
  mutedTypes: z.array(z.enum(ALL_NOTIFICATION_TYPES as [string, ...string[]])).optional(),
  emailDigestEnabled: z.boolean().optional(),
});

export type PaginationQueryDtoType = z.infer<typeof PaginationQueryDto>;
export type UpdatePreferencesDtoType = z.infer<typeof UpdatePreferencesDto>;
