import db from '../../config/db';
import { AppError } from '../../middleware/errorHandler';
import type { CreateCommunityDtoType, UpdateCommunityDtoType } from './communities.dto';

// ---------------------------------------------------------------------------
// Private helper — bulk-enroll existing active users into a newly-created
// default community.  Uses a single INSERT … SELECT so it scales to any
// number of users with zero intermediate result sets.
// ---------------------------------------------------------------------------
async function autoJoinExistingUsers(community: Record<string, unknown>): Promise<void> {
  const communityId = community['id'] as string;
  const isGlobal    = community['is_global']  as boolean;
  const isPrivate   = community['is_private'] as boolean;
  const country     = community['country']    as string | null;

  if (isGlobal) {
    // Enroll all active users regardless of country
    await db.raw(
      `INSERT INTO community_members (user_id, community_id)
       SELECT id, ? FROM users WHERE is_active = true
       ON CONFLICT (user_id, community_id) DO NOTHING`,
      [communityId],
    );
  } else if (isPrivate && country) {
    // Enroll active users whose country matches the community's country
    await db.raw(
      `INSERT INTO community_members (user_id, community_id)
       SELECT id, ? FROM users WHERE is_active = true AND country = ?
       ON CONFLICT (user_id, community_id) DO NOTHING`,
      [communityId, country],
    );
  }
  // is_default + not global + not private, or private with null country → no backfill
}

export async function create(data: CreateCommunityDtoType, adminId: string) {
  const existing = await db('communities').where({ name: data.name }).first();
  if (existing) throw new AppError(409, 'Community with this name already exists');

  const [community] = await db('communities')
    .insert({ ...data, created_by_id: adminId })
    .returning('*');

  // Auto-enroll existing active users when the new community is a default one
  if ((community as Record<string, unknown>)['is_default']) {
    await autoJoinExistingUsers(community as Record<string, unknown>);
  }

  const creator = await db('users')
    .where({ id: adminId })
    .select('id', 'user_name', 'display_name', 'email')
    .first();

  const counts = await db('communities as c')
    .leftJoin('community_members as cm', 'c.id', 'cm.community_id')
    .leftJoin('posts as p', 'c.id', 'p.community_id')
    .where('c.id', (community as Record<string, unknown>)['id'] as string)
    .select(
      db.raw('COUNT(DISTINCT cm.id) as member_count'),
      db.raw('COUNT(DISTINCT p.id) as post_count'),
    )
    .first();

  return {
    ...(community as Record<string, unknown>),
    createdBy: creator,
    _count: {
      members: Number((counts as Record<string, unknown>)?.['member_count'] ?? 0),
      posts: Number((counts as Record<string, unknown>)?.['post_count'] ?? 0),
    },
  };
}

