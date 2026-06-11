import db from '../../config/db';
import { AppError } from '../../middleware/errorHandler';
import type { CreatePostDtoType, ListPostsQueryDtoType, UpdatePostBodyDtoType } from './posts.dto';

const POST_USER_SELECT = [
  'u.id as user_id', 'u.user_name', 'u.display_name', 'u.avatar',
];
const POST_COMMUNITY_SELECT = [
  'c.id as community_id', 'c.name as community_name',
];

function formatPost(row: Record<string, unknown>, commentCount: number, likeCount: number) {
  return {
    id: row['id'],
    content: row['content'],
    images: row['images'],
    type: row['type'],
    status: row['status'],
    communityId: row['community_id'],
    userId: row['user_id'],
    createdAt: row['created_at'],
    updatedAt: row['updated_at'],
    user: { id: row['user_id'], userName: row['user_name'], displayName: row['display_name'], avatar: row['avatar'] },
    community: { id: row['c_community_id'] ?? row['community_id'], name: row['community_name'] },
    _count: { comments: commentCount, likes: likeCount },
  };
}

export async function create(data: CreatePostDtoType, userId: string) {
  const user = await db('users').where({ id: userId }).first() as Record<string, unknown> | undefined;
  if (!user) throw new AppError(404, 'User not found');

  const community = await db('communities').where({ id: data.communityId }).first();
  if (!community) throw new AppError(404, 'Community not found');

  const status = (user['is_trusted'] || user['role'] === 'ADMIN') ? 'APPROVED' : 'PENDING';

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
    .select('p.*', ...POST_USER_SELECT, 'c.id as c_community_id', 'c.name as community_name')
    .first() as Record<string, unknown>;

  return formatPost(row, 0, 0);
}

