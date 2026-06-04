import db from '../../config/db';
import { AppError } from '../../middleware/errorHandler';
import type { UpdateUserDtoType } from './users.dto';

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

function stripSensitive(user: UserRow) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { password, refresh_token, ...safe } = user;
  return safe;
}

function calculateProfileCompletion(user: UserRow): number {
  const fields = [
    user.user_name,
    user.display_name,
    user.email,
    user.phone_no,
    user.avatar,
    user.bio,
    user.location,
    user.pincode,
    user.interests && user.interests.length > 0 ? 'filled' : null,
    user.professional_category,
  ];
  const filled = fields.filter((f) => f !== null && f !== undefined && f !== '').length;
  return Math.round((filled / fields.length) * 100);
}

export async function getProfile(userId: string) {
  const user = await db('users')
    .where({ id: userId })
    .first() as UserRow | undefined;

  if (!user) throw new AppError(404, 'User not found');

  // Include community memberships
  const memberships = await db('community_members as cm')
    .join('communities as c', 'cm.community_id', 'c.id')
    .where('cm.user_id', userId)
    .select(
      'cm.id',
      'cm.community_id',
      'cm.joined_at',
      'c.id as c_id',
      'c.name as c_name',
      'c.description as c_description',
      'c.image as c_image',
    );

  const communities = memberships.map((m: Record<string, unknown>) => ({
    id: m['id'],
    communityId: m['community_id'],
    joinedAt: m['joined_at'],
    community: {
      id: m['c_id'],
      name: m['c_name'],
      description: m['c_description'],
      image: m['c_image'],
    },
  }));

  return { ...stripSensitive(user), communities };
}

export async function updateProfile(userId: string, data: UpdateUserDtoType) {
  // Map camelCase DTO keys to snake_case DB columns
  const updateData: Record<string, unknown> = {};
  if (data.userName !== undefined) updateData['user_name'] = data.userName;
  if (data.displayName !== undefined) updateData['display_name'] = data.displayName;
  if (data.phoneNo !== undefined) updateData['phone_no'] = data.phoneNo;
  if (data.email !== undefined) updateData['email'] = data.email;
  if (data.countryId !== undefined) updateData['country_id'] = data.countryId;
  if (data.bio !== undefined) updateData['bio'] = data.bio;
  if (data.location !== undefined) updateData['location'] = data.location;
  if (data.pincode !== undefined) updateData['pincode'] = data.pincode;
  if (data.interests !== undefined) updateData['interests'] = data.interests;
  if (data.professionalCategory !== undefined) updateData['professional_category'] = data.professionalCategory;
  if (data.avatar !== undefined) updateData['avatar'] = data.avatar;

  if (Object.keys(updateData).length === 0) {
    throw new AppError(400, 'No update fields provided');
  }

  await db('users').where({ id: userId }).update(updateData);

  const updatedUser = await db('users').where({ id: userId }).first() as UserRow;
  const profileCompletion = calculateProfileCompletion(updatedUser);
  await db('users').where({ id: userId }).update({ profile_completion: profileCompletion });

  const finalUser = await db('users').where({ id: userId }).first() as UserRow;
  return stripSensitive(finalUser);
}

export async function getUsers(page: number, limit: number, search?: string) {
  const offset = (page - 1) * limit;

  const query = db('users').select(
    'id', 'email', 'user_name', 'display_name', 'phone_no', 'avatar',
    'role', 'role_level', 'country_id', 'country', 'location', 'pincode',
    'interests', 'professional_category', 'bio', 'is_trusted', 'is_blocked',
    'is_active', 'profile_completion', 'created_at', 'updated_at',
  );

  if (search) {
    query.where(function () {
      this.whereILike('user_name', `%${search}%`)
        .orWhereILike('display_name', `%${search}%`)
        .orWhereILike('email', `%${search}%`);
    });
  }

  const countQuery = db('users').count({ total: '*' });
  if (search) {
    countQuery.where(function () {
      this.whereILike('user_name', `%${search}%`)
        .orWhereILike('display_name', `%${search}%`)
        .orWhereILike('email', `%${search}%`);
    });
  }

  const [users, [{ total }]] = await Promise.all([
    query.orderBy('created_at', 'desc').limit(limit).offset(offset),
    countQuery,
  ]);

  return {
    data: users,
    total: Number(total),
    page,
    limit,
    totalPages: Math.ceil(Number(total) / limit),
  };
}

export async function blockUser(userId: string) {
  const user = await db('users').where({ id: userId }).first();
  if (!user) throw new AppError(404, 'User not found');

  const [updated] = await db('users')
    .where({ id: userId })
    .update({ is_blocked: true })
    .returning(['id', 'email', 'user_name', 'display_name', 'is_blocked']);

  return updated;
}

export async function unblockUser(userId: string) {
  const user = await db('users').where({ id: userId }).first();
  if (!user) throw new AppError(404, 'User not found');

  const [updated] = await db('users')
    .where({ id: userId })
    .update({ is_blocked: false })
    .returning(['id', 'email', 'user_name', 'display_name', 'is_blocked']);

  return updated;
}

export async function trustUser(userId: string) {
  const user = await db('users').where({ id: userId }).first();
  if (!user) throw new AppError(404, 'User not found');

  const [updated] = await db('users')
    .where({ id: userId })
    .update({ is_trusted: true })
    .returning(['id', 'email', 'user_name', 'display_name', 'is_trusted']);

  return updated;
}

