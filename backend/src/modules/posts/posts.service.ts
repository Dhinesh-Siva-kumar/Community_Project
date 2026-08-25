import db from '../../config/db';
import { AppError } from '../../middleware/errorHandler';
import { deleteUploadedFiles } from '../../services/upload-storage.service';
import { logAudit } from '../../services/audit.service';
import { getUserCountry, applyNonAdminVisibilityRestriction } from '../../services/community-visibility.service';
import * as notificationsService from '../notifications/notifications.service';
import type { CreatePostDtoType, ListPostsQueryDtoType, UpdatePostBodyDtoType } from './posts.dto';

const POST_USER_SELECT = [
  'u.id as user_id', 'u.user_name', 'u.display_name', 'u.avatar', 'u.is_trusted', 'u.is_blocked',
];
// Was previously `'c.id as community_id'` — a dead alias that would've
// collided with `p.community_id` (already present via `p.*`), which is why
// every call site below re-wrote these two columns inline instead of using
// this constant. Fixed the alias so it's actually usable, and added the
// community image so post cards (e.g. "Popular posts") can show the real
// community logo instead of only an initials placeholder.
const POST_COMMUNITY_SELECT = [
  'c.id as c_community_id', 'c.name as community_name', 'c.image as community_image',
];

function formatPost(row: Record<string, unknown>, commentCount: number, likeCount: number, isLiked = false, isSaved = false) {
  return {
    id: row['id'],
    content: row['content'],
    images: row['images'],
    type: row['type'],
    status: row['status'],
    rejectionReason: row['rejection_reason'] ?? null,
    communityId: row['community_id'],
    userId: row['user_id'],
    createdAt: row['created_at'],
    updatedAt: row['updated_at'],
    user: {
      id: row['user_id'], userName: row['user_name'], displayName: row['display_name'], avatar: row['avatar'],
      isTrusted: row['is_trusted'], isBlocked: row['is_blocked'],
    },
    community: { id: row['c_community_id'] ?? row['community_id'], name: row['community_name'], image: row['community_image'] ?? null },
    _count: { comments: commentCount, likes: likeCount },
    isLiked,
    isSaved,
  };
}

async function notifyAdminsOfPendingPost(postId: string, communityId: string): Promise<void> {
  const admins = await db('users').where({ role: 'ADMIN' }).select('id');
  if (!admins.length) return;

  const community = await db('communities').where({ id: communityId }).select('name').first() as Record<string, unknown> | undefined;
  const message = `New post pending approval in ${(community?.['name'] as string) ?? 'a community'}.`;

  await Promise.all(
    (admins as Array<Record<string, unknown>>).map((admin) =>
      notificationsService.create(admin['id'] as string, 'POST_PENDING', message, postId),
    ),
  );
}

// Opt-in ("new post in a joined community") — COMMUNITY_POST defaults to
// muted for everyone (see migration 20240029), so create() silently skips
// every member who hasn't explicitly un-muted it. Safe to call unconditionally.
async function notifyCommunityMembersOfNewPost(postId: string, communityId: string, posterId: string): Promise<void> {
  const community = await db('communities').where({ id: communityId }).select('name').first() as Record<string, unknown> | undefined;
  const members = await db('community_members')
    .where({ community_id: communityId })
    .whereNot({ user_id: posterId })
    .select('user_id');
  if (!members.length) return;

  const message = `New post in ${(community?.['name'] as string) ?? 'your community'}.`;
  await Promise.all(
    (members as Array<Record<string, unknown>>).map((m) =>
      notificationsService.create(m['user_id'] as string, 'COMMUNITY_POST', message, postId),
    ),
  );
}

export async function countPending() {
  const [{ count }] = await db('posts').where({ status: 'PENDING' }).count({ count: '*' });
  return { count: Number(count) };
}

