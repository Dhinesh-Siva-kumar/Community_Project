import { z } from 'zod';

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────
const optionalEmail = z.string().email().optional().or(z.literal(''));
const optionalUrl   = z.string().url().optional().or(z.literal(''));
const optionalInt   = z.coerce.number().int().min(0).optional();
const optionalBool  = z.coerce.boolean().optional();

// ─────────────────────────────────────────────────────────────
// CreateJobDto
// ─────────────────────────────────────────────────────────────
export const CreateJobDto = z.object({
  // ── Existing fields (kept for backward compatibility) ────────
  title:         z.string().min(1, 'Job title is required'),
  specification: z.string().optional(),
  description:   z.string().optional(),
  images:        z.array(z.string()).optional(),
  location:      z.string().optional(),
  pincode:       z.string().optional(),
  country:       z.string().optional(),
  contactInfo:   z.string().optional(),
  salary:        z.string().optional(),
  jobType:       z.string().optional(),
  timing:        z.string().optional(),

  // ── Company ──────────────────────────────────────────────────
  companyName:    z.string().optional(),
  companyLogo:    z.string().optional(),
  companyWebsite: optionalUrl,

  // ── Location ─────────────────────────────────────────────────
  city:        z.string().optional(),
  state:       z.string().optional(),
  fullAddress: z.string().optional(),
  isRemote:    optionalBool,
  workMode:    z.enum(['Remote', 'Hybrid', 'On-site']).optional(),

  // ── Role ─────────────────────────────────────────────────────
  expMin:    optionalInt,
  expMax:    optionalInt,
  education: z.string().optional(),
  openings:  z.coerce.number().int().min(1).optional(),
  shiftType: z.enum(['Day', 'Night', 'Rotational', 'Flexible']).optional(),

  // ── Salary ───────────────────────────────────────────────────
  salaryMin:      optionalInt,
  salaryMax:      optionalInt,
  salaryType:     z.enum(['Fixed', 'Hourly', 'Monthly', 'Annual']).optional(),
  salaryCurrency: z.string().optional(),
  salaryHidden:   optionalBool,

  // ── Schedule ─────────────────────────────────────────────────
  workStartTime: z.string().optional(),
  workEndTime:   z.string().optional(),
  workingDays:   z.array(z.string()).optional(),

  // ── Contact ──────────────────────────────────────────────────
  contactPerson:  z.string().optional(),
  contactEmail:   optionalEmail,
  contactPhone:   z.string().optional(),
  applicationUrl: optionalUrl,

  // ── Content ──────────────────────────────────────────────────
  skills: z.array(z.string()).optional(),
  // Note: description is declared above in the legacy fields block —
  // it now serves as the unified job description field.
});

export const UpdateJobDto = CreateJobDto.partial();

// ─────────────────────────────────────────────────────────────
// ListJobsQueryDto — extended with all filter/sort params
// ─────────────────────────────────────────────────────────────
export const ListJobsQueryDto = z.object({
  // ── Pagination ───────────────────────────────────────────────
  page:  z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),

  // ── Existing ─────────────────────────────────────────────────
  pincode: z.string().optional(),
  search:  z.string().optional(),

  // ── Location filters ─────────────────────────────────────────
  country: z.string().optional(),
  state:   z.string().optional(),
  city:    z.string().optional(),

  // ── Role filters ─────────────────────────────────────────────
  jobType:   z.string().optional(),
  workMode:  z.string().optional(),
  shiftType: z.string().optional(),
  education: z.string().optional(),

  // ── Experience range ─────────────────────────────────────────
  expMin: z.coerce.number().int().min(0).optional(),
  expMax: z.coerce.number().int().min(0).optional(),

  // ── Salary range & visibility ────────────────────────────────
  salaryMin:    z.coerce.number().int().min(0).optional(),
  salaryMax:    z.coerce.number().int().min(0).optional(),
  salaryHidden: z.coerce.boolean().optional(),

  // ── Date range (N days ago) ──────────────────────────────────
  postedWithin: z.coerce.number().int().min(1).optional(),

  // ── Sorting ──────────────────────────────────────────────────
  sortBy: z.enum([
    'newest', 'oldest',
    'salary_high', 'salary_low',
    'company_az',
  ]).optional(),
});

export type CreateJobDtoType     = z.infer<typeof CreateJobDto>;
export type UpdateJobDtoType     = z.infer<typeof UpdateJobDto>;
export type ListJobsQueryDtoType = z.infer<typeof ListJobsQueryDto>;
