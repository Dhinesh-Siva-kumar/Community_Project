import db from '../../config/db';
import { AppError } from '../../middleware/errorHandler';
import { sendNotification } from '../../services/notifications.gateway';

export type NotificationType =
  | 'POST_APPROVED'
  | 'POST_REJECTED'
  | 'POST_PENDING'
  | 'NEW_COMMENT'
  | 'NEW_LIKE'
  | 'COMMUNITY_POST'
  | 'USER_BLOCKED'
  | 'USER_UNBLOCKED'
  | 'TRUST_GRANTED'
  | 'EVENT_CREATED'
  | 'JOB_POSTED'
  | 'COMMUNITY_PENDING'
  | 'COMMUNITY_APPROVED'
  | 'COMMUNITY_REJECTED'
  | 'BUSINESS_PENDING'
  | 'BUSINESS_APPROVED'
  | 'BUSINESS_REJECTED'
  | 'JOB_PENDING'
  | 'JOB_APPROVED'
  | 'JOB_REJECTED'
  | 'EVENT_PENDING'
  | 'EVENT_APPROVED'
  | 'EVENT_REJECTED'
  // ── Phase 2: account/moderation transparency ──
  | 'TRUST_REVOKED'
  | 'ACCOUNT_DEACTIVATED'
  | 'PASSWORD_RESET_BY_ADMIN'
  | 'POST_REMOVED'
  | 'COMMUNITY_REMOVED'
  | 'BUSINESS_REMOVED'
  | 'EVENT_REMOVED'
  | 'JOB_REMOVED'
  // ── Phase 3: engagement ──
  | 'COMMUNITY_MEMBER_JOINED'
  // ── Phase 4 ──
  | 'WELCOME';

export const ALL_NOTIFICATION_TYPES: NotificationType[] = [
  'POST_APPROVED', 'POST_REJECTED', 'POST_PENDING',
  'NEW_COMMENT', 'NEW_LIKE', 'COMMUNITY_POST',
  'USER_BLOCKED', 'USER_UNBLOCKED', 'TRUST_GRANTED',
  'EVENT_CREATED', 'JOB_POSTED',
  'COMMUNITY_PENDING', 'COMMUNITY_APPROVED', 'COMMUNITY_REJECTED',
  'BUSINESS_PENDING', 'BUSINESS_APPROVED', 'BUSINESS_REJECTED',
  'JOB_PENDING', 'JOB_APPROVED', 'JOB_REJECTED',
  'EVENT_PENDING', 'EVENT_APPROVED', 'EVENT_REJECTED',
  'TRUST_REVOKED', 'ACCOUNT_DEACTIVATED', 'PASSWORD_RESET_BY_ADMIN',
  'POST_REMOVED', 'COMMUNITY_REMOVED', 'BUSINESS_REMOVED', 'EVENT_REMOVED', 'JOB_REMOVED',
  'COMMUNITY_MEMBER_JOINED', 'WELCOME',
];

// For high-frequency events (likes, comments) — instead of inserting a new
// row per event, a repeat same-type/same-entity event while the previous
// one is still unread updates that row's count + message in place (e.g.
// "Priya liked your post" -> "Raj and 1 other liked your post"), so a
// popular post's owner gets one evolving notification instead of a flood.
export interface AggregateOptions {
  /** Name of the actor triggering this occurrence, e.g. "Priya". */
  actorName: string;
  /** Phrase after the actor name, e.g. "liked your post". */
  aggregateLabel: string;
}

/** Maps a raw DB row (snake_case) to the camelCase shape the frontend's `Notification` model expects. */
function toClientNotification(row: Record<string, unknown>) {
  return {
    id: row['id'],
    type: row['type'],
    message: row['message'],
    isRead: row['is_read'],
    count: row['count'],
    relatedEntityId: (row['related_entity_id'] as string | null) ?? undefined,
    // Interpolation values for the client's `notification.<TYPE>` catalog
    // entry. Null on rows written before params existed — the client falls
    // back to `message` for those.
    params: (row['params'] as Record<string, unknown> | null) ?? undefined,
    userId: row['user_id'],
    createdAt: row['created_at'],
  };
}

