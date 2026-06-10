import bcrypt from 'bcryptjs';
import { OAuth2Client } from 'google-auth-library';
import db from '../../config/db';
import { AppError } from '../../middleware/errorHandler';
import { generateTokenPair, verifyRefreshToken, JwtPayload } from '../../services/token.service';
import { sendOtp, deliverOtp, verifyOtp, getUserIdByPhone } from '../../services/otp.service';
import { env } from '../../config/env';
import type {
  RegisterDtoType,
  LoginDtoType,
  ForgotPasswordDtoType,
  ResetPasswordDtoType,
  GoogleInitiateDtoType,
  GoogleCompleteDtoType,
} from './auth.dto';

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
  password: string | null;      // nullable — Google users have no password
  is_google: boolean;
  google_id: string | null;
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

/**
 * Maps a raw DB UserRow (snake_case) to the camelCase shape the frontend
 * User interface expects.  Pass an explicit `roleLevel` to override the
 * default (100 for ADMIN, 1 for everyone else).
 */
function toClientUser(user: UserRow, roleLevel?: number): object {
  return {
    id:                   user.id,
    email:                user.email,
    userName:             user.user_name,
    displayName:          user.display_name,
    phoneNo:              user.phone_no,
    avatar:               user.avatar,
    role:                 user.role,
    roleLevel:            roleLevel ?? (user.role === 'ADMIN' ? 100 : 1),
    countryId:            user.country_id,
    country:              user.country,
    location:             user.location,
    pincode:              user.pincode,
    interests:            user.interests,
    professionalCategory: user.professional_category,
    bio:                  user.bio,
    isTrusted:            user.is_trusted,
    isBlocked:            user.is_blocked,
    isActive:             user.is_active,
    profileCompletion:    user.profile_completion,
    createdAt:            String(user.created_at),
    updatedAt:            String(user.updated_at),
  };
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
  const countryName = await lookupCountryName(dto.country_id);

  const [user] = await db('users')
    .insert({
      user_name:    dto.user_name,
      display_name: dto.display_name,
      phone_no:     dto.phone_no,
      password:     hashedPassword,
      country_id:   dto.country_id,
      country:      countryName,
      email:        dto.email ?? null,
      role_level:   1,
    })
    .returning('*');

  const tokens = generateTokenPair(toJwtPayload(user as UserRow));

  await db('users').where({ id: (user as UserRow).id }).update({ refresh_token: tokens.refreshToken });

  // Enrol the new user in any active default communities they qualify for
  await autoJoinDefaultCommunities((user as UserRow).id, countryName);

  return {
    ...tokens,
    user: toClientUser(user as UserRow, 1),
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

  // Guard: Google-only accounts have no password
  if (!user.password) {
    throw new AppError(401, 'This account uses Google sign-in. Please use the "Continue with Google" button to sign in.');
  }

  const isPasswordValid = await bcrypt.compare(dto.password, user.password);
  if (!isPasswordValid) throw new AppError(401, 'Invalid credentials');

  if (user.is_blocked) throw new AppError(403, 'Your account has been blocked');

  const tokens = generateTokenPair(toJwtPayload(user));
  await db('users').where({ id: user.id }).update({ refresh_token: tokens.refreshToken });

  return {
    ...tokens,
    user: toClientUser(user),
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

  if (!user.password) {
    throw new AppError(401, 'This account uses Google sign-in and cannot access the admin panel.');
  }

  const isPasswordValid = await bcrypt.compare(dto.password, user.password);
  if (!isPasswordValid) throw new AppError(401, 'Invalid credentials');

  if (user.role !== 'ADMIN') throw new AppError(403, 'Access denied. Admin only.');

  const tokens = generateTokenPair(toJwtPayload(user));
  await db('users').where({ id: user.id }).update({ refresh_token: tokens.refreshToken });

  return {
    ...tokens,
    user: toClientUser(user, 100),
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

  return toClientUser(user);
}

// ---------------------------------------------------------------------------
// Google OAuth helpers
// ---------------------------------------------------------------------------

let googleClient: OAuth2Client | null = null;

function getGoogleClient(): OAuth2Client {
  if (!env.GOOGLE_CLIENT_ID) {
    throw new AppError(500, 'Google authentication is not configured on this server.');
  }
  if (!googleClient) {
    googleClient = new OAuth2Client(env.GOOGLE_CLIENT_ID);
  }
  return googleClient;
}

async function verifyGoogleToken(credential: string) {
  const client = getGoogleClient();
  try {
    const ticket = await client.verifyIdToken({
      idToken: credential,
      audience: env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    if (!payload) throw new AppError(400, 'Invalid Google credential. Please try again.');
    return payload;
  } catch (err) {
    if (err instanceof AppError) throw err;
    // Log the raw error so it's visible in server logs for debugging
    console.error('[Google OAuth] Token verification failed:', (err as Error).message);
    throw new AppError(401, 'Google sign-in failed. Please try again.');
  }
}

function deriveUsername(email: string, name?: string): string {
  const source = email ? email.split('@')[0] : (name ?? 'user');
  const clean = source.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 20).toLowerCase();
  return clean || 'user';
}

async function findAvailableUsername(base: string): Promise<string | null> {
  const truncated = base.slice(0, 20);
  const existing = await db('users').where({ user_name: truncated }).first();
  if (!existing) return truncated;

  for (let i = 1; i <= 99; i++) {
    const suffix = String(i);
    const candidate = base.slice(0, 20 - suffix.length) + suffix;
    const row = await db('users').where({ user_name: candidate }).first();
    if (!row) return candidate;
  }
  return null;
}

/**
 * Looks up the human-readable country name from master_countries by ID.
 * Falls back to 'United Kingdom' (the column's DB default) when the ID is
 * absent or not found, so the `country` string column is always populated.
 */
async function lookupCountryName(countryId: number | null | undefined): Promise<string> {
  if (!countryId) return 'United Kingdom';
  const row = await db('master_countries').where({ id: countryId }).select('name').first() as { name: string } | undefined;
  return row?.name ?? 'United Kingdom';
}

// ---------------------------------------------------------------------------
// Private helper — enrol a newly-created user in every active default
// community they are eligible for (global communities, or private communities
// whose country matches the user's country).
// Uses a batch insert with ON CONFLICT ignore so it is always idempotent.
// ---------------------------------------------------------------------------
async function autoJoinDefaultCommunities(userId: string, userCountry: string): Promise<void> {
  const defaults = await db('communities')
    .where({ is_default: true, is_active: true })
    .select('id', 'is_global', 'is_private', 'country');

  const rows = (defaults as Array<{ id: string; is_global: boolean; is_private: boolean; country: string | null }>)
    .filter((c) => c.is_global || (c.is_private && c.country === userCountry))
    .map((c) => ({ user_id: userId, community_id: c.id }));

  if (rows.length === 0) return;

  await db('community_members').insert(rows).onConflict(['user_id', 'community_id']).ignore();
}

// ---------------------------------------------------------------------------
// googleInitiate
// Verifies the GIS credential and either:
//   a) Logs the user in (existing Google account)
//   b) Returns 409 if email already registered via normal auth
//   c) Auto-creates account if derived username is available → returns tokens
//   d) Returns { needsUsername: true, suggestedUsername } when derived
//      username has a conflict → frontend prompts user to pick
// ---------------------------------------------------------------------------
export async function googleInitiate(dto: GoogleInitiateDtoType) {
  const payload = await verifyGoogleToken(dto.credential);
  const googleId = payload.sub;
  const email = payload.email ?? null;
  const name = payload.name ?? payload.given_name ?? 'User';

  // (a) Existing Google account → login
  const existingGoogle = await db('users').where({ google_id: googleId }).first() as UserRow | undefined;
  if (existingGoogle) {
    if (existingGoogle.is_blocked) throw new AppError(403, 'Your account has been blocked.');
    const tokens = generateTokenPair(toJwtPayload(existingGoogle));
    await db('users').where({ id: existingGoogle.id }).update({ refresh_token: tokens.refreshToken });
    return {
      needsUsername: false as const,
      isNewUser:     false as const,
      ...tokens,
      user: toClientUser(existingGoogle, 1),
    };
  }

  // (b) Email already registered via normal auth → 409
  if (email) {
    const existingEmail = await db('users').where({ email }).first() as UserRow | undefined;
    if (existingEmail && !existingEmail.is_google) {
      throw new AppError(409, 'An account with this email already exists. Please sign in with your password.');
    }
  }

  // (c) / (d) Derive username and check availability
  const base = deriveUsername(email ?? '', name);
  const availableUsername = await findAvailableUsername(base);

  if (!availableUsername) {
    // Extremely rare — let user pick freely
    return { needsUsername: true as const, suggestedUsername: base };
  }

  // If the base was taken, availableUsername is a numbered variant → prompt user
  if (availableUsername !== base) {
    return { needsUsername: true as const, suggestedUsername: availableUsername };
  }

  // (c) Base username is free → auto-create silently
  const countryName = await lookupCountryName(dto.country_id);
  const [user] = await db('users')
    .insert({
      user_name:    availableUsername,
      display_name: name,
      email,
      google_id:    googleId,
      is_google:    true,
      password:     null,
      role_level:   1,
      country_id:   dto.country_id ?? null,
      country:      countryName,
    })
    .returning('*');

  const tokens = generateTokenPair(toJwtPayload(user as UserRow));
  await db('users').where({ id: (user as UserRow).id }).update({ refresh_token: tokens.refreshToken });

  // Enrol the new user in any active default communities they qualify for
  await autoJoinDefaultCommunities((user as UserRow).id, countryName);

  return {
    needsUsername: false as const,
    isNewUser:     true as const,
    ...tokens,
    user: toClientUser(user as UserRow, 1),
  };
}

// ---------------------------------------------------------------------------
// googleComplete
// Called when the user has chosen a username after googleInitiate returned
// needsUsername: true. Re-verifies the credential, validates username, creates.
// ---------------------------------------------------------------------------
export async function googleComplete(dto: GoogleCompleteDtoType) {
  const payload = await verifyGoogleToken(dto.credential);
  const googleId = payload.sub;
  const email = payload.email ?? null;
  const name = payload.name ?? payload.given_name ?? 'User';

  // If the account was created between initiate and complete, just log in
  const existingGoogle = await db('users').where({ google_id: googleId }).first() as UserRow | undefined;
  if (existingGoogle) {
    const tokens = generateTokenPair(toJwtPayload(existingGoogle));
    await db('users').where({ id: existingGoogle.id }).update({ refresh_token: tokens.refreshToken });
    return {
      isNewUser: false as const,
      ...tokens,
      user: toClientUser(existingGoogle, 1),
    };
  }

  // Username uniqueness check
  const existingUsername = await db('users').where({ user_name: dto.username }).first();
  if (existingUsername) throw new AppError(409, 'Username already taken. Please choose a different one.');

  // Email conflict (should have been caught in initiate, but double-check)
  if (email) {
    const existingEmail = await db('users').where({ email }).first() as UserRow | undefined;
    if (existingEmail) throw new AppError(409, 'An account with this email already exists.');
  }

  const countryName = await lookupCountryName(dto.country_id);
  const [user] = await db('users')
    .insert({
      user_name:    dto.username,
      display_name: name,
      email,
      google_id:    googleId,
      is_google:    true,
      password:     null,
      role_level:   1,
      country_id:   dto.country_id ?? null,
      country:      countryName,
    })
    .returning('*');

  const tokens = generateTokenPair(toJwtPayload(user as UserRow));
  await db('users').where({ id: (user as UserRow).id }).update({ refresh_token: tokens.refreshToken });

  // Enrol the new user in any active default communities they qualify for
  await autoJoinDefaultCommunities((user as UserRow).id, countryName);

  return {
    isNewUser: true as const,
    ...tokens,
    user: toClientUser(user as UserRow, 1),
  };
}