export async function create(data: CreatePostDtoType, userId: string) {
  const user = await db('users').where({ id: userId }).first() as Record<string, unknown> | undefined;
  if (!user) throw new AppError(404, 'User not found', 'USER_FOUND');

  const community = await db('communities').where({ id: data.communityId }).first();
  if (!community) throw new AppError(404, 'Community not found', 'COMMUNITY_FOUND');

  const isAutoApproved = user['role'] === 'ADMIN';
  const status = isAutoApproved ? 'APPROVED' : 'PENDING';

  const [post] = await db('posts')
    .insert({
      content: data.content,
      community_id: data.communityId,
      user_id: userId,
      type: data.type ?? 'GENERAL',
      images: data.images ?? [],
      status,
    })
    .returning('*');

  const row = await db('posts as p')
    .join('users as u', 'p.user_id', 'u.id')
    .join('communities as c', 'p.community_id', 'c.id')
    .where('p.id', (post as Record<string, unknown>)['id'] as string)
    .select('p.*', ...POST_USER_SELECT, ...POST_COMMUNITY_SELECT)
    .first() as Record<string, unknown>;

  const newPostId = (post as Record<string, unknown>)['id'] as string;
  if (status === 'PENDING') {
    await notifyAdminsOfPendingPost(newPostId, data.communityId);
  } else {
    await notifyCommunityMembersOfNewPost(newPostId, data.communityId, userId);
  }

  await logAudit(userId, 'POST_CREATED', { communityId: data.communityId, type: data.type ?? 'GENERAL', status }, 'posts', newPostId);

  return formatPost(row, 0, 0);
}

export async function findAll(params: ListPostsQueryDtoType & { isAdmin?: boolean; currentUserId?: string }) {
  const { communityId, type, joined, page, limit, isAdmin, currentUserId } = params;
  const offset = (page - 1) * limit;

  const query = db('posts as p')
    .join('users as u', 'p.user_id', 'u.id')
    .join('communities as c', 'p.community_id', 'c.id')
    .select('p.*', ...POST_USER_SELECT, ...POST_COMMUNITY_SELECT);

  // Needs the same communities JOIN as `query` so the visibility restriction
  // below (and any future community-scoped filter) can apply to the count too.
  const countQuery = db('posts as p')
    .join('communities as c', 'p.community_id', 'c.id');

  if (!isAdmin) {
    query.where('p.status', 'APPROVED');
    countQuery.where('p.status', 'APPROVED');
  }
  if (communityId) { query.andWhere('p.community_id', communityId); countQuery.andWhere('p.community_id', communityId); }
  if (type) { query.andWhere('p.type', type); countQuery.andWhere('p.type', type); }

  // ── Joined filter — restrict to posts from communities the caller is a
  // member of (e.g. the "Joined" tab's Popular posts, which should only
  // surface activity from communities the user actually belongs to).
  if (joined && currentUserId) {
    query.andWhere('p.community_id', 'in', db('community_members').select('community_id').where('user_id', currentUserId));
    countQuery.andWhere('p.community_id', 'in', db('community_members').select('community_id').where('user_id', currentUserId));
  }

  // ── Non-admin visibility restriction — same rule as the community browse
  // list (communities.service.ts): a post only surfaces if its community is
  // global, private-and-matching-the-caller's-own-country, or one they've
  // already joined. Stops e.g. a "Popular posts" widget from leaking posts
  // from a country-private community the user isn't part of.
  if (!isAdmin && currentUserId) {
    const userCountry = await getUserCountry(currentUserId);
    applyNonAdminVisibilityRestriction(query, 'c.', currentUserId, userCountry);
    applyNonAdminVisibilityRestriction(countQuery, 'c.', currentUserId, userCountry);
  }

  const [posts, [{ total }]] = await Promise.all([
    query.orderBy('p.created_at', 'desc').limit(limit).offset(offset),
    countQuery.count({ total: '*' }),
  ]);

  const ids = (posts as Array<Record<string, unknown>>).map((p) => p['id'] as string);
  const commentCounts = ids.length ? await db('comments').whereIn('post_id', ids).count({ total: '*' }).select('post_id').groupBy('post_id') : [];
  const likeCounts = ids.length ? await db('likes').whereIn('post_id', ids).count({ total: '*' }).select('post_id').groupBy('post_id') : [];
  const currentUserLikes = (ids.length && currentUserId)
    ? await db('likes').whereIn('post_id', ids).andWhere('user_id', currentUserId).select('post_id')
    : [];
  const currentUserSaves = (ids.length && currentUserId)
    ? await db('post_saves').whereIn('post_id', ids).andWhere('user_id', currentUserId).select('post_id')
    : [];

  const commentMap = new Map((commentCounts as Array<Record<string, unknown>>).map((r) => [r['post_id'], Number(r['total'])]));
  const likeMap = new Map((likeCounts as Array<Record<string, unknown>>).map((r) => [r['post_id'], Number(r['total'])]));
  const likedPostIdSet = new Set((currentUserLikes as Array<Record<string, unknown>>).map((row) => String(row['post_id'])));
  const savedPostIdSet = new Set((currentUserSaves as Array<Record<string, unknown>>).map((row) => String(row['post_id'])));

  const data = (posts as Array<Record<string, unknown>>).map((p) =>
    formatPost(p, commentMap.get(p['id']) ?? 0, likeMap.get(p['id']) ?? 0, likedPostIdSet.has(String(p['id'])), savedPostIdSet.has(String(p['id']))),
  );

  return { data, total: Number(total), page, limit, totalPages: Math.ceil(Number(total) / limit) };
}

