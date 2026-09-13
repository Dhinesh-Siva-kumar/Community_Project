import { z } from 'zod';

// ─────────────────────────────────────────────────────────────
// Helpers (each module defines its own, per repo convention)
// ─────────────────────────────────────────────────────────────
const optionalInt = z.coerce.number().int().min(0).optional();
const optionalBool = z.coerce.boolean().optional();

export const STUDY_LEVELS = ["Bachelor's", "Master's", 'PhD', 'Diploma'] as const;
export const MENTORING_TYPES = ['free_chat', 'paid_chat', 'paid_call'] as const;
export const REPORT_REASONS = ['spam', 'harassment', 'misleading', 'fake_profile', 'other'] as const;

// ─────────────────────────────────────────────────────────────
// RegisterStudentProfileDto — the 4-step registration wizard's payload
// (STUDENT_CONNECT_SPEC.md §5.1). UpdateStudentProfileDto is always
// derived via .partial(), matching UpdateJobDto = CreateJobDto.partial().
// ─────────────────────────────────────────────────────────────
export const RegisterStudentProfileDto = z.object({
  firstName: z.string().trim().min(1, 'First name is required'),
  photoUrl: z.string().optional(),

  countryId: z.coerce.number().int().positive(),
  regionId: z.coerce.number().int().positive().optional(),
  cityId: z.coerce.number().int().positive().optional(),
  cityFreeText: z.string().trim().optional(),

  universityId: z.coerce.number().int().positive().optional(),
  universityFreeText: z.string().trim().optional(),
  course: z.string().trim().min(1, 'Course is required'),
  studyLevel: z.enum(STUDY_LEVELS),
  yearOfStudy: z.string().trim().min(1, 'Year of study is required'),

  languages: z.array(z.string().trim().min(1)).min(1, 'At least one language is required'),
  shortIntro: z.string().trim().min(1, 'A short introduction is required'),

  previousCountryId: z.coerce.number().int().positive().optional(),
  academicBackground: z.string().trim().optional(),
  areasOfHelp: z.array(z.string().trim().min(1)).optional().default([]),
});

export const UpdateStudentProfileDto = RegisterStudentProfileDto.partial().extend({
  mentorAvailable: optionalBool,
  mentoringType: z.enum(MENTORING_TYPES).optional(),
});

// ─────────────────────────────────────────────────────────────
// Discover search — field-for-field match with STUDENT_CONNECT_SPEC.md §8.5
// ─────────────────────────────────────────────────────────────
export const SearchStudentsQueryDto = z.object({
  q: z.string().trim().optional(),
  countryId: z.coerce.number().int().positive().optional(),
  studyLevel: z.enum(STUDY_LEVELS).optional(),
  language: z.string().trim().optional(),
  verifiedOnly: optionalBool,
  mentorOnly: optionalBool,
  freeOnly: optionalBool,
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const CreateConnectionRequestDto = z.object({
  toUserId: z.string().uuid(),
  message: z.string().trim().min(1).max(1000),
});

export const RejectVerificationDto = z.object({
  reason: z.string().trim().min(1, 'Please describe why more information is needed').max(500),
});

export const CreateStudentReportDto = z.object({
  targetUserId: z.string().uuid(),
  reason: z.enum(REPORT_REASONS),
  messageId: z.string().uuid().optional(),
});

export const SendChatMessageDto = z.object({
  text: z.string().trim().min(1).max(2000),
});

export const ListChatMessagesQueryDto = z.object({
  before: z.string().optional(),
  limit: optionalInt.default(30),
});

export type RegisterStudentProfileDtoType = z.infer<typeof RegisterStudentProfileDto>;
export type UpdateStudentProfileDtoType = z.infer<typeof UpdateStudentProfileDto>;
export type SearchStudentsQueryDtoType = z.infer<typeof SearchStudentsQueryDto>;
export type CreateConnectionRequestDtoType = z.infer<typeof CreateConnectionRequestDto>;
export type RejectVerificationDtoType = z.infer<typeof RejectVerificationDto>;
export type CreateStudentReportDtoType = z.infer<typeof CreateStudentReportDto>;
export type SendChatMessageDtoType = z.infer<typeof SendChatMessageDto>;
export type ListChatMessagesQueryDtoType = z.infer<typeof ListChatMessagesQueryDto>;
