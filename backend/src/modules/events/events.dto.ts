import { z } from 'zod';

export const CreateEventDto = z.object({
  title: z.string().min(1, 'Event title is required'),
  eventDate: z.string().min(1, 'Event date is required'),
  description: z.string().optional(),
  images: z.array(z.string()).optional(),
  eventTime: z.string().optional(),
  eventEndTime: z.string().optional(), // Added
  address: z.string().optional(),
  pincode: z.string().optional(),
  location: z.string().optional(),
  country: z.string().optional(),
  eventCategory: z.string().min(1, 'Event category is required'), // Added
  timezone: z.string().min(1, 'Timezone is required').default('Asia/Kolkata'), // Added
  eventMode: z.enum(['Offline', 'Online', 'Hybrid']).default('Offline'), // Added
  // Offline events submit this as '' (no meeting link) — normalize blank
  // strings to null before the .url() check so they don't get rejected.
  locationLink: z.preprocess(
    (val) => (typeof val === 'string' && val.trim() === '' ? null : val),
    z.string().url().nullable().optional()
  ),
  // Optional booking/registration link — the Event Details page renders both
  // the link itself and a QR code generated client-side from this value, so
  // no separate QR image needs to be stored. Same blank-to-null preprocessing
  // as locationLink above (an empty form field submits '', not undefined).
  bookingUrl: z.preprocess(
    (val) => (typeof val === 'string' && val.trim() === '' ? null : val),
    z.string().url().max(500).nullable().optional()
  ),
  // Id-based country, from the geography master data — used for the
  // visibility gate below. Optional so existing callers that only send the
  // free-text `country` above keep working.
  countryId: z.coerce.number().int().positive().optional(),
  // Visibility scope. Deliberately .optional() and NOT .default('COUNTRY'):
  // UpdateEventDto below is CreateEventDto.partial(), which does not strip a
  // ZodDefault — an update that omitted this field would parse to
  // 'COUNTRY', clear the service's `!== undefined` guard and silently
  // demote a WORLDWIDE event. create() applies the default instead (see
  // business.dto.ts's visibilityType for the same reasoning).
  visibilityType: z.enum(['COUNTRY', 'WORLDWIDE']).optional(),
});

export const UpdateEventDto = CreateEventDto.partial();

export const ListEventsQueryDto = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  pincode: z.string().optional(),
  /** Used only when sortBy='near' — events matching this pincode sort first. Does not filter results. */
  nearPincode: z.string().optional(),
  eventMode: z.enum(['Offline', 'Online', 'Hybrid']).optional(),
  search: z.string().optional(),
  country: z.string().optional(),
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

export const RejectEventDto = z.object({
  reason: z.string().trim().max(500).optional(),
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