export async function findOne(postId: string, currentUserId?: string) {
  const row = await db('posts as p')
    .join('users as u', 'p.user_id', 'u.id')
    .join('communities as c', 'p.community_id', 'c.id')
    .where('p.id', postId)
    .select('p.*', ...POST_USER_SELECT, ...POST_COMMUNITY_SELECT)
    .first() as Record<string, unknown> | undefined;
  if (!row) throw new AppError(404, 'Post not found', 'POST_FOUND');

  const [{ total: commentCount }] = await db('comments').where({ post_id: postId }).count({ total: '*' });
  const [{ total: likeCount }]    = await db('likes').where({ post_id: postId }).count({ total: '*' });
  const isLiked = currentUserId
    ? !!(await db('likes').where({ post_id: postId, user_id: currentUserId }).first())
    : false;
  const isSaved = currentUserId
    ? !!(await db('post_saves').where({ post_id: postId, user_id: currentUserId }).first())
    : false;

  return formatPost(row, Number(commentCount), Number(likeCount), isLiked, isSaved);
}

export async function findPending(page: number, limit: number) {
  return findAll({ page, limit, isAdmin: true, type: undefined, communityId: undefined });
  // Override: only PENDING
}

export interface FindPendingOnlyOptions {
  page:     number;
  limit:    number;
  search?:  string;
  country?: string;
  type?:    'GENERAL' | 'HELP' | 'EMERGENCY' | 'ENQUIRY';
  dateFrom?: string;
  dateTo?:   string;
  sortBy?:  'joined' | 'community' | 'submitter';
  sortDir?: 'asc' | 'desc';
  authorStatus?: 'trusted' | 'untrusted';
}

