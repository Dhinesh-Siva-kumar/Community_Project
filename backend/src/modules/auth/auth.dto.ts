import { z } from 'zod';

export const RegisterDto = z.object({
  user_name: z.string().min(1, 'Username is required'),
  display_name: z.string().min(1, 'Display name is required'),
  phone_no: z.string().min(1, 'Phone number is required'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  country_id: z.number().int().positive(),
  email: z.string().email().optional(),
});

export const LoginDto = z.object({
  identifier: z.string().min(1, 'Username or email is required'),
  password: z.string().min(1, 'Password is required'),
});

export const ForgotPasswordDto = z.object({
  usernameOrEmail: z.string().min(1),
  phoneNumber: z.string().min(1),
});

export const ResetPasswordDto = z.object({
  usernameOrEmail: z.string().min(1),
  phoneNumber: z.string().min(1),
  otp: z.string().min(1),
  newPassword: z.string().min(6),
});

export const RefreshTokenDto = z.object({
  refreshToken: z.string().min(1),
});

export type RegisterDtoType = z.infer<typeof RegisterDto>;
export type LoginDtoType = z.infer<typeof LoginDto>;
export type ForgotPasswordDtoType = z.infer<typeof ForgotPasswordDto>;
export type ResetPasswordDtoType = z.infer<typeof ResetPasswordDto>;
export type RefreshTokenDtoType = z.infer<typeof RefreshTokenDto>;