export async function findAll(params: {
  page: number;
  limit: number;
  search?: string;
  pincode?: string;
  skipActiveFilter?: boolean;
  // ── New filter params ──────────────────────────────────────
  country?: string;
  category?: string;
  visibility?: 'global' | 'private' | 'default';
  from_date?: string;
  to_date?: string;
  joined?: boolean;
  userId?: string;
}) {
  const { page, limit, search, pincode, skipActiveFilter, country, category, visibility, from_date, to_date, joined, userId } = params;
  const offset = (page - 1) * limit;

  const query = db('communities as c')
    // LEFT JOIN so communities whose creator was deleted are still returned.
    .leftJoin('users as u', 'c.created_by_id', 'u.id')
    // LEFT JOIN to resolve interest_id → category name without dropping unset communities.
    .leftJoin('interest_master as im', 'c.interest_id', 'im.interest_id')
    .select(
      'c.*',
      'u.id as creator_id',
      'u.user_name as creator_user_name',
      'u.display_name as creator_display_name',
      'im.interest_name as category_name',
    );

  // Admin callers set skipActiveFilter=true to see all communities incl. inactive.
  if (!skipActiveFilter) {
    query.where('c.is_active', true);
  }

  const countQuery = db('communities');
  if (!skipActiveFilter) {
    countQuery.where({ is_active: true });
  }

  if (search) {
    query.where(function () {
      this.whereILike('c.name', `%${search}%`).orWhereILike('c.description', `%${search}%`);
    });
    countQuery.where(function () {
      this.whereILike('name', `%${search}%`).orWhereILike('description', `%${search}%`);
    });
  }

  if (pincode) {
    query.andWhere('c.pincode', pincode);
    countQuery.andWhere({ pincode });
  }

  // ── Country exact-match filter ─────────────────────────────
  if (country) {
    query.where('c.country', country);
    countQuery.where('country', country);
  }

  // ── Category filter via interest_master JOIN ───────────────
  if (category) {
    query.where('im.interest_name', category);
    // countQuery has no interest_master JOIN, so use a subquery.
    countQuery.whereIn(
      'interest_id',
      db('interest_master').select('interest_id').where('interest_name', category),
    );
  }

  // ── Visibility filter ──────────────────────────────────────
  if (visibility === 'global') {
    query.where('c.is_global', true);
    countQuery.where('is_global', true);
  } else if (visibility === 'private') {
    query.where('c.is_private', true);
    countQuery.where('is_private', true);
  } else if (visibility === 'default') {
    query.where('c.is_default', true);
    countQuery.where('is_default', true);
  }

  // ── Date-range filter on created_at ───────────────────────
  if (from_date) {
    query.where('c.created_at', '>=', from_date);
    countQuery.where('created_at', '>=', from_date);
  }
  if (to_date) {
    // Increment by one day so the entire to_date day is included.
    const next = new Date(to_date);
    next.setDate(next.getDate() + 1);
    const nextStr = next.toISOString().substring(0, 10);
    query.where('c.created_at', '<', nextStr);
    countQuery.where('created_at', '<', nextStr);
  }

  // ── Joined filter — restrict to communities the caller is a member of ─────
  if (joined && userId) {
    query.whereIn('c.id', db('community_members').select('community_id').where('user_id', userId));
    countQuery.whereIn('id', db('community_members').select('community_id').where('user_id', userId));
  }

  const [communities, [{ total }]] = await Promise.all([
    query.orderBy('c.created_at', 'desc').limit(limit).offset(offset),
    countQuery.count({ total: '*' }),
  ]);

  // Attach member/post counts
  const ids = (communities as Array<Record<string, unknown>>).map((c) => c['id']);
  const counts = ids.length
    ? await db('communities as c')
        .leftJoin('community_members as cm', 'c.id', 'cm.community_id')
        .leftJoin('posts as p', 'c.id', 'p.community_id')
        .whereIn('c.id', ids as string[])
        .groupBy('c.id')
        .select('c.id', db.raw('COUNT(DISTINCT cm.id) as member_count'), db.raw('COUNT(DISTINCT p.id) as post_count'))
    : [];

  const countMap = new Map(
    (counts as Array<Record<string, unknown>>).map((r) => [
      r['id'],
      { members: Number(r['member_count']), posts: Number(r['post_count']) },
    ]),
  );

  const data = (communities as Array<Record<string, unknown>>).map((c) => ({
    ...c,
    createdBy: {
      id: c['creator_id'],
      userName: c['creator_user_name'],
      displayName: c['creator_display_name'],
    },
    _count: countMap.get(c['id']) ?? { members: 0, posts: 0 },
    is_joined: false, // will be overwritten below if userId provided
  }));

  // Bulk-check which communities the caller has joined
  if (userId && ids.length) {
    const memberships = await db('community_members')
      .whereIn('community_id', ids as string[])
      .where('user_id', userId)
      .select('community_id');
    const joinedSet = new Set(memberships.map((m: Record<string, unknown>) => m['community_id'] as string));
    data.forEach((c) => { (c as Record<string, unknown>)['is_joined'] = joinedSet.has((c as Record<string, unknown>)['id'] as string); });
  }

  return { data, total: Number(total), page, limit, totalPages: Math.ceil(Number(total) / limit) };
}

export async function findOne(id: string) {
  const community = await db('communities as c')
    .leftJoin('users as u', 'c.created_by_id', 'u.id')
    .leftJoin('interest_master as im', 'c.interest_id', 'im.interest_id')
    .where('c.id', id)
    .select(
      'c.*',
      'u.id as creator_id',
      'u.user_name as creator_user_name',
      'u.display_name as creator_display_name',
      'u.email as creator_email',
      'im.interest_name as category_name',
    )
    .first();

  if (!community) throw new AppError(404, 'Community not found');

  const counts = await db('community_members').where({ community_id: id }).count({ total: '*' }).first();
  const postCounts = await db('posts').where({ community_id: id }).count({ total: '*' }).first();

  return {
    ...(community as Record<string, unknown>),
    createdBy: {
      id: (community as Record<string, unknown>)['creator_id'],
      userName: (community as Record<string, unknown>)['creator_user_name'],
      displayName: (community as Record<string, unknown>)['creator_display_name'],
      email: (community as Record<string, unknown>)['creator_email'],
    },
    _count: {
      members: Number((counts as Record<string, unknown>)?.['total'] ?? 0),
      posts: Number((postCounts as Record<string, unknown>)?.['total'] ?? 0),
    },
  };
}

