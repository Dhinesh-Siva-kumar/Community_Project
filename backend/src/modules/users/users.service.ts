import db from '../../config/db';
import bcrypt from 'bcryptjs';
import path from 'path';
import fs from 'fs';
import { AppError } from '../../middleware/errorHandler';
import { env } from '../../config/env';
import { logAudit } from '../../services/audit.service';
import type {
  UpdateUserDtoType,
  AdminCreateUserDtoType,
  AdminChangeRoleDtoType,
  AdminResetPasswordDtoType,
  BroadcastNotificationDtoType,
} from './users.dto';

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
  created_at: Date;
  updated_at: Date;
  password: string;
  refresh_token: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function stripSensitive(user: UserRow) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { password, refresh_token, ...safe } = user;
  return safe;
}

/** Maps a raw DB UserRow (snake_case) to the camelCase shape the frontend expects. */
function toClientUser(user: UserRow) {
  return {
    id:                   user.id,
    email:                user.email,
    userName:             user.user_name,
    displayName:          user.display_name,
    phoneNo:              user.phone_no,
    avatar:               user.avatar,
    role:                 user.role,
    roleLevel:            user.role_level,
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

function calculateProfileCompletion(user: UserRow): number {
  const fields = [
    user.user_name, user.display_name, user.email, user.phone_no,
    user.avatar, user.bio, user.location, user.pincode,
    user.interests && user.interests.length > 0 ? 'filled' : null,
    user.professional_category,
  ];
  const filled = fields.filter((f) => f !== null && f !== undefined && f !== '').length;
  return Math.round((filled / fields.length) * 100);
}

// ---------------------------------------------------------------------------
// Self-service profile
// ---------------------------------------------------------------------------
export async function getProfile(userId: string) {
  const user = await db('users').where({ id: userId }).first() as UserRow | undefined;
  if (!user) throw new AppError(404, 'User not found');

  const memberships = await db('community_members as cm')
    .join('communities as c', 'cm.community_id', 'c.id')
    .where('cm.user_id', userId)
    .select('cm.id', 'cm.community_id', 'cm.joined_at',
      'c.id as c_id', 'c.name as c_name', 'c.description as c_description', 'c.image as c_image');

  const communities = memberships.map((m: Record<string, unknown>) => ({
    id: m['id'],
    communityId: m['community_id'],
    joinedAt: m['joined_at'],
    community: { id: m['c_id'], name: m['c_name'], description: m['c_description'], image: m['c_image'] },
  }));

  return { ...toClientUser(user), communities };
}

export async function updateProfile(userId: string, data: UpdateUserDtoType) {
  if (data.avatar) {
    const currentUser = await db('users').where({ id: userId }).first() as UserRow | undefined;
    const oldAvatar = currentUser?.avatar;
    if (oldAvatar && oldAvatar.startsWith('/uploads/profiles/')) {
      const filePath = path.join(path.resolve(env.UPLOADS_PATH), 'profiles', path.basename(oldAvatar));
      try { fs.unlinkSync(filePath); } catch { /* ignore */ }
    }
  }

  const updateData: Record<string, unknown> = {};
  if (data.userName !== undefined) updateData['user_name'] = data.userName;
  if (data.displayName !== undefined) updateData['display_name'] = data.displayName;
  if (data.phoneNo !== undefined) updateData['phone_no'] = data.phoneNo;
  if (data.email !== undefined) {
    const currentUser = await db('users').where({ id: userId }).first() as UserRow;
    if (currentUser.email) throw new AppError(400, 'Email address cannot be changed once set');
    const taken = await db('users').where({ email: data.email }).whereNot({ id: userId }).first();
    if (taken) throw new AppError(409, 'Email address is already in use by another account');
    updateData['email'] = data.email;
  }
  if (data.countryId !== undefined) updateData['country_id'] = data.countryId;
  if (data.bio !== undefined) updateData['bio'] = data.bio;
  if (data.location !== undefined) updateData['location'] = data.location;
  if (data.pincode !== undefined) updateData['pincode'] = data.pincode;
  if (data.interests !== undefined) updateData['interests'] = data.interests;
  if (data.professionalCategory !== undefined) updateData['professional_category'] = data.professionalCategory;
  if (data.avatar !== undefined) updateData['avatar'] = data.avatar;

  if (Object.keys(updateData).length === 0) throw new AppError(400, 'No update fields provided');

  await db('users').where({ id: userId }).update(updateData);
  const updatedUser = await db('users').where({ id: userId }).first() as UserRow;
  const profileCompletion = calculateProfileCompletion(updatedUser);
  await db('users').where({ id: userId }).update({ profile_completion: profileCompletion });

  const finalUser = await db('users').where({ id: userId }).first() as UserRow;
  return toClientUser(finalUser);
}

// ---------------------------------------------------------------------------
// Admin — list users with full filter support
// ---------------------------------------------------------------------------
export async function getUsers(
  page: number,
  limit: number,
  search?: string,
  role?: 'ADMIN' | 'USER',
  status?: 'active' | 'blocked' | 'trusted',
  joined?: 'today' | '7d' | '30d' | '90d',
) {
  const offset = (page - 1) * limit;

  function applyFilters(q: ReturnType<typeof db>) {
    if (search) {
      q.where(function () {
        this.whereILike('user_name', `%${search}%`)
          .orWhereILike('display_name', `%${search}%`)
          .orWhereILike('email', `%${search}%`)
          .orWhereILike('phone_no', `%${search}%`);
      });
    }
    if (role) q.where({ role });
    if (status === 'blocked') q.where({ is_blocked: true });
    else if (status === 'active') q.where({ is_blocked: false, is_active: true });
    else if (status === 'trusted') q.where({ is_trusted: true });
    if (joined) {
      const now = new Date();
      const since = new Date(now);
      if (joined === 'today') since.setHours(0, 0, 0, 0);
      else if (joined === '7d')  since.setDate(now.getDate() - 7);
      else if (joined === '30d') since.setDate(now.getDate() - 30);
      else if (joined === '90d') since.setDate(now.getDate() - 90);
      q.where('created_at', '>=', since);
    }
  }

  const query = db('users').select(
    'id', 'email', 'user_name', 'display_name', 'phone_no', 'avatar',
    'role', 'role_level', 'country_id', 'country', 'location', 'pincode',
    'interests', 'professional_category', 'bio', 'is_trusted', 'is_blocked',
    'is_active', 'profile_completion', 'created_at', 'updated_at',
  );
  applyFilters(query);

  const countQuery = db('users').count({ total: '*' });
  applyFilters(countQuery);

  // Counts for stat cards (always un-filtered by user filters)
  const [users, [{ total }], [{ active }], [{ blocked }], [{ trusted }], [{ adminCount }]] = await Promise.all([
    query.orderBy('created_at', 'desc').limit(limit).offset(offset),
    countQuery,
    db('users').count({ active: '*' }).where({ is_blocked: false, is_active: true }),
    db('users').count({ blocked: '*' }).where({ is_blocked: true }),
    db('users').count({ trusted: '*' }).where({ is_trusted: true }),
    db('users').count({ adminCount: '*' }).where({ role: 'ADMIN' }),
  ]);

  return {
    data: (users as UserRow[]).map(toClientUser),
    total: Number(total),
    page,
    limit,
    totalPages: Math.ceil(Number(total) / limit),
    stats: {
      total:      Number(await db('users').count({ c: '*' }).then(r => (r[0] as any).c)),
      active:     Number(active),
      blocked:    Number(blocked),
      trusted:    Number(trusted),
      adminCount: Number(adminCount),
    },
  };
}

// ---------------------------------------------------------------------------
// Admin — get single user detail with activity stats
// ---------------------------------------------------------------------------
export async function getUserById(userId: string) {
  const user = await db('users').where({ id: userId }).first() as UserRow | undefined;
  if (!user) throw new AppError(404, 'User not found');

  const [[{ posts }], [{ comments }], [{ communities }]] = await Promise.all([
    db('posts').count({ posts: '*' }).where({ user_id: userId }),
    db('comments').count({ comments: '*' }).where({ user_id: userId }),
    db('community_members').count({ communities: '*' }).where({ user_id: userId }),
  ]);

  return {
    ...toClientUser(user),
    activity: {
      posts:       Number(posts),
      comments:    Number(comments),
      communities: Number(communities),
    },
  };
}

// ---------------------------------------------------------------------------
// Admin — create user
// ---------------------------------------------------------------------------
export async function adminCreateUser(adminId: string, data: AdminCreateUserDtoType) {
  const existing = await db('users').where({ user_name: data.userName }).first();
  if (existing) throw new AppError(409, 'Username is already taken');

  if (data.email) {
    const emailTaken = await db('users').where({ email: data.email }).first();
    if (emailTaken) throw new AppError(409, 'Email is already in use');
  }

  const hashedPassword = await bcrypt.hash(data.password, 10);

  let countryName = 'United Kingdom';
  if (data.countryId) {
    const country = await db('master_countries').where({ id: data.countryId }).first() as { name: string } | undefined;
    if (country) countryName = country.name;
  }

  const [user] = await db('users').insert({
    user_name:    data.userName,
    display_name: data.displayName,
    email:        data.email ?? null,
    phone_no:     data.phoneNo ?? null,
    password:     hashedPassword,
    role:         data.role,
    role_level:   data.role === 'ADMIN' ? 100 : 1,
    country_id:   data.countryId ?? null,
    country:      countryName,
    is_active:    true,
  }).returning('*');

  await logAudit(adminId, 'USER_CREATED', { createdUser: data.userName, role: data.role }, 'users', (user as UserRow).id);

  return toClientUser(user as UserRow);
}

// ---------------------------------------------------------------------------
// Admin — soft delete
// ---------------------------------------------------------------------------
export async function softDeleteUser(adminId: string, userId: string) {
  const user = await db('users').where({ id: userId }).first() as UserRow | undefined;
  if (!user) throw new AppError(404, 'User not found');
  if (user.role === 'ADMIN') throw new AppError(403, 'Cannot delete an admin account');

  await db('users').where({ id: userId }).update({ is_active: false, is_blocked: true });
  await logAudit(adminId, 'USER_DELETED', { deletedUser: user.user_name }, 'users', userId);

  return { success: true, message: 'User deactivated' };
}

// ---------------------------------------------------------------------------
// Admin — change role
// ---------------------------------------------------------------------------
export async function changeUserRole(adminId: string, userId: string, data: AdminChangeRoleDtoType) {
  const user = await db('users').where({ id: userId }).first() as UserRow | undefined;
  if (!user) throw new AppError(404, 'User not found');

  const roleLevel = data.role === 'ADMIN' ? 100 : 1;
  await db('users').where({ id: userId }).update({ role: data.role, role_level: roleLevel });
  await logAudit(adminId, 'ROLE_CHANGED', { user: user.user_name, from: user.role, to: data.role }, 'users', userId);

  const updated = await db('users').where({ id: userId }).first() as UserRow;
  return toClientUser(updated);
}

// ---------------------------------------------------------------------------
// Admin — reset password
// ---------------------------------------------------------------------------
export async function adminResetPassword(adminId: string, userId: string, data: AdminResetPasswordDtoType) {
  const user = await db('users').where({ id: userId }).first() as UserRow | undefined;
  if (!user) throw new AppError(404, 'User not found');

  const hashed = await bcrypt.hash(data.newPassword, 10);
  await db('users').where({ id: userId }).update({ password: hashed });
  await logAudit(adminId, 'PASSWORD_RESET', { targetUser: user.user_name }, 'users', userId);

  return { success: true, message: 'Password reset successfully' };
}

// ---------------------------------------------------------------------------
// Admin — audit log
// ---------------------------------------------------------------------------
export async function getAuditLogs(page: number, limit: number, action?: string) {
  const offset = (page - 1) * limit;

  const query = db('audit_logs as al')
    .leftJoin('users as u', 'al.user_id', 'u.id')
    .select(
      'al.id', 'al.action', 'al.resource', 'al.resource_id',
      'al.metadata', 'al.created_at',
      'u.id as actor_id', 'u.display_name as actor_name',
      'u.user_name as actor_username', 'u.avatar as actor_avatar',
    )
    .orderBy('al.created_at', 'desc');

  const countQuery = db('audit_logs');

  if (action) {
    query.where('al.action', action);
    countQuery.where({ action });
  }

  const [logs, [{ total }]] = await Promise.all([
    query.limit(limit).offset(offset),
    countQuery.count({ total: '*' }),
  ]);

  return {
    data: (logs as any[]).map((l) => ({
      id:            l.id,
      action:        l.action,
      resource:      l.resource,
      resourceId:    l.resource_id,
      metadata:      l.metadata ? (() => { try { return JSON.parse(l.metadata); } catch { return l.metadata; } })() : null,
      createdAt:     String(l.created_at),
      actor: l.actor_id ? {
        id:          l.actor_id,
        displayName: l.actor_name,
        userName:    l.actor_username,
        avatar:      l.actor_avatar,
      } : null,
    })),
    total:      Number(total),
    page,
    limit,
    totalPages: Math.ceil(Number(total) / limit),
  };
}

// ---------------------------------------------------------------------------
// Admin — broadcast notification
// ---------------------------------------------------------------------------
export async function broadcastNotification(adminId: string, data: BroadcastNotificationDtoType) {
  let userIds: string[] = [];

  if (data.recipient === 'all') {
    const rows = await db('users').where({ is_active: true }).select('id');
    userIds = rows.map((r: { id: string }) => r.id);
  } else if (data.recipient === 'role' && data.role) {
    const rows = await db('users').where({ role: data.role, is_active: true }).select('id');
    userIds = rows.map((r: { id: string }) => r.id);
  } else if (data.recipient === 'user' && data.userId) {
    userIds = [data.userId];
  }

  if (userIds.length === 0) throw new AppError(400, 'No recipients found');

  const notifications = userIds.map((uid) => ({
    user_id: uid,
    type:    data.type,
    message: data.message,
    is_read: false,
  }));

  await db('notifications').insert(notifications);
  await logAudit(adminId, 'NOTIFICATION_SENT', {
    recipient: data.recipient, count: userIds.length, type: data.type,
  }, 'notifications');

  return { success: true, sent: userIds.length };
}

// ---------------------------------------------------------------------------
// Block / Unblock / Trust / Untrust  (unchanged except logAudit additions)
// ---------------------------------------------------------------------------
export async function blockUser(userId: string, adminId?: string) {
  const user = await db('users').where({ id: userId }).first() as UserRow | undefined;
  if (!user) throw new AppError(404, 'User not found');

  const [updated] = await db('users').where({ id: userId }).update({ is_blocked: true })
    .returning(['id', 'email', 'user_name', 'display_name', 'is_blocked']);

  if (adminId) await logAudit(adminId, 'USER_BLOCKED', { targetUser: user.user_name }, 'users', userId);

  return { id: updated.id, email: updated.email, userName: updated.user_name, displayName: updated.display_name, isBlocked: updated.is_blocked };
}

export async function unblockUser(userId: string, adminId?: string) {
  const user = await db('users').where({ id: userId }).first() as UserRow | undefined;
  if (!user) throw new AppError(404, 'User not found');

  const [updated] = await db('users').where({ id: userId }).update({ is_blocked: false })
    .returning(['id', 'email', 'user_name', 'display_name', 'is_blocked']);

  if (adminId) await logAudit(adminId, 'USER_UNBLOCKED', { targetUser: user.user_name }, 'users', userId);

  return { id: updated.id, email: updated.email, userName: updated.user_name, displayName: updated.display_name, isBlocked: updated.is_blocked };
}

export async function trustUser(userId: string) {
  const user = await db('users').where({ id: userId }).first();
  if (!user) throw new AppError(404, 'User not found');

  const [updated] = await db('users').where({ id: userId }).update({ is_trusted: true })
    .returning(['id', 'email', 'user_name', 'display_name', 'is_trusted']);

  return { id: updated.id, email: updated.email, userName: updated.user_name, displayName: updated.display_name, isTrusted: updated.is_trusted };
}

export async function untrustUser(userId: string) {
  const user = await db('users').where({ id: userId }).first();
  if (!user) throw new AppError(404, 'User not found');

  const [updated] = await db('users').where({ id: userId }).update({ is_trusted: false })
    .returning(['id', 'email', 'user_name', 'display_name', 'is_trusted']);

  return { id: updated.id, email: updated.email, userName: updated.user_name, displayName: updated.display_name, isTrusted: updated.is_trusted };
}

// ---------------------------------------------------------------------------
// Dashboard stats
// ---------------------------------------------------------------------------
export async function getDashboardStats(userId: string, role: string) {
  if (role === 'ADMIN') {
    const [
      [{ total: totalUsers }], [{ total: totalCommunities }], [{ total: totalPosts }],
      [{ total: pendingPosts }], [{ total: totalBusinesses }], [{ total: totalEvents }],
      [{ total: totalJobs }], recentUsers, recentPosts, recentBusinesses, recentEvents, recentJobs,
    ] = await Promise.all([
      db('users').count({ total: '*' }),
      db('communities').count({ total: '*' }),
      db('posts').count({ total: '*' }),
      db('posts').where({ status: 'PENDING' }).count({ total: '*' }),
      db('businesses').count({ total: '*' }),
      db('events').count({ total: '*' }),
      db('jobs').count({ total: '*' }),
      db('users').select('id', 'display_name', 'user_name', 'created_at').orderBy('created_at', 'desc').limit(5),
      db('posts as p').join('users as u', 'p.user_id', 'u.id').join('communities as c', 'p.community_id', 'c.id')
        .select('p.id', 'p.type', 'p.status', 'p.created_at', 'u.display_name', 'u.user_name', 'c.name as community_name')
        .orderBy('p.created_at', 'desc').limit(5),
      db('businesses as b').join('users as u', 'b.user_id', 'u.id')
        .select('b.id', 'b.name', 'b.created_at', 'u.display_name', 'u.user_name').orderBy('b.created_at', 'desc').limit(5),
      db('events as e').join('users as u', 'e.user_id', 'u.id')
        .select('e.id', 'e.title', 'e.created_at', 'u.display_name', 'u.user_name').orderBy('e.created_at', 'desc').limit(5),
      db('jobs as j').join('users as u', 'j.user_id', 'u.id')
        .select('j.id', 'j.title', 'j.created_at', 'u.display_name', 'u.user_name').orderBy('j.created_at', 'desc').limit(5),
    ]);

    type ActivityItem = { type: string; message: string; createdAt: Date };
    const activity: ActivityItem[] = [
      ...(recentUsers as any[]).map((u) => ({ type: 'user', message: `New user registered: ${u.display_name || u.user_name}`, createdAt: u.created_at })),
      ...(recentPosts as any[]).map((p) => ({ type: p.status === 'PENDING' ? 'pending_post' : p.type === 'EMERGENCY' ? 'emergency_post' : 'post', message: `${p.type} post in "${p.community_name}" by ${p.display_name ?? p.user_name}`, createdAt: p.created_at })),
      ...(recentBusinesses as any[]).map((b) => ({ type: 'business', message: `New business: "${b.name}" by ${b.display_name ?? b.user_name}`, createdAt: b.created_at })),
      ...(recentEvents as any[]).map((e) => ({ type: 'event', message: `New event: "${e.title}" by ${e.display_name ?? e.user_name}`, createdAt: e.created_at })),
      ...(recentJobs as any[]).map((j) => ({ type: 'job', message: `New job: "${j.title}" by ${j.display_name ?? j.user_name}`, createdAt: j.created_at })),
    ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 10);

    return {
      totalUsers: Number(totalUsers), totalCommunities: Number(totalCommunities),
      totalPosts: Number(totalPosts), pendingPosts: Number(pendingPosts),
      totalBusinesses: Number(totalBusinesses), totalEvents: Number(totalEvents),
      totalJobs: Number(totalJobs), recentActivity: activity,
    };
  }

  const [[{ total: joinedCommunities }], [{ total: userPosts }], [{ total: userBusinesses }], [{ total: userEvents }], [{ total: userJobs }]] = await Promise.all([
    db('community_members').where({ user_id: userId }).count({ total: '*' }),
    db('posts').where({ user_id: userId }).count({ total: '*' }),
    db('businesses').where({ user_id: userId }).count({ total: '*' }),
    db('events').where({ user_id: userId }).count({ total: '*' }),
    db('jobs').where({ user_id: userId }).count({ total: '*' }),
  ]);

  return {
    joinedCommunities: Number(joinedCommunities), userPosts: Number(userPosts),
    userBusinesses: Number(userBusinesses), userEvents: Number(userEvents), userJobs: Number(userJobs),
  };
}
