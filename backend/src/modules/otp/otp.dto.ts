import { z } from 'zod';

export const SendOtpDto = z.object({
  mobile: z.string().min(1, 'Mobile number is required'),
});

export const VerifyOtpDto = z.object({
  mobile: z.string().min(1, 'Mobile number is required'),
  otp: z.string().min(1, 'OTP is required'),
});

export type SendOtpDtoType = z.infer<typeof SendOtpDto>;
export type VerifyOtpDtoType = z.infer<typeof VerifyOtpDto>;