export async function findPendingOnly(options: FindPendingOnlyOptions) {
  const { page, limit, search, country, type, dateFrom, dateTo, sortBy = 'joined', sortDir = 'desc', authorStatus } = options;
  const offset = (page - 1) * limit;

  const query = db('posts as p')
    .join('users as u', 'p.user_id', 'u.id')
    .join('communities as c', 'p.community_id', 'c.id')
    .where('p.status', 'PENDING')
    .select('p.*', ...POST_USER_SELECT, ...POST_COMMUNITY_SELECT);

  const countQuery = db('posts as p')
    .join('users as u', 'p.user_id', 'u.id')
    .join('communities as c', 'p.community_id', 'c.id')
    .where('p.status', 'PENDING');

  if (authorStatus) {
    query.andWhere('u.is_trusted', authorStatus === 'trusted');
    countQuery.andWhere('u.is_trusted', authorStatus === 'trusted');
  }

  if (search) {
    query.andWhere(function () {
      this.whereILike('c.name', `%${search}%`).orWhereILike('p.content', `%${search}%`);
    });
    countQuery.andWhere(function () {
      this.whereILike('c.name', `%${search}%`).orWhereILike('p.content', `%${search}%`);
    });
  }
  if (country) {
    query.andWhere('c.country', country);
    countQuery.andWhere('c.country', country);
  }
  if (type) {
    query.andWhere('p.type', type);
    countQuery.andWhere('p.type', type);
  }
  if (dateFrom) {
    query.andWhere('p.created_at', '>=', dateFrom);
    countQuery.andWhere('p.created_at', '>=', dateFrom);
  }
  if (dateTo) {
    const toEnd = `${dateTo}T23:59:59.999Z`;
    query.andWhere('p.created_at', '<=', toEnd);
    countQuery.andWhere('p.created_at', '<=', toEnd);
  }

  const sortColumn = sortBy === 'community' ? 'c.name'
    : sortBy === 'submitter' ? 'u.display_name'
    : 'p.created_at';
  const [posts, [{ total }]] = await Promise.all([
    query.orderBy(sortColumn, sortDir).limit(limit).offset(offset),
    countQuery.count({ total: '*' }),
  ]);

  const ids = (posts as Array<Record<string, unknown>>).map((p) => p['id'] as string);
  const commentCounts = ids.length ? await db('comments').whereIn('post_id', ids).count({ total: '*' }).select('post_id').groupBy('post_id') : [];
  const likeCounts = ids.length ? await db('likes').whereIn('post_id', ids).count({ total: '*' }).select('post_id').groupBy('post_id') : [];

  const commentMap = new Map((commentCounts as Array<Record<string, unknown>>).map((r) => [r['post_id'], Number(r['total'])]));
  const likeMap = new Map((likeCounts as Array<Record<string, unknown>>).map((r) => [r['post_id'], Number(r['total'])]));

  const data = (posts as Array<Record<string, unknown>>).map((p) =>
    formatPost(p, commentMap.get(p['id']) ?? 0, likeMap.get(p['id']) ?? 0),
  );

  return { data, total: Number(total), page, limit, totalPages: Math.ceil(Number(total) / limit) };
}

export async function approve(postId: string, adminId: string) {
  const post = await db('posts').where({ id: postId }).first() as Record<string, unknown> | undefined;
  if (!post) throw new AppError(404, 'Post not found', 'POST_FOUND');

  if (post['status'] === 'APPROVED') {
    const user = await db('users').where({ id: post['user_id'] }).select('id', 'user_name', 'display_name').first();
    return { ...post, user };
  }

  const [updated] = await db('posts').where({ id: postId }).update({ status: 'APPROVED' }).returning('*');
  const updatedRow = updated as Record<string, unknown>;
  const user = await db('users').where({ id: updatedRow['user_id'] }).select('id', 'user_name', 'display_name').first();
  await notificationsService.create(updatedRow['user_id'] as string, 'POST_APPROVED', 'Your post has been approved.', postId, undefined, {});
  await notifyCommunityMembersOfNewPost(postId, updatedRow['community_id'] as string, updatedRow['user_id'] as string);
  await logAudit(adminId, 'POST_APPROVED', { previousStatus: post['status'], author: (user as Record<string, unknown> | undefined)?.['user_name'] }, 'posts', postId);
  return { ...updatedRow, user };
}

