import { z } from 'zod';
import { DAY_KEYS, type DayKey } from './opening-hours.util';

// Business create/update always goes through multipart FormData (a logo
// file is required on create), which stringifies booleans to "true"/"false".
// z.coerce.boolean() (used elsewhere, e.g. jobs.dto.ts) is unsafe for that:
// it runs plain JS `Boolean(value)`, so the STRING "false" coerces to
// `true`. Map the two string forms explicitly instead, so toggling a
// business Inactive actually works when submitted alongside a file.
const activeBool = z.preprocess(
  (v) => (typeof v === 'string' ? v === 'true' : v),
  z.boolean(),
).optional();

// An untouched email field submits as "" (both via FormData on create and
// the plain JSON body on update-without-new-files) — treat that the same as
// "not provided" instead of failing .email() format validation on a blank
// optional field.
const optionalEmail = z.preprocess(
  (v) => (v === '' ? undefined : v),
  z.string().email().optional(),
);

// Same reasoning as activeBool above, for the boolean list-query flags
// ("has menu card", "has website", ...) which arrive as query strings.
const boolParam = z.preprocess(
  (v) => (typeof v === 'string' ? v === 'true' : v),
  z.boolean(),
).optional();

// Nested objects can't survive multipart FormData, so the client sends them
// JSON-stringified. Accept either form: a real object (plain JSON body) or a
// string to parse (FormData). A string that isn't valid JSON is passed
// through untouched so the inner schema reports a normal validation error
// instead of this preprocessor throwing.
const jsonBody = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((v) => {
    if (typeof v !== 'string') return v;
    const s = v.trim();
    if (s === '') return undefined;
    try { return JSON.parse(s); } catch { return v; }
  }, schema);

const HHMM = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Time must be in HH:mm (24-hour) format');

const OpeningDayDto = z.object({
  open: HHMM,
  close: HHMM,
  is24h: z.boolean().optional(),
});

// Built from the day-key list rather than z.record() so the inferred type
// has *optional* per-day keys (z.record with an enum key makes them all
// required) and unknown day keys are stripped rather than stored.
const OpeningDaysDto = z.object(
  Object.fromEntries(DAY_KEYS.map((k) => [k, OpeningDayDto.optional()])) as {
    [K in DayKey]: z.ZodOptional<typeof OpeningDayDto>;
  },
);

export const OpeningHoursJsonDto = z.object({
  mode: z.enum(['SAME', 'PER_DAY']),
  days: OpeningDaysDto,
}).refine(
  (o) => Object.values(o.days).some(Boolean),
  { message: 'Select at least one opening day', path: ['days'] },
);

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
  // Three separate galleries. `images` keeps its original meaning and is
  // surfaced as "Gallery Photos"; all three are injected by the controller
  // from the uploaded files.
  images: z.array(z.string()).optional(),
  menuImages: z.array(z.string()).optional(),
  cardImages: z.array(z.string()).optional(),
  address: z.string().min(5, 'Address must be at least 5 characters').max(500, 'Address must be at most 500 characters'),
  pincode: z.string().optional(),
  country: z.string().optional(),
  location: z.string().optional(),
  latitude: z.coerce.number().optional(),
  longitude: z.coerce.number().optional(),
  phone: z.string().optional(),
  email: optionalEmail,
  website: z.string().optional(),
  openingHours: z.string().optional(),
  // New fields
  city: z.string().min(1, 'City is required'),
  // Optional — some countries have no state/province-level administrative
  // division at all (confirmed real for 14/250 countries in the imported
  // geo dataset), so this can't always be required.
  state: z.string().optional(),
  openingDays: z.string().optional(),
  whatsapp: z.string().optional(),
  mapsLink: z.string().optional(),
  logo: z.string().optional(),
  // Country-aware address hierarchy — optional so existing callers that
  // only send the free-text country/state/city/pincode above keep working
  // unchanged. When present, validated (city belongs to state belongs to
  // country; pincode matches the country's postal format) in the service.
  countryId: z.coerce.number().int().positive().optional(),
  stateId: z.coerce.number().int().positive().optional(),
  cityId: z.coerce.number().int().positive().optional(),
  // Active/Inactive — settable by the owner or an admin (same authorization
  // as any other business field); defaults to true (matches the DB default)
  // when omitted on create.
  isActive: activeBool,
  // Visibility scope. Deliberately .optional() and NOT .default('COUNTRY'):
  // UpdateBusinessDto below is CreateBusinessDto.partial(), which does not
  // strip a ZodDefault — an update that omitted this field would parse to
  // 'COUNTRY', clear the service's `!== undefined` guard and silently
  // demote a WORLDWIDE business. create() applies the default instead,
  // exactly as isActive already does.
  visibilityType: z.enum(['COUNTRY', 'WORLDWIDE']).optional(),
  // Structured per-day opening hours. Supersedes the free-text
  // openingHours/openingDays above, which the service now derives from this.
  openingHoursJson: jsonBody(OpeningHoursJsonDto).optional(),
});

