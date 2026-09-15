import { z } from 'zod';

// Only 'ta' is supported today, but keeping this an enum (rather than a bare
// literal) means adding a language later is "extend the enum + the LANG_NAMES
// map in translation.service.ts", not a schema rewrite.
export const TranslateFieldsDto = z.object({
  fields: z
    .record(z.string(), z.string().min(1))
    .refine((f) => Object.keys(f).length > 0, 'fields must not be empty')
    .refine((f) => Object.values(f).join('').length <= 100_000, 'fields payload too large'),
  targetLang: z.enum(['ta']).default('ta'),
});

export type TranslateFieldsDtoType = z.infer<typeof TranslateFieldsDto>;
