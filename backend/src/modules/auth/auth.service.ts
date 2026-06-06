import bcrypt from 'bcryptjs';
import db from '../../config/db';
import { AppError } from '../../middleware/errorHandler';
import { generateTokenPair, verifyRefreshToken, JwtPayload } from '../../services/token.service';
import { sendOtp, deliverOtp, verifyOtp, getUserIdByPhone } from '../../services/otp.service';
import { env } from '../../config/env';
import type { RegisterDtoType, LoginDtoType, ForgotPasswordDtoType, ResetPasswordDtoType } from './auth.dto';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface UserRow {
  id: string;
  email: string | null;
  user_name: string;
  display_name: string;
  phone_no: string | null;
  avatar: string | null;
  role: string;
  role_level: number;
  country_id: number | null;
  country: string;
  location: string | null;
  pincode: string | null;
  interests: string[];
  professional_category: string | null;
  bio: string | null;
  is_trusted: boolean;
  is_blocked: boolean;
  is_active: boolean;
  profile_completion: number;
  refresh_token: string | null;
  password: string;
  created_at: Date;
  updated_at: Date;
}

function toJwtPayload(user: UserRow): JwtPayload {
  return {
    sub: user.id,
    userName: user.user_name,
    role: user.role,
    roleLevel: user.role_level,
  };
}

function stripSensitive(user: UserRow) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { password, refresh_token, ...safe } = user;
  return safe;
}

// ---------------------------------------------------------------------------
// checkPhoneExists
// ---------------------------------------------------------------------------
export async function checkPhoneExists(phone: string): Promise<boolean> {
  const user = await db('users').where({ phone_no: phone }).first();
  return !!user;
}

// ---------------------------------------------------------------------------
// register
// ---------------------------------------------------------------------------
export async function register(dto: RegisterDtoType) {
  // Check username uniqueness
  const existingUser = await db('users').where({ user_name: dto.user_name }).first();
  if (existingUser) throw new AppError(409, 'Username already taken');

  // Check email uniqueness if provided
  if (dto.email) {
    const existingEmail = await db('users').where({ email: dto.email }).first();
    if (existingEmail) throw new AppError(409, 'Email already registered');
  }

  // Check phone uniqueness (safety net — primary check is in send-otp)
  if (dto.phone_no) {
    const existingPhone = await db('users').where({ phone_no: dto.phone_no }).first();
    if (existingPhone) throw new AppError(409, 'Mobile number already registered with another account');
  }

  const hashedPassword = await bcrypt.hash(dto.password, 10);

  const [user] = await db('users')
    .insert({
      user_name: dto.user_name,
      display_name: dto.display_name,
      phone_no: dto.phone_no,
      password: hashedPassword,
      country_id: dto.country_id,
      email: dto.email ?? null,
      role_level: 1,
    })
    .returning('*');

  const tokens = generateTokenPair(toJwtPayload(user as UserRow));

  await db('users').where({ id: (user as UserRow).id }).update({ refresh_token: tokens.refreshToken });

  return {
    ...tokens,
    user: {
      ...stripSensitive(user as UserRow),
      roleLevel: 1,
    },
  };
}

// ---------------------------------------------------------------------------
// login
// ---------------------------------------------------------------------------
export async function login(dto: LoginDtoType) {
  // Support username OR email lookup
  const user = await db('users')
    .where(function () {
      this.where({ user_name: dto.identifier }).orWhere({ email: dto.identifier });
    })
    .first() as UserRow | undefined;

  if (!user) throw new AppError(401, 'Invalid credentials');

  const isPasswordValid = await bcrypt.compare(dto.password, user.password);
  if (!isPasswordValid) throw new AppError(401, 'Invalid credentials');

  if (user.is_blocked) throw new AppError(403, 'Your account has been blocked');

  const tokens = generateTokenPair(toJwtPayload(user));
  await db('users').where({ id: user.id }).update({ refresh_token: tokens.refreshToken });

  return {
    ...tokens,
    user: {
      ...stripSensitive(user),
      roleLevel: user.role === 'ADMIN' ? 100 : 1,
    },
  };
}

// ---------------------------------------------------------------------------
// adminLogin
// ---------------------------------------------------------------------------
export async function adminLogin(dto: LoginDtoType) {
  const user = await db('users')
    .where(function () {
      this.where({ user_name: dto.identifier }).orWhere({ email: dto.identifier });
    })
    .first() as UserRow | undefined;

  if (!user) throw new AppError(401, 'Invalid credentials');

  const isPasswordValid = await bcrypt.compare(dto.password, user.password);
  if (!isPasswordValid) throw new AppError(401, 'Invalid credentials');

  if (user.role !== 'ADMIN') throw new AppError(403, 'Access denied. Admin only.');

  const tokens = generateTokenPair(toJwtPayload(user));
  await db('users').where({ id: user.id }).update({ refresh_token: tokens.refreshToken });

  return {
    ...tokens,
    user: {
      ...stripSensitive(user),
      roleLevel: 100,
    },
  };
}