export async function untrustUser(userId: string) {
  const user = await db('users').where({ id: userId }).first();
  if (!user) throw new AppError(404, 'User not found');

  const [updated] = await db('users')
    .where({ id: userId })
    .update({ is_trusted: false })
    .returning(['id', 'email', 'user_name', 'display_name', 'is_trusted']);

  return updated;
}

export async function getDashboardStats(userId: string, role: string) {
  if (role === 'ADMIN') {
    const [
      [{ total: totalUsers }],
      [{ total: totalCommunities }],
      [{ total: totalPosts }],
      [{ total: pendingPosts }],
      [{ total: totalBusinesses }],
      [{ total: totalEvents }],
      [{ total: totalJobs }],
      recentUsers,
      recentPosts,
      recentBusinesses,
      recentEvents,
      recentJobs,
    ] = await Promise.all([
      db('users').count({ total: '*' }),
      db('communities').count({ total: '*' }),
      db('posts').count({ total: '*' }),
      db('posts').where({ status: 'PENDING' }).count({ total: '*' }),
      db('businesses').count({ total: '*' }),
      db('events').count({ total: '*' }),
      db('jobs').count({ total: '*' }),
      db('users').select('id', 'display_name', 'user_name', 'created_at').orderBy('created_at', 'desc').limit(5),
      db('posts as p')
        .join('users as u', 'p.user_id', 'u.id')
        .join('communities as c', 'p.community_id', 'c.id')
        .select('p.id', 'p.type', 'p.status', 'p.created_at', 'u.display_name', 'u.user_name', 'c.name as community_name')
        .orderBy('p.created_at', 'desc')
        .limit(5),
      db('businesses as b')
        .join('users as u', 'b.user_id', 'u.id')
        .select('b.id', 'b.name', 'b.created_at', 'u.display_name', 'u.user_name')
        .orderBy('b.created_at', 'desc')
        .limit(5),
      db('events as e')
        .join('users as u', 'e.user_id', 'u.id')
        .select('e.id', 'e.title', 'e.created_at', 'u.display_name', 'u.user_name')
        .orderBy('e.created_at', 'desc')
        .limit(5),
      db('jobs as j')
        .join('users as u', 'j.user_id', 'u.id')
        .select('j.id', 'j.title', 'j.created_at', 'u.display_name', 'u.user_name')
        .orderBy('j.created_at', 'desc')
        .limit(5),
    ]);

    type ActivityItem = { type: string; message: string; createdAt: Date };

    const activity: ActivityItem[] = [
      ...(recentUsers as Array<Record<string, unknown>>).map((u) => ({
        type: 'user',
        message: `New user registered: ${String(u['display_name'] || u['user_name'])}`,
        createdAt: u['created_at'] as Date,
      })),
      ...(recentPosts as Array<Record<string, unknown>>).map((p) => ({
        type: p['status'] === 'PENDING' ? 'pending_post' : p['type'] === 'EMERGENCY' ? 'emergency_post' : 'post',
        message: `${String(p['type'])} post ${String(p['status']).toLowerCase()} in "${String(p['community_name'] ?? 'a community')}" by ${String(p['display_name'] ?? p['user_name'] ?? 'unknown')}`,
        createdAt: p['created_at'] as Date,
      })),
      ...(recentBusinesses as Array<Record<string, unknown>>).map((b) => ({
        type: 'business',
        message: `New business listed: "${String(b['name'])}" by ${String(b['display_name'] ?? b['user_name'] ?? 'unknown')}`,
        createdAt: b['created_at'] as Date,
      })),
      ...(recentEvents as Array<Record<string, unknown>>).map((e) => ({
        type: 'event',
        message: `New event created: "${String(e['title'])}" by ${String(e['display_name'] ?? e['user_name'] ?? 'unknown')}`,
        createdAt: e['created_at'] as Date,
      })),
      ...(recentJobs as Array<Record<string, unknown>>).map((j) => ({
        type: 'job',
        message: `New job posted: "${String(j['title'])}" by ${String(j['display_name'] ?? j['user_name'] ?? 'unknown')}`,
        createdAt: j['created_at'] as Date,
      })),
    ]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 10);

    return {
      totalUsers: Number(totalUsers),
      totalCommunities: Number(totalCommunities),
      totalPosts: Number(totalPosts),
      pendingPosts: Number(pendingPosts),
      totalBusinesses: Number(totalBusinesses),
      totalEvents: Number(totalEvents),
      totalJobs: Number(totalJobs),
      recentActivity: activity,
    };
  }

  const [
    [{ total: joinedCommunities }],
    [{ total: userPosts }],
    [{ total: userBusinesses }],
    [{ total: userEvents }],
    [{ total: userJobs }],
  ] = await Promise.all([
    db('community_members').where({ user_id: userId }).count({ total: '*' }),
    db('posts').where({ user_id: userId }).count({ total: '*' }),
    db('businesses').where({ user_id: userId }).count({ total: '*' }),
    db('events').where({ user_id: userId }).count({ total: '*' }),
    db('jobs').where({ user_id: userId }).count({ total: '*' }),
  ]);

  return {
    joinedCommunities: Number(joinedCommunities),
    userPosts: Number(userPosts),
    userBusinesses: Number(userBusinesses),
    userEvents: Number(userEvents),
    userJobs: Number(userJobs),
  };
}