export async function findAll(params: ListPostsQueryDtoType & { isAdmin?: boolean }) {
  const { communityId, type, page, limit, isAdmin } = params;
  const offset = (page - 1) * limit;

  const query = db('posts as p')
    .join('users as u', 'p.user_id', 'u.id')
    .join('communities as c', 'p.community_id', 'c.id')
    .select('p.*', ...POST_USER_SELECT, 'c.id as c_community_id', 'c.name as community_name');

  const countQuery = db('posts as p');

  if (!isAdmin) {
    query.where('p.status', 'APPROVED');
    countQuery.where('status', 'APPROVED');
  }
  if (communityId) { query.andWhere('p.community_id', communityId); countQuery.andWhere('community_id', communityId); }
  if (type) { query.andWhere('p.type', type); countQuery.andWhere('type', type); }

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

export async function findPending(page: number, limit: number) {
  return findAll({ page, limit, isAdmin: true, type: undefined, communityId: undefined });
  // Override: only PENDING
}

export async function findPendingOnly(page: number, limit: number) {
  const offset = (page - 1) * limit;

  const query = db('posts as p')
    .join('users as u', 'p.user_id', 'u.id')
    .join('communities as c', 'p.community_id', 'c.id')
    .where('p.status', 'PENDING')
    .select('p.*', ...POST_USER_SELECT, 'c.id as c_community_id', 'c.name as community_name');

  const [posts, [{ total }]] = await Promise.all([
    query.orderBy('p.created_at', 'desc').limit(limit).offset(offset),
    db('posts').where({ status: 'PENDING' }).count({ total: '*' }),
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

export async function approve(postId: string) {
  const post = await db('posts').where({ id: postId }).first();
  if (!post) throw new AppError(404, 'Post not found');

  const [updated] = await db('posts').where({ id: postId }).update({ status: 'APPROVED' }).returning('*');
  const user = await db('users').where({ id: (updated as Record<string, unknown>)['user_id'] }).select('id', 'user_name', 'display_name').first();
  return { ...(updated as Record<string, unknown>), user };
}

export async function reject(postId: string) {
  const post = await db('posts').where({ id: postId }).first();
  if (!post) throw new AppError(404, 'Post not found');

  const [updated] = await db('posts').where({ id: postId }).update({ status: 'REJECTED' }).returning('*');
  const user = await db('users').where({ id: (updated as Record<string, unknown>)['user_id'] }).select('id', 'user_name', 'display_name').first();
  return { ...(updated as Record<string, unknown>), user };
}

export async function deletePost(postId: string, userId: string) {
  const post = await db('posts').where({ id: postId }).first() as Record<string, unknown> | undefined;
  if (!post) throw new AppError(404, 'Post not found');

  if (post['user_id'] !== userId) {
    const user = await db('users').where({ id: userId }).first() as Record<string, unknown> | undefined;
    if (!user || user['role'] !== 'ADMIN') throw new AppError(403, 'You can only delete your own posts');
  }

  await db('posts').where({ id: postId }).delete();
  return { message: 'Post deleted successfully' };
}

export async function updatePost(postId: string, userId: string, data: UpdatePostBodyDtoType) {
  const post = await db('posts').where({ id: postId }).first() as Record<string, unknown> | undefined;
  if (!post) throw new AppError(404, 'Post not found');

  if (post['user_id'] !== userId) {
    const user = await db('users').where({ id: userId }).first() as Record<string, unknown> | undefined;
    if (!user || user['role'] !== 'ADMIN') throw new AppError(403, 'You can only edit your own posts');
  }

  const updateFields: Record<string, unknown> = {};
  if (data.content  !== undefined) updateFields['content'] = data.content;
  if (data.type     !== undefined) updateFields['type']    = data.type;
  if (data.images   !== undefined) updateFields['images']  = data.images;

  if (Object.keys(updateFields).length === 0) throw new AppError(400, 'No fields to update');

  await db('posts').where({ id: postId }).update(updateFields);

  const row = await db('posts as p')
    .join('users as u', 'p.user_id', 'u.id')
    .join('communities as c', 'p.community_id', 'c.id')
    .where('p.id', postId)
    .select('p.*', ...POST_USER_SELECT, 'c.id as c_community_id', 'c.name as community_name')
    .first() as Record<string, unknown>;

  const [{ total: commentCount }] = await db('comments').where({ post_id: postId }).count({ total: '*' });
  const [{ total: likeCount }]    = await db('likes').where({ post_id: postId }).count({ total: '*' });

  return formatPost(row, Number(commentCount), Number(likeCount));
}

export async function like(postId: string, userId: string) {
  const post = await db('posts').where({ id: postId }).first();
  if (!post) throw new AppError(404, 'Post not found');

  const existing = await db('likes').where({ post_id: postId, user_id: userId }).first();
  if (existing) throw new AppError(409, 'You have already liked this post');

  await db('likes').insert({ post_id: postId, user_id: userId });
  const [{ total: likeCount }] = await db('likes').where({ post_id: postId }).count({ total: '*' });
  return { message: 'Post liked successfully', likeCount: Number(likeCount) };
}

export async function unlike(postId: string, userId: string) {
  const likeRow = await db('likes').where({ post_id: postId, user_id: userId }).first() as Record<string, unknown> | undefined;
  if (!likeRow) throw new AppError(404, 'You have not liked this post');

  await db('likes').where({ id: likeRow['id'] }).delete();
  const [{ total: likeCount }] = await db('likes').where({ post_id: postId }).count({ total: '*' });
  return { message: 'Post unliked successfully', likeCount: Number(likeCount) };
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
  const post = await db('posts').where({ id: postId }).first();
  if (!post) throw new AppError(404, 'Post not found');

  const [comment] = await db('comments')
    .insert({ content, post_id: postId, user_id: userId })
    .returning('*');

  const user = await db('users').where({ id: userId }).select('id', 'user_name', 'display_name', 'avatar').first();
  return { ...(comment as Record<string, unknown>), user };
}

export async function deleteComment(commentId: string, userId: string) {
  const comment = await db('comments').where({ id: commentId }).first() as Record<string, unknown> | undefined;
  if (!comment) throw new AppError(404, 'Comment not found');

  if (comment['user_id'] !== userId) {
    const user = await db('users').where({ id: userId }).first() as Record<string, unknown> | undefined;
    if (!user || user['role'] !== 'ADMIN') throw new AppError(403, 'You can only delete your own comments');
  }

  await db('comments').where({ id: commentId }).delete();
  return { message: 'Comment deleted successfully' };
}