export async function reject(postId: string, adminId: string, reason?: string) {
  const post = await db('posts').where({ id: postId }).first() as Record<string, unknown> | undefined;
  if (!post) throw new AppError(404, 'Post not found', 'POST_FOUND');

  if (post['status'] === 'REJECTED') {
    const user = await db('users').where({ id: post['user_id'] }).select('id', 'user_name', 'display_name').first();
    return { ...post, user };
  }

  const [updated] = await db('posts').where({ id: postId })
    .update({ status: 'REJECTED', rejection_reason: reason ?? null })
    .returning('*');
  const updatedRow = updated as Record<string, unknown>;
  const user = await db('users').where({ id: updatedRow['user_id'] }).select('id', 'user_name', 'display_name').first();
  const message = `Your post has been rejected.${reason ? ` Reason: ${reason}` : ''}`;
  await notificationsService.create(updatedRow['user_id'] as string, 'POST_REJECTED', message, postId);
  await logAudit(adminId, 'POST_REJECTED', { previousStatus: post['status'], reason: reason ?? null, author: (user as Record<string, unknown> | undefined)?.['user_name'] }, 'posts', postId);
  return { ...updatedRow, user };
}

export async function findMine(userId: string, options: { page: number; limit: number; status?: 'PENDING' | 'APPROVED' | 'REJECTED'; communityId?: string }) {
  const { page, limit, status, communityId } = options;
  const offset = (page - 1) * limit;

  const query = db('posts as p')
    .join('users as u', 'p.user_id', 'u.id')
    .join('communities as c', 'p.community_id', 'c.id')
    .where('p.user_id', userId)
    .select('p.*', ...POST_USER_SELECT, ...POST_COMMUNITY_SELECT);

  const countQuery = db('posts as p').where('p.user_id', userId);

  if (status) {
    query.andWhere('p.status', status);
    countQuery.andWhere('p.status', status);
  }
  if (communityId) {
    query.andWhere('p.community_id', communityId);
    countQuery.andWhere('p.community_id', communityId);
  }

  const [posts, [{ total }]] = await Promise.all([
    query.orderBy('p.created_at', 'desc').limit(limit).offset(offset),
    countQuery.count({ total: '*' }),
  ]);

  const ids = (posts as Array<Record<string, unknown>>).map((p) => p['id'] as string);
  const commentCounts = ids.length ? await db('comments').whereIn('post_id', ids).count({ total: '*' }).select('post_id').groupBy('post_id') : [];
  const likeCounts = ids.length ? await db('likes').whereIn('post_id', ids).count({ total: '*' }).select('post_id').groupBy('post_id') : [];

  const commentMap = new Map((commentCounts as Array<Record<string, unknown>>).map((r) => [r['post_id'], Number(r['total'])]));
  const likeMap = new Map((likeCounts as Array<Record<string, unknown>>).map((r) => [r['post_id'], Number(r['total'])]));

  const data = (posts as Array<Record<string, unknown>>).map((p) =>
    formatPost(p, commentMap.get(p['id']) ?? 0, likeMap.get(p['id']) ?? 0),
  );

  return { data, total: Number(total), page, limit, totalPages: Math.ceil(Number(total) / limit) };
}

export async function deletePost(postId: string, userId: string) {
  const post = await db('posts').where({ id: postId }).first() as Record<string, unknown> | undefined;
  if (!post) throw new AppError(404, 'Post not found', 'POST_FOUND');

  if (post['user_id'] !== userId) {
    const user = await db('users').where({ id: userId }).first() as Record<string, unknown> | undefined;
    if (!user || user['role'] !== 'ADMIN') throw new AppError(403, 'You can only delete your own posts', 'ONLY_DELETE_OWN_POSTS');
  }

  await db('posts').where({ id: postId }).delete();
  deleteUploadedFiles(post['images']);

  const byAdmin = post['user_id'] !== userId;
  await logAudit(userId, 'POST_DELETED', { byAdmin, communityId: post['community_id'] }, 'posts', postId);
  if (byAdmin) {
    await notificationsService.create(post['user_id'] as string, 'POST_REMOVED', 'Your post was removed by an administrator.', undefined, undefined, {});
  }

  return { message: 'Post deleted successfully' };
}

