import { z } from 'zod';

export const CreateJobDto = z.object({
  title: z.string().min(1, 'Job title is required'),
  specification: z.string().optional(),
  description: z.string().optional(),
  images: z.array(z.string()).optional(),
  location: z.string().optional(),
  pincode: z.string().optional(),
  country: z.string().optional(),
  contactInfo: z.string().optional(),
  salary: z.string().optional(),
  jobType: z.string().optional(),
  timing: z.string().optional(),
});

export const UpdateJobDto = CreateJobDto.partial();

export const ListJobsQueryDto = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  pincode: z.string().optional(),
  search: z.string().optional(),
});

export type CreateJobDtoType = z.infer<typeof CreateJobDto>;
export type UpdateJobDtoType = z.infer<typeof UpdateJobDto>;
export type ListJobsQueryDtoType = z.infer<typeof ListJobsQueryDto>;