export async function create(
  userId: string,
  type: NotificationType,
  message: string,
  relatedEntityId?: string,
  aggregate?: AggregateOptions,
  params?: Record<string, unknown>,
) {
  const recipient = await db('users').where({ id: userId }).select('muted_notification_types').first() as
    { muted_notification_types: string[] | null } | undefined;
  if (recipient?.muted_notification_types?.includes(type)) {
    return null;
  }

  if (aggregate && relatedEntityId) {
    const existing = await db('notifications')
      .where({ user_id: userId, type, related_entity_id: relatedEntityId, is_read: false })
      .first();

    if (existing) {
      const newCount = Number(existing.count) + 1;
      const othersLabel = newCount - 1 === 1 ? '1 other' : `${newCount - 1} others`;
      const aggregatedMessage = `${aggregate.actorName} and ${othersLabel} ${aggregate.aggregateLabel}`;

      // The aggregated form is a different sentence, so it gets its own key
      // and its own params rather than reusing the single-actor ones.
      const aggregatedParams = {
        ...(params ?? {}),
        actorName: aggregate.actorName,
        othersCount: newCount - 1,
        aggregated: true,
      };

      const [updated] = await db('notifications')
        .where({ id: existing.id })
        .update({
          count: newCount,
          message: aggregatedMessage,
          params: JSON.stringify(aggregatedParams),
          created_at: db.fn.now(),
        })
        .returning('*');

      sendNotification(userId, {
        type,
        message: aggregatedMessage,
        relatedEntityId,
        params: aggregatedParams,
      });
      return toClientNotification(updated);
    }
  }

  const [notification] = await db('notifications')
    .insert({
      user_id: userId,
      type,
      message,
      params: params ? JSON.stringify(params) : null,
      related_entity_id: relatedEntityId ?? null,
    })
    .returning('*');

  // Emit in real-time via Socket.IO (fire-and-forget)
  sendNotification(userId, { type, message, relatedEntityId, params });

  return toClientNotification(notification);
}

export async function findAll(userId: string, page: number, limit: number) {
  const offset = (page - 1) * limit;

  const [notifications, [{ total }]] = await Promise.all([
    db('notifications')
      .where({ user_id: userId })
      .orderBy('created_at', 'desc')
      .limit(limit)
      .offset(offset),
    db('notifications').where({ user_id: userId }).count({ total: '*' }),
  ]);

  return {
    data: (notifications as Array<Record<string, unknown>>).map(toClientNotification),
    total: Number(total),
    page,
    limit,
    totalPages: Math.ceil(Number(total) / limit),
  };
}

export async function markAsRead(notificationId: string) {
  const notification = await db('notifications').where({ id: notificationId }).first();
  if (!notification) throw new AppError(404, 'Notification not found', 'NOTIFICATION_FOUND');

  const [updated] = await db('notifications')
    .where({ id: notificationId })
    .update({ is_read: true })
    .returning('*');

  return toClientNotification(updated);
}

export async function markAllAsRead(userId: string) {
  await db('notifications')
    .where({ user_id: userId, is_read: false })
    .update({ is_read: true });

  return { message: 'All notifications marked as read' };
}

export async function getUnreadCount(userId: string) {
  const [{ total }] = await db('notifications')
    .where({ user_id: userId, is_read: false })
    .count({ total: '*' });

  return { count: Number(total) };
}

// ---------------------------------------------------------------------------
// Preferences — per-user muted types (blacklist) + email digest opt-in.
// COMMUNITY_POST defaults to muted for everyone (see migration
// 20240029_add_phase4_notification_features.ts) so the community-post
// fan-out is opt-in, not opt-out.
// ---------------------------------------------------------------------------
export async function getPreferences(userId: string) {
  const row = await db('users').where({ id: userId })
    .select('muted_notification_types', 'email_digest_enabled')
    .first() as { muted_notification_types: string[] | null; email_digest_enabled: boolean } | undefined;
  if (!row) throw new AppError(404, 'User not found', 'USER_FOUND');

  return {
    mutedTypes: row.muted_notification_types ?? [],
    emailDigestEnabled: row.email_digest_enabled,
  };
}

export async function updatePreferences(
  userId: string,
  data: { mutedTypes?: NotificationType[]; emailDigestEnabled?: boolean },
) {
  const updateData: Record<string, unknown> = {};
  if (data.mutedTypes !== undefined) updateData['muted_notification_types'] = data.mutedTypes;
  if (data.emailDigestEnabled !== undefined) updateData['email_digest_enabled'] = data.emailDigestEnabled;

  if (Object.keys(updateData).length > 0) {
    await db('users').where({ id: userId }).update(updateData);
  }

  return getPreferences(userId);
}
