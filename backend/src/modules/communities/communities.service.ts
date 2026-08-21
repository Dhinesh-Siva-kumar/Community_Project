import db from '../../config/db';
import { AppError } from '../../middleware/errorHandler';
import { deleteUploadedFile } from '../../services/upload-storage.service';
import { logAudit } from '../../services/audit.service';
import { getUserCountry, applyNonAdminVisibilityRestriction } from '../../services/community-visibility.service';
import * as notificationsService from '../notifications/notifications.service';
import type { CreateCommunityDtoType, UpdateCommunityDtoType } from './communities.dto';

async function notifyAdminsOfPendingCommunity(communityId: string, name: string): Promise<void> {
  const admins = await db('users').where({ role: 'ADMIN' }).select('id');
  if (!admins.length) return;
  const message = `New community "${name}" pending approval.`;
  await Promise.all(
    (admins as Array<Record<string, unknown>>).map((admin) =>
      notificationsService.create(admin['id'] as string, 'COMMUNITY_PENDING', message, communityId),
    ),
  );
}

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

  const caller = await db('users').where({ id: adminId }).first() as Record<string, unknown> | undefined;

  if (data.is_global || data.is_default) {
    if (!caller || caller['role'] !== 'ADMIN') {
      throw new AppError(403, 'Only admins can create Global or Default communities');
    }
  }

  const isAutoApproved = !!caller && caller['role'] === 'ADMIN';
  const status = isAutoApproved ? 'APPROVED' : 'PENDING';

  const [community] = await db('communities')
    .insert({ ...data, created_by_id: adminId, status })
    .returning('*');

  // The creator is always a member of their own community, so they show up
  // in the Members tab (with the "Author" badge — see isCommunityCreator on
  // the frontend) and count toward _count.members from the very start.
  await db('community_members')
    .insert({ user_id: adminId, community_id: (community as Record<string, unknown>)['id'] as string })
    .onConflict(['user_id', 'community_id'])
    .ignore();

  // Auto-enroll existing active users when the new community is a default one
  if ((community as Record<string, unknown>)['is_default']) {
    await autoJoinExistingUsers(community as Record<string, unknown>);
  }

  if (status === 'PENDING') {
    await notifyAdminsOfPendingCommunity((community as Record<string, unknown>)['id'] as string, data.name);
  }

  await logAudit(adminId, 'COMMUNITY_CREATED', { name: data.name, status }, 'communities', (community as Record<string, unknown>)['id'] as string);

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
    createdById: (community as Record<string, unknown>)['created_by_id'],
    rejectionReason: (community as Record<string, unknown>)['rejection_reason'] ?? null,
    createdAt: (community as Record<string, unknown>)['created_at'],
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
  community_mode?: 'HELP_EMERGENCY' | 'ENQUIRE';
  is_default?: boolean;
  from_date?: string;
  to_date?: string;
  joined?: boolean;
  userId?: string;
  createdById?: string;
  status?: 'active' | 'inactive';
  approvalStatus?: 'PENDING' | 'APPROVED' | 'REJECTED';
  excludeRejected?: boolean;
  sortBy?: 'name' | 'joined' | 'category' | 'country' | 'visibility' | 'members' | 'posts' | 'status';
  sortDir?: 'asc' | 'desc';
}) {
  const {
    page, limit, search, pincode, skipActiveFilter, country, category, visibility,
    community_mode, is_default, from_date, to_date, joined, userId, createdById,
    status, approvalStatus, excludeRejected, sortBy = 'joined', sortDir = 'desc',
  } = params;
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

  // Admin callers set skipActiveFilter=true to see all communities incl. inactive,
  // unless they've explicitly picked a status to filter by below.
  if (!skipActiveFilter) {
    query.where('c.is_active', true);
  }

  const countQuery = db('communities');
  if (!skipActiveFilter) {
    countQuery.where({ is_active: true });
  }

  if (status) {
    const isActive = status === 'active';
    query.where('c.is_active', isActive);
    countQuery.where('is_active', isActive);
  }

  // ── Moderation status — non-admin/non-owner callers only ever see
  // APPROVED communities; skipActiveFilter=true (admin browse, or the
  // caller's own "created" list) bypasses this the same way it already
  // bypasses the is_active filter above.
  if (!skipActiveFilter) {
    query.where('c.status', 'APPROVED');
    countQuery.where('status', 'APPROVED');
  }
  if (approvalStatus) {
    query.andWhere('c.status', approvalStatus);
    countQuery.andWhere('status', approvalStatus);
  } else if (excludeRejected) {
    query.andWhereNot('c.status', 'REJECTED');
    countQuery.andWhereNot('status', 'REJECTED');
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

  // ── Community mode filter ──────────────────────────────────
  if (community_mode) {
    query.where('c.community_mode', community_mode);
    countQuery.where('community_mode', community_mode);
  }

  // ── Default-community toggle filter (independent of visibility) ────
  if (is_default !== undefined) {
    query.where('c.is_default', is_default);
    countQuery.where('is_default', is_default);
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

  // ── Created-by filter — restrict to communities the caller owns (used by
  // the "My Communities" profile tab, via GET /communities/created) ────────
  if (createdById) {
    query.andWhere('c.created_by_id', createdById);
    countQuery.andWhere('created_by_id', createdById);
  }

  // ── Non-admin browse restriction ────────────────────────────
  // Regular users should only ever browse communities relevant to them —
  // global ones, or private ones scoped to their own country — never
  // someone else's country-private community (e.g. a UK-private community
  // shown to a user in India). A community they already joined stays
  // visible regardless (e.g. after relocating), so it can't silently vanish
  // from their own Joined tab. Admins (skipActiveFilter=true) bypass this
  // and see everything, same as the is_active bypass above.
  if (!skipActiveFilter && userId) {
    const userCountry = await getUserCountry(userId);
    applyNonAdminVisibilityRestriction(query, 'c.', userId, userCountry);
    applyNonAdminVisibilityRestriction(countQuery, '', userId, userCountry);
  }

  // ── Sort — most fields map to a plain column; members/posts/visibility
  // need a raw expression since they're either aggregated or derived from
  // multiple boolean columns. sortDir is Zod-validated to 'asc'|'desc'
  // before reaching this function, so it's safe to interpolate directly.
  switch (sortBy) {
    case 'name':       query.orderBy('c.name', sortDir); break;
    case 'category':   query.orderBy('im.interest_name', sortDir); break;
    case 'country':    query.orderBy('c.country', sortDir); break;
    case 'status':     query.orderBy('c.is_active', sortDir); break;
    case 'visibility':
      query.orderByRaw(`CASE WHEN c.is_global THEN 2 WHEN c.is_private THEN 1 ELSE 0 END ${sortDir}`);
      break;
    case 'members':
      query.orderByRaw(`(SELECT COUNT(*) FROM community_members cm WHERE cm.community_id = c.id) ${sortDir}`);
      break;
    case 'posts':
      query.orderByRaw(`(SELECT COUNT(*) FROM posts p WHERE p.community_id = c.id) ${sortDir}`);
      break;
    default:           query.orderBy('c.created_at', sortDir);
  }

  const [communities, [{ total }]] = await Promise.all([
    query.limit(limit).offset(offset),
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
    createdById: c['created_by_id'],
    rejectionReason: c['rejection_reason'] ?? null,
    createdAt: c['created_at'],
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

// ---------------------------------------------------------------------------
// Suggested communities — combines country match + interest match + live
// popularity into one ranked list, replacing the old client-side "top 4 by
// member count" spotlight. Country and interest matches are worth more than
// raw popularity so a smaller, highly-relevant community still outranks a
// big community that shares neither signal with this user; popularity is
// log-scaled so one very large community can't dominate every slot.
// Already-joined communities are excluded — nothing to "suggest" there.
// ---------------------------------------------------------------------------
export async function getSuggested(userId: string, limit: number) {
  const user = await db('users').where({ id: userId }).select('country', 'interests').first() as
    { country: string | null; interests: string[] | null } | undefined;
  const userCountry = user?.country ?? null;
  const userInterests = new Set(
    (user?.interests ?? []).map((i) => i.toLowerCase().trim()).filter(Boolean),
  );

  const query = db('communities as c')
    .leftJoin('users as u', 'c.created_by_id', 'u.id')
    .leftJoin('interest_master as im', 'c.interest_id', 'im.interest_id')
    .where('c.is_active', true)
    .where('c.status', 'APPROVED')
    .whereNotIn('c.id', db('community_members').select('community_id').where('user_id', userId))
    .select(
      'c.*',
      'u.id as creator_id',
      'u.user_name as creator_user_name',
      'u.display_name as creator_display_name',
      'im.interest_name as category_name',
    )
    // Scoring happens in JS below, so this bounds the candidate set on
    // platforms with an unusually large number of communities; in practice
    // this comfortably covers the whole approved/visible set.
    .limit(300);

  applyNonAdminVisibilityRestriction(query, 'c.', userId, userCountry);

  const candidates = await query as Array<Record<string, unknown>>;
  const ids = candidates.map((c) => c['id'] as string);

  const counts = ids.length
    ? await db('communities as c')
        .leftJoin('community_members as cm', 'c.id', 'cm.community_id')
        .leftJoin('posts as p', 'c.id', 'p.community_id')
        .whereIn('c.id', ids)
        .groupBy('c.id')
        .select('c.id', db.raw('COUNT(DISTINCT cm.id) as member_count'), db.raw('COUNT(DISTINCT p.id) as post_count'))
    : [];
  const countMap = new Map(
    (counts as Array<Record<string, unknown>>).map((r) => [
      r['id'],
      { members: Number(r['member_count']), posts: Number(r['post_count']) },
    ]),
  );

  const scored = candidates.map((c) => {
    const memberCount = countMap.get(c['id'] as string)?.members ?? 0;
    const matchesCountry  = !!userCountry && c['country'] === userCountry;
    const matchesInterest = !!c['category_name'] && userInterests.has(String(c['category_name']).toLowerCase());
    const popularityScore = Math.min(25, Math.log2(memberCount + 1) * 5);
    const score = (matchesCountry ? 40 : 0) + (matchesInterest ? 35 : 0) + popularityScore;
    return { c, memberCount, matchesCountry, matchesInterest, score };
  });

  scored.sort((a, b) => (b.score - a.score) || (b.memberCount - a.memberCount));

  return scored.slice(0, limit).map(({ c, matchesCountry, matchesInterest }) => ({
    ...c,
    createdById: c['created_by_id'],
    rejectionReason: c['rejection_reason'] ?? null,
    createdAt: c['created_at'],
    createdBy: {
      id: c['creator_id'],
      userName: c['creator_user_name'],
      displayName: c['creator_display_name'],
    },
    _count: countMap.get(c['id'] as string) ?? { members: 0, posts: 0 },
    is_joined: false,
    matchesCountry,
    matchesInterest,
  }));
}

export async function getAnalytics(params: {
  page?: number;
  limit?: number;
  skipActiveFilter?: boolean;
  userId?: string;
}) {
  const { skipActiveFilter, userId } = params;

  const baseQuery = db('communities as c')
    .leftJoin('interest_master as im', 'c.interest_id', 'im.interest_id');

  if (!skipActiveFilter) {
    baseQuery.where('c.is_active', true);
  }

  // Same restriction as findAll()'s browse list, so a user's header counts
  // (total communities, total members) reflect what they can actually see —
  // not a platform-wide figure that includes communities from other
  // countries they'd never be shown.
  if (!skipActiveFilter && userId) {
    const userCountry = await getUserCountry(userId);
    applyNonAdminVisibilityRestriction(baseQuery, 'c.', userId, userCountry);
  }

  const grouped = await baseQuery
    .groupBy('c.id')
    .select(
      'c.id',
      db.raw('MAX(CASE WHEN c.is_global THEN 1 ELSE 0 END) as is_global_flag'),
      db.raw('MAX(CASE WHEN c.is_private THEN 1 ELSE 0 END) as is_private_flag'),
      db.raw('MAX(CASE WHEN c.is_default THEN 1 ELSE 0 END) as is_default_flag'),
      db.raw('(SELECT COUNT(*) FROM community_members WHERE community_id = c.id) as member_count'),
    );

  const total = grouped.length;
  const global = grouped.reduce((sum, row) => sum + (Number((row as Record<string, unknown>)['is_global_flag'] ?? 0) > 0 ? 1 : 0), 0);
  const privateCount = grouped.reduce((sum, row) => sum + (Number((row as Record<string, unknown>)['is_private_flag'] ?? 0) > 0 ? 1 : 0), 0);
  const defaultCount = grouped.reduce((sum, row) => sum + (Number((row as Record<string, unknown>)['is_default_flag'] ?? 0) > 0 ? 1 : 0), 0);
  const totalMembers = grouped.reduce((sum, row) => sum + Number((row as Record<string, unknown>)['member_count'] ?? 0), 0);

  return {
    total,
    global,
    private: privateCount,
    default: defaultCount,
    totalMembers,
  };
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
    createdById: (community as Record<string, unknown>)['created_by_id'],
    rejectionReason: (community as Record<string, unknown>)['rejection_reason'] ?? null,
    createdAt: (community as Record<string, unknown>)['created_at'],
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

export async function countPending() {
  const [{ count }] = await db('communities').where({ status: 'PENDING' }).count({ count: '*' });
  return { count: Number(count) };
}

export interface FindPendingCommunitiesOptions {
  page:     number;
  limit:    number;
  search?:  string;
  country?: string;
  dateFrom?: string;
  dateTo?:   string;
  sortBy?:  'joined' | 'name' | 'submitter' | 'country';
  sortDir?: 'asc' | 'desc';
}

export async function findPendingOnly(options: FindPendingCommunitiesOptions) {
  const { page, limit, search, country, dateFrom, dateTo, sortBy = 'joined', sortDir = 'desc' } = options;
  const offset = (page - 1) * limit;

  const query = db('communities as c')
    .leftJoin('users as u', 'c.created_by_id', 'u.id')
    .leftJoin('interest_master as im', 'c.interest_id', 'im.interest_id')
    .where('c.status', 'PENDING')
    .select('c.*', 'u.id as creator_id', 'u.user_name as creator_user_name', 'u.display_name as creator_display_name', 'im.interest_name as category_name');

  const countQuery = db('communities').where({ status: 'PENDING' });

  if (search) {
    query.andWhere(function () { this.whereILike('c.name', `%${search}%`).orWhereILike('c.description', `%${search}%`); });
    countQuery.andWhere(function () { this.whereILike('name', `%${search}%`).orWhereILike('description', `%${search}%`); });
  }
  if (country) {
    query.andWhere('c.country', country);
    countQuery.andWhere('country', country);
  }
  if (dateFrom) {
    query.andWhere('c.created_at', '>=', dateFrom);
    countQuery.andWhere('created_at', '>=', dateFrom);
  }
  if (dateTo) {
    const toEnd = `${dateTo}T23:59:59.999Z`;
    query.andWhere('c.created_at', '<=', toEnd);
    countQuery.andWhere('created_at', '<=', toEnd);
  }

  const sortColumn = sortBy === 'name' ? 'c.name'
    : sortBy === 'submitter' ? 'u.display_name'
    : sortBy === 'country' ? 'c.country'
    : 'c.created_at';
  const [communities, [{ total }]] = await Promise.all([
    query.orderBy(sortColumn, sortDir).limit(limit).offset(offset),
    countQuery.count({ total: '*' }),
  ]);

  const data = (communities as Array<Record<string, unknown>>).map((c) => ({
    ...c,
    createdById: c['created_by_id'],
    rejectionReason: c['rejection_reason'] ?? null,
    createdAt: c['created_at'],
    createdBy: {
      id: c['creator_id'],
      userName: c['creator_user_name'],
      displayName: c['creator_display_name'],
    },
  }));

  return { data, total: Number(total), page, limit, totalPages: Math.ceil(Number(total) / limit) };
}

export async function approve(id: string, adminId: string) {
  const community = await db('communities').where({ id }).first() as Record<string, unknown> | undefined;
  if (!community) throw new AppError(404, 'Community not found');

  if (community['status'] === 'APPROVED') return findOne(id);

  await db('communities').where({ id }).update({ status: 'APPROVED' });
  await notificationsService.create(community['created_by_id'] as string, 'COMMUNITY_APPROVED', `Your community "${community['name']}" has been approved.`, id);
  await logAudit(adminId, 'COMMUNITY_APPROVED', { previousStatus: community['status'], name: community['name'] }, 'communities', id);
  return findOne(id);
}

export async function reject(id: string, adminId: string, reason?: string) {
  const community = await db('communities').where({ id }).first() as Record<string, unknown> | undefined;
  if (!community) throw new AppError(404, 'Community not found');

  if (community['status'] === 'REJECTED') return findOne(id);

  await db('communities').where({ id }).update({ status: 'REJECTED', rejection_reason: reason ?? null });
  const message = `Your community "${community['name']}" has been rejected.${reason ? ` Reason: ${reason}` : ''}`;
  await notificationsService.create(community['created_by_id'] as string, 'COMMUNITY_REJECTED', message, id);
  await logAudit(adminId, 'COMMUNITY_REJECTED', { previousStatus: community['status'], reason: reason ?? null, name: community['name'] }, 'communities', id);
  return findOne(id);
}

export async function update(id: string, data: UpdateCommunityDtoType, adminId: string) {
  const before = await db('communities').where({ id }).first() as Record<string, unknown> | undefined;
  if (!before) throw new AppError(404, 'Community not found');

  const byAdmin = before['created_by_id'] !== adminId;
  const caller = await db('users').where({ id: adminId }).first() as Record<string, unknown> | undefined;
  const callerIsAdmin = !!caller && caller['role'] === 'ADMIN';
  if (byAdmin && !callerIsAdmin) {
    throw new AppError(403, 'You can only update your own community');
  }
  if (!callerIsAdmin && (data.is_global || data.is_default)) {
    throw new AppError(403, 'Only admins can set a community to Global or Default');
  }

  const updateData: Record<string, unknown> = { ...data };

  // Resubmitting a rejected community: the owner editing their own rejected
  // community re-enters the approval gate exactly like a brand-new one,
  // instead of silently staying REJECTED after the edit.
  let reenteredPending = false;
  if (!byAdmin && caller && before['status'] === 'REJECTED') {
    const isAutoApproved = caller['role'] === 'ADMIN';
    updateData['status'] = isAutoApproved ? 'APPROVED' : 'PENDING';
    updateData['rejection_reason'] = null;
    reenteredPending = !isAutoApproved;
  }

  await db('communities').where({ id }).update(updateData);

  if (reenteredPending) {
    await notifyAdminsOfPendingCommunity(id, (data.name as string | undefined) ?? (before['name'] as string));
  }

  if (data.image !== undefined && before['image'] !== data.image) {
    deleteUploadedFile(before['image']);
  }

  // Merge before + data so the effective is_global / is_private / country are correct
  // even when those fields are also changed in the same request.
  const effective: Record<string, unknown> = { ...before, ...data, id };

  // If this edit turns is_default ON for the first time, backfill existing users.
  if (data.is_default && !before['is_default']) {
    await autoJoinExistingUsers(effective);
  }

  // A community that is now Private + scoped to a specific country (and no
  // longer Global) can end up with members who no longer belong — e.g. it
  // was Global (auto-joining everyone) and got switched to "Private —
  // Malaysia"; every non-Malaysian member who was auto-joined while it was
  // Global would otherwise stay a silent member, which kept the community
  // showing up in their own community list even though it's no longer
  // theirs to see. Drop those members; the creator stays regardless of
  // their own country.
  if (!effective['is_global'] && effective['is_private'] && effective['country']) {
    await db('community_members')
      .where({ community_id: id })
      .whereNot('user_id', before['created_by_id'] as string)
      .whereNotIn('user_id', db('users').select('id').where({ country: effective['country'] as string }))
      .delete();
  }

  await logAudit(adminId, 'COMMUNITY_UPDATED', { fields: Object.keys(data) }, 'communities', id);

  return findOne(id);
}

export async function deleteCommunity(id: string, adminId: string) {
  const community = await db('communities').where({ id }).first() as Record<string, unknown> | undefined;
  if (!community) throw new AppError(404, 'Community not found');

  const byAdmin = community['created_by_id'] !== adminId;
  if (byAdmin) {
    const caller = await db('users').where({ id: adminId }).first() as Record<string, unknown> | undefined;
    if (!caller || caller['role'] !== 'ADMIN') {
      throw new AppError(403, 'You can only delete your own community');
    }
  }

  await db('communities').where({ id }).delete();
  deleteUploadedFile(community['image']);
  await logAudit(adminId, 'COMMUNITY_DELETED', { name: community['name'] }, 'communities', id);
  if (byAdmin) {
    await notificationsService.create(
      community['created_by_id'] as string, 'COMMUNITY_REMOVED',
      `Your community "${community['name']}" was removed by an administrator.`,
    );
  }
  return { message: 'Community deleted successfully' };
}

export async function join(communityId: string, userId: string) {
  const community = await db('communities').where({ id: communityId }).first() as Record<string, unknown> | undefined;
  if (!community) throw new AppError(404, 'Community not found');

  const existing = await db('community_members').where({ user_id: userId, community_id: communityId }).first();
  if (existing) throw new AppError(409, 'You are already a member of this community');

  await db('community_members').insert({ user_id: userId, community_id: communityId });
  await logAudit(userId, 'COMMUNITY_JOINED', undefined, 'communities', communityId);

  const ownerId = community['created_by_id'] as string;
  if (ownerId !== userId) {
    const actor = await db('users').where({ id: userId }).select('display_name', 'user_name').first() as
      { display_name: string; user_name: string } | undefined;
    const actorName = actor?.display_name || actor?.user_name || 'Someone';
    const communityName = community['name'] as string;
    await notificationsService.create(
      ownerId, 'COMMUNITY_MEMBER_JOINED', `${actorName} joined your community "${communityName}"`, communityId,
      { actorName, aggregateLabel: `joined your community "${communityName}"` },
    );
  }

  return { message: 'Successfully joined the community' };
}

export async function leave(communityId: string, userId: string) {
  const membership = await db('community_members')
    .where({ user_id: userId, community_id: communityId })
    .first();

  if (!membership) throw new AppError(404, 'You are not a member of this community');

  await db('community_members').where({ id: (membership as Record<string, unknown>)['id'] }).delete();
  await logAudit(userId, 'COMMUNITY_LEFT', undefined, 'communities', communityId);
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
