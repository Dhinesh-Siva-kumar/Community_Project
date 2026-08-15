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
  locationLink: z.string().url().optional(), // Added
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
  status: z.enum(['active', 'inactive']).optional(),
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'dateFrom must be YYYY-MM-DD').optional(),
  dateTo:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'dateTo must be YYYY-MM-DD').optional(),
  /** Filters on event_date (when the event happens), unlike dateFrom/dateTo which filter created_at. */
  eventDateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'eventDateFrom must be YYYY-MM-DD').optional(),
  eventDateTo:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'eventDateTo must be YYYY-MM-DD').optional(),
  sortBy:   z.enum(['name', 'eventDate', 'joined', 'near']).default('eventDate'),
  sortDir:  z.enum(['asc', 'desc']).default('asc'),
});

export type CreateEventDtoType = z.infer<typeof CreateEventDto>;
export type UpdateEventDtoType = z.infer<typeof UpdateEventDto>;
export type ListEventsQueryDtoType = z.infer<typeof ListEventsQueryDto>;