export async function updatePost(postId: string, userId: string, data: UpdatePostBodyDtoType) {
  const post = await db('posts').where({ id: postId }).first() as Record<string, unknown> | undefined;
  if (!post) throw new AppError(404, 'Post not found', 'POST_FOUND');

  const isOwner = post['user_id'] === userId;
  const editor = await db('users').where({ id: userId }).first() as Record<string, unknown> | undefined;
  if (!isOwner && (!editor || editor['role'] !== 'ADMIN')) {
    throw new AppError(403, 'You can only edit your own posts', 'ONLY_EDIT_OWN_POSTS');
  }

  const updateFields: Record<string, unknown> = {};
  if (data.content  !== undefined) updateFields['content'] = data.content;
  if (data.type     !== undefined) updateFields['type']    = data.type;
  if (data.images   !== undefined) updateFields['images']  = data.images;

  // Resubmitting a rejected post: the author editing their own rejected post
  // re-enters the approval gate exactly like a brand-new post, instead of
  // silently staying REJECTED after the edit.
  if (isOwner && editor && post['status'] === 'REJECTED') {
    const isAutoApproved = editor['role'] === 'ADMIN';
    updateFields['status'] = isAutoApproved ? 'APPROVED' : 'PENDING';
    updateFields['rejection_reason'] = null;
  }

  if (Object.keys(updateFields).length === 0) throw new AppError(400, 'No fields to update', 'FIELDS_UPDATE');

  await db('posts').where({ id: postId }).update(updateFields);

  if (data.images !== undefined) {
    const oldImages = Array.isArray(post['images']) ? (post['images'] as unknown[]) : [];
    const newImages = data.images ?? [];
    deleteUploadedFiles(oldImages.filter((img) => typeof img === 'string' && !newImages.includes(img)));
  }

  if (updateFields['status'] === 'PENDING') {
    await notifyAdminsOfPendingPost(postId, post['community_id'] as string);
  }

  await logAudit(userId, 'POST_UPDATED', { byAdmin: !isOwner, fields: Object.keys(updateFields) }, 'posts', postId);

  const row = await db('posts as p')
    .join('users as u', 'p.user_id', 'u.id')
    .join('communities as c', 'p.community_id', 'c.id')
    .where('p.id', postId)
    .select('p.*', ...POST_USER_SELECT, ...POST_COMMUNITY_SELECT)
    .first() as Record<string, unknown>;

  const [{ total: commentCount }] = await db('comments').where({ post_id: postId }).count({ total: '*' });
  const [{ total: likeCount }]    = await db('likes').where({ post_id: postId }).count({ total: '*' });

  return formatPost(row, Number(commentCount), Number(likeCount));
}

export async function like(postId: string, userId: string) {
  const post = await db('posts').where({ id: postId }).first() as Record<string, unknown> | undefined;
  if (!post) throw new AppError(404, 'Post not found', 'POST_FOUND');

  const existing = await db('likes').where({ post_id: postId, user_id: userId }).first();
  if (existing) throw new AppError(409, 'You have already liked this post', 'HAVE_ALREADY_LIKED_POST');

  await db('likes').insert({ post_id: postId, user_id: userId });
  const [{ total: likeCount }] = await db('likes').where({ post_id: postId }).count({ total: '*' });

  const ownerId = post['user_id'] as string;
  if (ownerId !== userId) {
    const actor = await db('users').where({ id: userId }).select('display_name', 'user_name').first() as
      { display_name: string; user_name: string } | undefined;
    const actorName = actor?.display_name || actor?.user_name || 'Someone';
    await notificationsService.create(
      ownerId, 'NEW_LIKE', `${actorName} liked your post`, postId,
      { actorName, aggregateLabel: 'liked your post' },
    );
  }

  return { message: 'Post liked successfully', likeCount: Number(likeCount) };
}

export async function unlike(postId: string, userId: string) {
  const likeRow = await db('likes').where({ post_id: postId, user_id: userId }).first() as Record<string, unknown> | undefined;
  if (!likeRow) throw new AppError(404, 'You have not liked this post', 'HAVE_LIKED_POST');

  await db('likes').where({ id: likeRow['id'] }).delete();
  const [{ total: likeCount }] = await db('likes').where({ post_id: postId }).count({ total: '*' });
  return { message: 'Post unliked successfully', likeCount: Number(likeCount) };
}

