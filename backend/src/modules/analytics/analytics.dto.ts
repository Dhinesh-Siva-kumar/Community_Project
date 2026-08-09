import { z } from 'zod';

export const AnalyticsOverviewQueryDto = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'from must be YYYY-MM-DD').optional(),
  to:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'to must be YYYY-MM-DD').optional(),
  granularity: z.enum(['daily', 'weekly', 'monthly', 'yearly']).default('daily'),
});

export type AnalyticsOverviewQueryDtoType = z.infer<typeof AnalyticsOverviewQueryDto>;