export async function update(id: string, data: UpdateCommunityDtoType) {
  const before = await db('communities').where({ id }).first() as Record<string, unknown> | undefined;
  if (!before) throw new AppError(404, 'Community not found');

  await db('communities').where({ id }).update(data);

  // If this edit turns is_default ON for the first time, backfill existing users.
  // Merge before + data so the effective is_global / is_private / country are correct
  // even when those fields are also changed in the same request.
  if (data.is_default && !before['is_default']) {
    const effective: Record<string, unknown> = { ...before, ...data, id };
    await autoJoinExistingUsers(effective);
  }

  return findOne(id);
}

export async function deleteCommunity(id: string) {
  const community = await db('communities').where({ id }).first();
  if (!community) throw new AppError(404, 'Community not found');

  await db('communities').where({ id }).delete();
  return { message: 'Community deleted successfully' };
}

export async function join(communityId: string, userId: string) {
  const community = await db('communities').where({ id: communityId }).first();
  if (!community) throw new AppError(404, 'Community not found');

  const existing = await db('community_members').where({ user_id: userId, community_id: communityId }).first();
  if (existing) throw new AppError(409, 'You are already a member of this community');

  await db('community_members').insert({ user_id: userId, community_id: communityId });
  return { message: 'Successfully joined the community' };
}

export async function leave(communityId: string, userId: string) {
  const membership = await db('community_members')
    .where({ user_id: userId, community_id: communityId })
    .first();

  if (!membership) throw new AppError(404, 'You are not a member of this community');

  await db('community_members').where({ id: (membership as Record<string, unknown>)['id'] }).delete();
  return { message: 'Successfully left the community' };
}

export async function getMembers(communityId: string, page: number, limit: number) {
  const offset = (page - 1) * limit;

  const [members, [{ total }]] = await Promise.all([
    db('community_members as cm')
      .join('users as u', 'cm.user_id', 'u.id')
      .where('cm.community_id', communityId)
      .select(
        'cm.id', 'cm.community_id', 'cm.joined_at',
        'u.id as user_id', 'u.user_name', 'u.display_name', 'u.email', 'u.avatar', 'u.professional_category', 'u.country',
      )
      .orderBy('cm.joined_at', 'desc')
      .limit(limit)
      .offset(offset),
    db('community_members').where({ community_id: communityId }).count({ total: '*' }),
  ]);

  const data = (members as Array<Record<string, unknown>>).map((m) => ({
    id: m['id'],
    communityId: m['community_id'],
    joinedAt: m['joined_at'],
    user: {
      id: m['user_id'],
      userName: m['user_name'],
      displayName: m['display_name'],
      email: m['email'],
      avatar: m['avatar'],
      professionalCategory: m['professional_category'],
      country: m['country'],
    },
  }));

  return { data, total: Number(total), page, limit, totalPages: Math.ceil(Number(total) / limit) };
}

// ---------------------------------------------------------------------------
// Get communities the current user has joined
// ---------------------------------------------------------------------------
export async function getMyCommunities(userId: string) {
  const rows = await db('community_members as cm')
    .join('communities as c', 'cm.community_id', 'c.id')
    .leftJoin('interest_master as im', 'c.interest_id', 'im.interest_id')
    .where('cm.user_id', userId)
    .where('c.is_active', true)
    .select(
      'c.*',
      'im.interest_name as category_name',
      db.raw('(SELECT COUNT(*) FROM community_members WHERE community_id = c.id) AS member_count'),
      db.raw('(SELECT COUNT(*) FROM posts WHERE community_id = c.id AND status = \'APPROVED\') AS post_count'),
    )
    .orderBy('cm.joined_at', 'desc');

  return rows.map((r: Record<string, unknown>) => ({
    ...r,
    _count: { members: Number(r['member_count']), posts: Number(r['post_count']) },
  }));
}