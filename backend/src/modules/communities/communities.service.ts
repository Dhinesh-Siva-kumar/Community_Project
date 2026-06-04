import db from '../../config/db';
import { AppError } from '../../middleware/errorHandler';
import type { CreateCommunityDtoType, UpdateCommunityDtoType } from './communities.dto';

export async function create(data: CreateCommunityDtoType, adminId: string) {
  const existing = await db('communities').where({ name: data.name }).first();
  if (existing) throw new AppError(409, 'Community with this name already exists');

  const [community] = await db('communities')
    .insert({ ...data, created_by_id: adminId })
    .returning('*');

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
}) {
  const { page, limit, search, pincode } = params;
  const offset = (page - 1) * limit;

  const query = db('communities as c')
    .join('users as u', 'c.created_by_id', 'u.id')
    .where('c.is_active', true)
    .select(
      'c.*',
      'u.id as creator_id',
      'u.user_name as creator_user_name',
      'u.display_name as creator_display_name',
    );

  const countQuery = db('communities').where({ is_active: true });

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
  }));

  return { data, total: Number(total), page, limit, totalPages: Math.ceil(Number(total) / limit) };
}

export async function findOne(id: string) {
  const community = await db('communities as c')
    .join('users as u', 'c.created_by_id', 'u.id')
    .where('c.id', id)
    .select(
      'c.*',
      'u.id as creator_id',
      'u.user_name as creator_user_name',
      'u.display_name as creator_display_name',
      'u.email as creator_email',
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
  const community = await db('communities').where({ id }).first();
  if (!community) throw new AppError(404, 'Community not found');

  await db('communities').where({ id }).update(data);
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
        'u.id as user_id', 'u.user_name', 'u.display_name', 'u.email', 'u.avatar', 'u.professional_category',
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
    },
  }));

  return { data, total: Number(total), page, limit, totalPages: Math.ceil(Number(total) / limit) };
}
