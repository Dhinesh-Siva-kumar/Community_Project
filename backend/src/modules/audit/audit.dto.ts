import { z } from 'zod';

export const AuditLogQueryDto = z.object({
  page:     z.coerce.number().int().min(1).default(1),
  limit:    z.coerce.number().int().min(1).max(100).default(20),
  action:   z.string().optional(),
  resource: z.string().optional(),
  actorId:  z.string().uuid().optional(),
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'dateFrom must be YYYY-MM-DD').optional(),
  dateTo:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'dateTo must be YYYY-MM-DD').optional(),
});

export type AuditLogQueryDtoType = z.infer<typeof AuditLogQueryDto>;