export const UpdateBusinessDto = CreateBusinessDto.partial();

export const ListBusinessQueryDto = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  categoryId: z.string().uuid().optional(),
  categoryIds: z.string().optional(),
  pincode: z.string().optional(),
  search: z.string().optional(),
  // Free-text country match, kept for existing callers. Prefer countryIds.
  country: z.string().optional(),
  // ── Location: id-based, from the geography master data ──
  countryIds: z.string().optional(),   // comma-separated master_countries ids
  stateId: z.coerce.number().int().positive().optional(),
  cityId: z.coerce.number().int().positive().optional(),
  // ── Visibility scope ──
  visibilityType: z.enum(['COUNTRY', 'WORLDWIDE']).optional(),
  // ── Opening hours (structured) ──
  // "Open on <day>" and "Open now". Businesses carry no timezone, so
  // "now" is the *viewer's* clock: the client sends the day and HH:mm it
  // observes rather than the server calling NOW().
  openOnDay: z.enum(DAY_KEYS).optional(),
  openNowDay: z.enum(DAY_KEYS).optional(),
  openNowTime: HHMM.optional(),
  // ── Feature presence toggles ──
  hasMenu: boolParam,
  hasGallery: boolParam,
  hasWhatsapp: boolParam,
  hasWebsite: boolParam,
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  status: z.enum(['active', 'inactive']).optional(),
  // Moderation status — distinct from `status` above (which means active/inactive).
  // Accepts a single value or a comma-separated list (e.g. the user-side
  // "Pending Approval" tab needs both PENDING and NEEDS_INFO submissions).
  approvalStatus: z.string().optional()
    .transform((v) => (v ? v.split(',').map((s) => s.trim()) : undefined))
    .pipe(z.array(z.enum(['PENDING', 'APPROVED', 'REJECTED', 'NEEDS_INFO'])).optional()),
  sortBy: z.enum(['name', 'joined']).default('joined'),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
});

export const ListPendingBusinessQueryDto = z.object({
  page:     z.coerce.number().int().min(1).default(1),
  limit:    z.coerce.number().int().min(1).max(100).default(20),
  search:   z.string().optional(),
  country:  z.string().optional(),
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'dateFrom must be YYYY-MM-DD').optional(),
  dateTo:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'dateTo must be YYYY-MM-DD').optional(),
  sortBy:   z.enum(['joined', 'name', 'submitter', 'country']).default('joined'),
  sortDir:  z.enum(['asc', 'desc']).default('desc'),
});

export const RejectBusinessDto = z.object({
  reason: z.string().trim().max(500).optional(),
});

export const RequestMoreInfoBusinessDto = z.object({
  reason: z.string({ required_error: 'Please describe what information is needed' })
    .trim()
    .min(1, 'Please describe what information is needed')
    .max(500),
});

export type CreateBusinessDtoType = z.infer<typeof CreateBusinessDto>;
export type UpdateBusinessDtoType = z.infer<typeof UpdateBusinessDto>;
export type CreateBusinessCategoryDtoType = z.infer<typeof CreateBusinessCategoryDto>;
export type ListBusinessQueryDtoType = z.infer<typeof ListBusinessQueryDto>;
export type ListPendingBusinessQueryDtoType = z.infer<typeof ListPendingBusinessQueryDto>;
export type RejectBusinessDtoType = z.infer<typeof RejectBusinessDto>;
export type RequestMoreInfoBusinessDtoType = z.infer<typeof RequestMoreInfoBusinessDto>;