export async function savePost(postId: string, userId: string) {
  const post = await db('posts').where({ id: postId }).first();
  if (!post) throw new AppError(404, 'Post not found', 'POST_FOUND');

  const existing = await db('post_saves').where({ post_id: postId, user_id: userId }).first();
  if (existing) throw new AppError(409, 'You have already saved this post', 'HAVE_ALREADY_SAVED_POST');

  await db('post_saves').insert({ post_id: postId, user_id: userId });
  return { message: 'Post saved successfully' };
}

export async function unsavePost(postId: string, userId: string) {
  const saveRow = await db('post_saves').where({ post_id: postId, user_id: userId }).first() as Record<string, unknown> | undefined;
  if (!saveRow) throw new AppError(404, 'You have not saved this post', 'HAVE_SAVED_POST');

  await db('post_saves').where({ id: saveRow['id'] }).delete();
  return { message: 'Post unsaved successfully' };
}


export async function getComments(postId: string, page: number, limit: number) {
  const offset = (page - 1) * limit;

  const [comments, [{ total }]] = await Promise.all([
    db('comments as cm')
      .join('users as u', 'cm.user_id', 'u.id')
      .where('cm.post_id', postId)
      .select('cm.*', 'u.id as uid', 'u.user_name', 'u.display_name', 'u.avatar')
      .orderBy('cm.created_at', 'desc')
      .limit(limit)
      .offset(offset),
    db('comments').where({ post_id: postId }).count({ total: '*' }),
  ]);

  const data = (comments as Array<Record<string, unknown>>).map((c) => ({
    id: c['id'],
    content: c['content'],
    postId: c['post_id'],
    createdAt: c['created_at'],
    updatedAt: c['updated_at'],
    user: { id: c['uid'], userName: c['user_name'], displayName: c['display_name'], avatar: c['avatar'] },
  }));

  return { data, total: Number(total), page, limit, totalPages: Math.ceil(Number(total) / limit) };
}

export async function addComment(postId: string, userId: string, content: string) {
  const post = await db('posts').where({ id: postId }).first() as Record<string, unknown> | undefined;
  if (!post) throw new AppError(404, 'Post not found', 'POST_FOUND');

  const [comment] = await db('comments')
    .insert({ content, post_id: postId, user_id: userId })
    .returning('*');

  const user = await db('users').where({ id: userId }).select('id', 'user_name', 'display_name', 'avatar').first() as Record<string, unknown> | undefined;
  const commentRow = comment as Record<string, unknown>;

  const ownerId = post['user_id'] as string;
  if (ownerId !== userId) {
    const actorName = (user?.['display_name'] as string) || (user?.['user_name'] as string) || 'Someone';
    await notificationsService.create(
      ownerId, 'NEW_COMMENT', `${actorName} commented on your post`, postId,
      { actorName, aggregateLabel: 'commented on your post' },
    );
  }

  return {
    id: commentRow['id'],
    content: commentRow['content'],
    postId: commentRow['post_id'],
    userId: commentRow['user_id'],
    createdAt: commentRow['created_at'],
    updatedAt: commentRow['updated_at'],
    user: user
      ? {
          id: user['id'],
          userName: user['user_name'],
          displayName: user['display_name'],
          avatar: user['avatar'],
        }
      : undefined,
  };
}

export async function deleteComment(commentId: string, userId: string) {
  const comment = await db('comments').where({ id: commentId }).first() as Record<string, unknown> | undefined;
  if (!comment) throw new AppError(404, 'Comment not found', 'COMMENT_FOUND');

  if (comment['user_id'] !== userId) {
    const user = await db('users').where({ id: userId }).first() as Record<string, unknown> | undefined;
    if (!user || user['role'] !== 'ADMIN') throw new AppError(403, 'You can only delete your own comments', 'ONLY_DELETE_OWN_COMMENTS');
  }

  await db('comments').where({ id: commentId }).delete();
  return { message: 'Comment deleted successfully' };
}
