import { z } from 'zod';

export const DivisionsQueryDto = z.object({
  parentId: z.coerce.number().int().positive().optional(),
});

export const CitiesQueryDto = z
  .object({
    divisionId: z.coerce.number().int().positive().optional(),
    countryId: z.coerce.number().int().positive().optional(),
    search: z.string().trim().max(200).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .refine((v) => !!v.divisionId || !!v.countryId, {
    message: 'Either divisionId or countryId is required',
  });

export type DivisionsQueryDtoType = z.infer<typeof DivisionsQueryDto>;
export type CitiesQueryDtoType = z.infer<typeof CitiesQueryDto>;
