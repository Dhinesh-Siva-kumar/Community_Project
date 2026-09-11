import { z } from 'zod';

// 24h HH:mm, zero-padded (matches <input type="time"> / the frontend's
// TimeInputComponent output exactly).
const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Dependency-free IANA timezone check — the standard technique: the
 * Intl constructor throws RangeError for a bogus zone name, succeeds for
 * any real one. */
function isValidTimezone(tz: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** http(s)-only URL — Zod's bare `.url()` accepts any URI scheme
 * (ftp:, mailto:, ...); this additionally restricts to http/https, same
 * rule as the frontend's shared `urlValidator`. */
function httpUrlSchema(maxLen: number) {
  return z.string().url().max(maxLen).refine(
    (val) => {
      try { return ['http:', 'https:'].includes(new URL(val).protocol); }
      catch { return false; }
    },
    { message: 'Only http:// or https:// URLs are allowed' },
  );
}

// Plain object schema (no .refine() yet) so UpdateEventDto can still call
// .partial() on it below — ZodEffects (what .refine() returns) has no
// .partial() method, so the refine has to be layered on separately for
// Create vs Update instead of chained directly onto this definition.
// Exported (rather than kept private) because CreateEventDto below becomes
// a ZodEffects once .refine() is applied to it, and ZodEffects has no
// `.shape` either — the controller's "fill in every expected multipart
// field" logic needs a real ZodObject to read `.shape` from.
export const EventFieldsShape = z.object({
  title: z.string().min(1, 'Event title is required'),
  eventDate: z.string().min(1, 'Event date is required'),
  description: z.string().min(1, 'Description is required').max(1000, 'Description must be at most 1000 characters'),
  images: z.array(z.string()).optional(),
  // Required — matches the frontend form (Validators.required on eventTime).
  // HH:mm only, so downstream date-math (events.service.ts's
  // EVENT_START_INSTANT_SQL) never has to guess a format.
  eventTime: z.string().regex(TIME_REGEX, 'Start time must be in HH:mm format'),
  eventEndTime: z.string().regex(TIME_REGEX, 'End time must be in HH:mm format').optional(),
  address: z.string().optional(),
  pincode: z.string().optional(),
  location: z.string().optional(),
  country: z.string().optional(),
  eventCategory: z.string().min(1, 'Event category is required'), // Added
  // Validated against the real IANA tz database (not just "non-empty") —
  // a bogus zone would otherwise silently break the timezone-aware
  // upcoming/past math everywhere else in this module.
  timezone: z.string().min(1, 'Timezone is required').refine(isValidTimezone, 'Invalid timezone').default('Asia/Kolkata'),
  eventMode: z.enum(['Offline', 'Online', 'Hybrid']).default('Offline'), // Added
  // Offline events submit this as '' (no meeting link) — normalize blank
  // strings to null before the .url() check so they don't get rejected.
  locationLink: z.preprocess(
    (val) => (typeof val === 'string' && val.trim() === '' ? null : val),
    httpUrlSchema(300).nullable().optional()
  ),
  // Optional booking/registration link — the Event Details page renders both
  // the link itself and a QR code generated client-side from this value, so
  // no separate QR image needs to be stored. Same blank-to-null preprocessing
  // as locationLink above (an empty form field submits '', not undefined).
  bookingUrl: z.preprocess(
    (val) => (typeof val === 'string' && val.trim() === '' ? null : val),
    httpUrlSchema(500).nullable().optional()
  ),
  // Id-based country, from the geography master data — used for the
  // visibility gate below. Optional so existing callers that only send the
  // free-text `country` above keep working.
  countryId: z.coerce.number().int().positive().optional(),
  // Id-based state/city (geography master data) — same optional/back-compat
  // reasoning as countryId; the free-text location/pincode columns above
  // remain the display copy.
  stateId: z.coerce.number().int().positive().optional(),
  cityId: z.coerce.number().int().positive().optional(),
  // Visibility scope. Deliberately .optional() and NOT .default('COUNTRY'):
  // UpdateEventDto below is CreateEventDto.partial(), which does not strip a
  // ZodDefault — an update that omitted this field would parse to
  // 'COUNTRY', clear the service's `!== undefined` guard and silently
  // demote a WORLDWIDE event. create() applies the default instead (see
  // business.dto.ts's visibilityType for the same reasoning).
  visibilityType: z.enum(['COUNTRY', 'WORLDWIDE']).optional(),
});

// Zero-length event only — deliberately NOT "end must be later than start":
// an event ending before its own start time is a perfectly valid overnight
// event (e.g. 22:00 -> 02:00), and rejecting that would break exactly the
// case this rule exists to allow. Only an identical start/end (a duration
// of exactly zero) is nonsensical. Applied to CreateEventDto only — a
// partial UpdateEventDto payload may omit either field (keeping the
// existing stored value), so that comparison instead happens in
// events.service.ts's update(), against the merged effective values.
export const CreateEventDto = EventFieldsShape.refine(
  (data) => !data.eventEndTime || data.eventEndTime !== data.eventTime,
  { message: 'Start time and End time cannot be the same', path: ['eventEndTime'] },
);

export const UpdateEventDto = EventFieldsShape.partial();

export const ListEventsQueryDto = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  pincode: z.string().optional(),
  /** Used only when sortBy='near' — events matching this pincode sort first. Does not filter results. */
  nearPincode: z.string().optional(),
  eventMode: z.enum(['Offline', 'Online', 'Hybrid']).optional(),
  search: z.string().optional(),
  country: z.string().optional(),
  stateId: z.coerce.number().int().positive().optional(),
  cityId: z.coerce.number().int().positive().optional(),
  eventCategory: z.string().optional(),
  /** Filters by event date: 'upcoming' (today or later) vs 'completed' (before today). */
  status: z.enum(['upcoming', 'completed']).optional(),
  // Moderation status — distinct from `status` above (which means upcoming/completed).
  // Accepts a single value or a comma-separated list (e.g. the user-side
  // "Pending Approval" tab needs both PENDING and NEEDS_INFO submissions).
  approvalStatus: z.string().optional()
    .transform((v) => (v ? v.split(',').map((s) => s.trim()) : undefined))
    .pipe(z.array(z.enum(['PENDING', 'APPROVED', 'REJECTED', 'NEEDS_INFO'])).optional()),
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'dateFrom must be YYYY-MM-DD').optional(),
  dateTo:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'dateTo must be YYYY-MM-DD').optional(),
  /** Filters on event_date (when the event happens), unlike dateFrom/dateTo which filter created_at. */
  eventDateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'eventDateFrom must be YYYY-MM-DD').optional(),
  eventDateTo:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'eventDateTo must be YYYY-MM-DD').optional(),
  sortBy:   z.enum(['name', 'eventDate', 'joined', 'near', 'category', 'mode', 'location', 'status']).default('eventDate'),
  sortDir:  z.enum(['asc', 'desc']).default('asc'),
  // Opt-in visibility filter ("show me only Worldwide events") — independent
  // of the automatic country/worldwide access-control gate applied server-side.
  visibilityType: z.enum(['COUNTRY', 'WORLDWIDE']).optional(),
});

