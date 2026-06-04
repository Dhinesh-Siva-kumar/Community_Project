import db from '../../config/db';
import { AppError } from '../../middleware/errorHandler';
import { sendNotification } from '../../services/notifications.gateway';

export type NotificationType =
  | 'POST_APPROVED'
  | 'POST_REJECTED'
  | 'NEW_COMMENT'
  | 'NEW_LIKE'
  | 'COMMUNITY_POST'
  | 'USER_BLOCKED'
  | 'USER_UNBLOCKED'
  | 'TRUST_GRANTED'
  | 'EVENT_CREATED'
  | 'JOB_POSTED';

export async function create(
  userId: string,
  type: NotificationType,
  message: string,
  relatedEntityId?: string,
) {
  const [notification] = await db('notifications')
    .insert({
      user_id: userId,
      type,
      message,
      related_entity_id: relatedEntityId ?? null,
    })
    .returning('*');

  // Emit in real-time via Socket.IO (fire-and-forget)
  sendNotification(userId, { type, message, relatedEntityId });

  return notification;
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
    data: notifications,
    total: Number(total),
    page,
    limit,
    totalPages: Math.ceil(Number(total) / limit),
  };
}

export async function markAsRead(notificationId: string) {
  const notification = await db('notifications').where({ id: notificationId }).first();
  if (!notification) throw new AppError(404, 'Notification not found');

  const [updated] = await db('notifications')
    .where({ id: notificationId })
    .update({ is_read: true })
    .returning('*');

  return updated;
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