// ---------------------------------------------------------------------------
// checkUsername
// ---------------------------------------------------------------------------
export async function checkUsername(username: string): Promise<{ exists: boolean }> {
  const user = await db('users').where({ user_name: username }).first();
  return { exists: !!user };
}

// ---------------------------------------------------------------------------
// lookupUser
// ---------------------------------------------------------------------------
export async function lookupUser(query: string): Promise<{ found: boolean; dialCode?: string; countryName?: string }> {
  const row = await db('users')
    .leftJoin('master_countries', 'users.country_id', 'master_countries.id')
    .where(function () {
      this.where({ 'users.user_name': query }).orWhere({ 'users.email': query });
    })
    .select('users.id', 'master_countries.dial_code', 'master_countries.name as country_name')
    .first() as { id: string; dial_code: string | null; country_name: string | null } | undefined;

  if (!row) return { found: false };

  return {
    found: true,
    dialCode: row.dial_code ?? undefined,
    countryName: row.country_name ?? undefined,
  };
}

// ---------------------------------------------------------------------------
// forgotPasswordSendOtp
// ---------------------------------------------------------------------------
export async function forgotPasswordSendOtp(dto: ForgotPasswordDtoType): Promise<{ success: boolean; message: string; devOtp?: string }> {
  const user = await db('users')
    .where(function () {
      this.where({ user_name: dto.usernameOrEmail }).orWhere({ email: dto.usernameOrEmail });
    })
    .andWhere({ phone_no: dto.phoneNumber })
    .first() as UserRow | undefined;

  if (!user) throw new AppError(404, 'User not found. Please check your details and try again.');

  const otp = sendOtp(dto.phoneNumber, user.id);
  await deliverOtp(dto.phoneNumber, otp);

  const result: { success: boolean; message: string; devOtp?: string } = {
    success: true,
    message: 'OTP sent successfully',
  };

  if (env.NODE_ENV !== 'production') {
    result.devOtp = otp;
  }

  return result;
}

// ---------------------------------------------------------------------------
// resetPasswordVerify
// ---------------------------------------------------------------------------
export async function resetPasswordVerify(dto: ResetPasswordDtoType): Promise<{ success: boolean; message: string }> {
  // Retrieve userId before verifyOtp — verifyOtp deletes the store entry on
  // success, so getUserIdByPhone would return null if called afterwards.
  const userId = getUserIdByPhone(dto.phoneNumber);
  if (!userId) throw new AppError(400, 'OTP session expired. Please request a new OTP.');

  const otpResult = verifyOtp(dto.phoneNumber, dto.otp);
  if (!otpResult.success) {
    throw new AppError(400, otpResult.message);
  }

  const hashedPassword = await bcrypt.hash(dto.newPassword, 10);
  await db('users').where({ id: userId }).update({ password: hashedPassword });

  // verifyOtp already cleared the store entry on success; no need to clearOtp here.

  return { success: true, message: 'Password updated successfully' };
}

// ---------------------------------------------------------------------------
// refreshToken
// ---------------------------------------------------------------------------
export async function refreshToken(rawToken: string) {
  try {
    const payload = verifyRefreshToken(rawToken);

    const user = await db('users').where({ id: payload.sub }).first() as UserRow | undefined;

    if (!user || user.refresh_token !== rawToken) {
      throw new AppError(401, 'Invalid refresh token');
    }

    const tokens = generateTokenPair(toJwtPayload(user));
    await db('users').where({ id: user.id }).update({ refresh_token: tokens.refreshToken });

    return tokens;
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError(401, 'Invalid refresh token');
  }
}

// ---------------------------------------------------------------------------
// logout
// ---------------------------------------------------------------------------
export async function logout(userId: string): Promise<void> {
  await db('users').where({ id: userId }).update({ refresh_token: null });
}

// ---------------------------------------------------------------------------
// getProfile
// ---------------------------------------------------------------------------
export async function getProfile(userId: string) {
  const user = await db('users').where({ id: userId }).first() as UserRow | undefined;

  if (!user) throw new AppError(401, 'User not found');

  return {
    ...stripSensitive(user),
    roleLevel: user.role === 'ADMIN' ? 100 : 1,
  };
}
