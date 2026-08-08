import { z } from 'zod';

export const CreateReportDto = z.object({
  targetType: z.literal('POST').default('POST'),
  targetId: z.string().uuid(),
  reason: z.string().max(500).optional(),
});

export type CreateReportDtoType = z.infer<typeof CreateReportDto>;