export const ListPendingEventsQueryDto = z.object({
  page:     z.coerce.number().int().min(1).default(1),
  limit:    z.coerce.number().int().min(1).max(100).default(20),
  search:   z.string().optional(),
  country:  z.string().optional(),
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'dateFrom must be YYYY-MM-DD').optional(),
  dateTo:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'dateTo must be YYYY-MM-DD').optional(),
  sortBy:   z.enum(['joined', 'name', 'submitter', 'country']).default('joined'),
  sortDir:  z.enum(['asc', 'desc']).default('desc'),
});

export const CreateEventCategoryDto = z.object({
  name: z.string().min(2, 'Category name must be at least 2 characters').max(100, 'Category name must be at most 100 characters'),
  icon: z.string().optional(),
  description: z.string().max(300, 'Description must be at most 300 characters').optional(),
  // Deprioritise instead of delete — a disabled category is hidden from the
  // Add/Edit Event picker, but an existing event that already uses it keeps
  // resolving/displaying it normally.
  isActive: z.boolean().optional(),
  // Lower sorts first. Respected everywhere categories are listed
  // (getEventCategories()); defaults to 0.
  displayOrder: z.coerce.number().int().optional(),
});

export const UpdateEventCategoryDto = CreateEventCategoryDto.partial();
export type CreateEventCategoryDtoType = z.infer<typeof CreateEventCategoryDto>;
export type UpdateEventCategoryDtoType = z.infer<typeof UpdateEventCategoryDto>;

export const RejectEventDto = z.object({
  // Mandatory — shown to the event's creator, and rejection now keeps the
  // record (status change, not a delete), so a reason is what actually
  // tells them what to fix before resubmitting.
  reason: z.string({ required_error: 'Rejection reason is required' })
    .trim()
    .min(1, 'Rejection reason is required')
    .max(500, 'Rejection reason must be at most 500 characters'),
});

export const RequestMoreInfoEventDto = z.object({
  reason: z.string({ required_error: 'Please describe what information is needed' })
    .trim()
    .min(1, 'Please describe what information is needed')
    .max(500),
});

export type CreateEventDtoType = z.infer<typeof CreateEventDto>;
export type UpdateEventDtoType = z.infer<typeof UpdateEventDto>;
export type ListEventsQueryDtoType = z.infer<typeof ListEventsQueryDto>;
export type ListPendingEventsQueryDtoType = z.infer<typeof ListPendingEventsQueryDto>;
export type RejectEventDtoType = z.infer<typeof RejectEventDto>;
export type RequestMoreInfoEventDtoType = z.infer<typeof RequestMoreInfoEventDto>;
