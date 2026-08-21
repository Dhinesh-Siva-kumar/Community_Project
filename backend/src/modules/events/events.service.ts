import db from '../../config/db';
import { AppError } from '../../middleware/errorHandler';
import { deleteUploadedFiles } from '../../services/upload-storage.service';
import { logAudit } from '../../services/audit.service';
import * as notificationsService from '../notifications/notifications.service';
import type { CreateEventDtoType, UpdateEventDtoType, ListEventsQueryDtoType } from './events.dto';

async function notifyAdminsOfPendingEvent(eventId: string, title: string): Promise<void> {
  const admins = await db('users').where({ role: 'ADMIN' }).select('id');
  if (!admins.length) return;
  const message = `New event "${title}" pending approval.`;
  await Promise.all(
    (admins as Array<Record<string, unknown>>).map((admin) =>
      notificationsService.create(admin['id'] as string, 'EVENT_PENDING', message, eventId),
    ),
  );
}

export async function create(data: CreateEventDtoType, userId: string) {
  const caller = await db('users').where({ id: userId }).select('role', 'is_trusted', 'is_blocked').first() as Record<string, unknown> | undefined;
  const isAutoApproved = !!caller && caller['role'] === 'ADMIN';
  const status = isAutoApproved ? 'APPROVED' : 'PENDING';

  const [event] = await db('events')
    .insert({
      title: data.title,
      description: data.description ?? null,
      images: data.images ?? [],
      event_date: new Date(data.eventDate),
      event_time: data.eventTime ?? null,
      event_end_time: data.eventEndTime ?? null,
      event_category: data.eventCategory ?? null,
      timezone: data.timezone ?? 'Asia/Kolkata',
      event_mode: data.eventMode ?? 'Offline',
      location_link: data.locationLink ?? null,
      address: data.address ?? null,
      pincode: data.pincode ?? null,
      location: data.location ?? null,
      country: data.country ?? 'United Kingdom',
      user_id: userId,
      status,
    })
    .returning('*');

  const user = await db('users').where({ id: userId }).select('id', 'user_name', 'display_name', 'avatar').first();
  const e = event as Record<string, unknown>;

  if (status === 'PENDING') {
    await notifyAdminsOfPendingEvent(e['id'] as string, data.title);
  }

  await logAudit(userId, 'EVENT_CREATED', { title: data.title, status }, 'events', e['id'] as string);
  return {
    id: e['id'],
    title: e['title'],
    description: e['description'],
    images: e['images'],
    eventDate: e['event_date'],
    eventTime: e['event_time'],
    eventEndTime: e['event_end_time'],
    eventCategory: e['event_category'],
    timezone: e['timezone'],
    eventMode: e['event_mode'],
    locationLink: e['location_link'],
    address: e['address'],
    pincode: e['pincode'],
    location: e['location'],
    country: e['country'],
    userId: e['user_id'],
    isActive: e['is_active'],
    status: e['status'],
    rejectionReason: e['rejection_reason'] ?? null,
    createdAt: e['created_at'],
    updatedAt: e['updated_at'],
    user: { id: user?.id, userName: user?.user_name, displayName: user?.display_name, avatar: user?.avatar },
  };
}

export async function findAll(params: ListEventsQueryDtoType & { skipActiveFilter?: boolean; userId?: string }) {
  const {
    pincode, nearPincode, eventMode, page, limit, search, country, status, approvalStatus,
    dateFrom, dateTo, eventDateFrom, eventDateTo, sortBy = 'eventDate', sortDir = 'asc', skipActiveFilter, userId,
  } = params;
  const offset = (page - 1) * limit;

  const query = db('events as e')
    .join('users as u', 'e.user_id', 'u.id')
    .select('e.*', 'u.id as uid', 'u.user_name', 'u.display_name', 'u.avatar');

  const countQuery = db('events');

  // Admin callers set skipActiveFilter=true to see inactive events too,
  // unless they've explicitly picked a status to filter by below.
  if (!skipActiveFilter) {
    query.where('e.is_active', true);
    countQuery.where({ is_active: true });
  }
  if (status) {
    const isActive = status === 'active';
    query.andWhere('e.is_active', isActive);
    countQuery.andWhere('is_active', isActive);
  }

  // ── Moderation status — non-owner/non-admin callers only ever see
  // APPROVED events; skipActiveFilter=true (admin browse, or the caller's
  // own "mine" list) bypasses this the same way it already bypasses the
  // is_active filter above.
  if (!skipActiveFilter) {
    query.where('e.status', 'APPROVED');
    countQuery.where('status', 'APPROVED');
  }
  if (approvalStatus) {
    query.andWhere('e.status', approvalStatus);
    countQuery.andWhere('status', approvalStatus);
  }
  if (userId) { query.andWhere('e.user_id', userId); countQuery.andWhere('user_id', userId); }

  if (pincode) { query.andWhere('e.pincode', pincode); countQuery.andWhere({ pincode }); }
  if (eventMode) { query.andWhere('e.event_mode', eventMode); countQuery.andWhere({ event_mode: eventMode }); }
  if (search) {
    query.andWhere(function () { this.whereILike('e.title', `%${search}%`).orWhereILike('e.description', `%${search}%`); });
    countQuery.andWhere(function () { this.whereILike('title', `%${search}%`).orWhereILike('description', `%${search}%`); });
  }
  if (country) {
    query.andWhereILike('e.country', `%${country}%`);
    countQuery.andWhereILike('country', `%${country}%`);
  }
  if (dateFrom) {
    query.andWhere('e.created_at', '>=', dateFrom);
    countQuery.andWhere('created_at', '>=', dateFrom);
  }
  if (dateTo) {
    const toEnd = `${dateTo}T23:59:59.999Z`;
    query.andWhere('e.created_at', '<=', toEnd);
    countQuery.andWhere('created_at', '<=', toEnd);
  }
  if (eventDateFrom) {
    query.andWhere('e.event_date', '>=', eventDateFrom);
    countQuery.andWhere('event_date', '>=', eventDateFrom);
  }
  if (eventDateTo) {
    const toEnd = `${eventDateTo}T23:59:59.999Z`;
    query.andWhere('e.event_date', '<=', toEnd);
    countQuery.andWhere('event_date', '<=', toEnd);
  }

  // 'near' sorts offline/hybrid events in nearPincode to the top (event date
  // as the tiebreaker), instead of filtering everything else out.
  if (sortBy === 'near' && nearPincode) {
    query
      .orderByRaw("(e.event_mode != 'Online' AND e.pincode = ?) DESC", [nearPincode])
      .orderBy('e.event_date', 'asc');
  } else {
    const sortColumn = sortBy === 'name' ? 'e.title' : sortBy === 'joined' ? 'e.created_at' : 'e.event_date';
    query.orderBy(sortColumn, sortDir);
  }

  const [events, [{ total }]] = await Promise.all([
    query.limit(limit).offset(offset),
    countQuery.count({ total: '*' }),
  ]);

  const data = (events as Array<Record<string, unknown>>).map((e) => ({
    id: e['id'],
    title: e['title'],
    description: e['description'],
    images: e['images'],
    eventDate: e['event_date'],
    eventTime: e['event_time'],
    eventEndTime: e['event_end_time'],
    eventCategory: e['event_category'],
    timezone: e['timezone'],
    eventMode: e['event_mode'],
    locationLink: e['location_link'],
    address: e['address'],
    pincode: e['pincode'],
    location: e['location'],
    country: e['country'],
    userId: e['user_id'],
    isActive: e['is_active'],
    status: e['status'],
    rejectionReason: e['rejection_reason'] ?? null,
    createdAt: e['created_at'],
    updatedAt: e['updated_at'],
    user: { id: e['uid'], userName: e['user_name'], displayName: e['display_name'], avatar: e['avatar'] },
  }));

  return { data, total: Number(total), page, limit, totalPages: Math.ceil(Number(total) / limit) };
}

export async function findOne(id: string) {
  const event = await db('events as e')
    .join('users as u', 'e.user_id', 'u.id')
    .where('e.id', id)
    .select('e.*', 'u.id as uid', 'u.user_name', 'u.display_name', 'u.email as user_email', 'u.avatar')
    .first();

  if (!event) throw new AppError(404, 'Event not found');

  const e = event as Record<string, unknown>;
  return {
    id: e['id'],
    title: e['title'],
    description: e['description'],
    images: e['images'],
    eventDate: e['event_date'],
    eventTime: e['event_time'],
    eventEndTime: e['event_end_time'],
    eventCategory: e['event_category'],
    timezone: e['timezone'],
    eventMode: e['event_mode'],
    locationLink: e['location_link'],
    address: e['address'],
    pincode: e['pincode'],
    location: e['location'],
    country: e['country'],
    userId: e['user_id'],
    isActive: e['is_active'],
    status: e['status'],
    rejectionReason: e['rejection_reason'] ?? null,
    createdAt: e['created_at'],
    updatedAt: e['updated_at'],
    user: { id: e['uid'], userName: e['user_name'], displayName: e['display_name'], email: e['user_email'], avatar: e['avatar'] },
  };
}

export async function countPending() {
  const [{ count }] = await db('events').where({ status: 'PENDING' }).count({ count: '*' });
  return { count: Number(count) };
}

export interface FindPendingEventsOptions {
  page:     number;
  limit:    number;
  search?:  string;
  country?: string;
  dateFrom?: string;
  dateTo?:   string;
  sortBy?:  'joined' | 'name' | 'submitter' | 'country';
  sortDir?: 'asc' | 'desc';
}

export async function findPendingOnly(options: FindPendingEventsOptions) {
  const { page, limit, search, country, dateFrom, dateTo, sortBy = 'joined', sortDir = 'desc' } = options;
  const offset = (page - 1) * limit;

  const query = db('events as e')
    .join('users as u', 'e.user_id', 'u.id')
    .where('e.status', 'PENDING')
    .select('e.*', 'u.id as uid', 'u.user_name', 'u.display_name', 'u.avatar');

  const countQuery = db('events').where({ status: 'PENDING' });

  if (search) {
    query.andWhere(function () { this.whereILike('e.title', `%${search}%`).orWhereILike('e.description', `%${search}%`); });
    countQuery.andWhere(function () { this.whereILike('title', `%${search}%`).orWhereILike('description', `%${search}%`); });
  }
  if (country) {
    query.andWhereILike('e.country', `%${country}%`);
    countQuery.andWhereILike('country', `%${country}%`);
  }
  if (dateFrom) {
    query.andWhere('e.created_at', '>=', dateFrom);
    countQuery.andWhere('created_at', '>=', dateFrom);
  }
  if (dateTo) {
    const toEnd = `${dateTo}T23:59:59.999Z`;
    query.andWhere('e.created_at', '<=', toEnd);
    countQuery.andWhere('created_at', '<=', toEnd);
  }

  const sortColumn = sortBy === 'name' ? 'e.title'
    : sortBy === 'submitter' ? 'u.display_name'
    : sortBy === 'country' ? 'e.country'
    : 'e.created_at';
  const [events, [{ total }]] = await Promise.all([
    query.orderBy(sortColumn, sortDir).limit(limit).offset(offset),
    countQuery.count({ total: '*' }),
  ]);

  const data = (events as Array<Record<string, unknown>>).map((e) => ({
    id: e['id'],
    title: e['title'],
    description: e['description'],
    images: e['images'],
    eventDate: e['event_date'],
    eventTime: e['event_time'],
    eventEndTime: e['event_end_time'],
    eventCategory: e['event_category'],
    timezone: e['timezone'],
    eventMode: e['event_mode'],
    locationLink: e['location_link'],
    address: e['address'],
    pincode: e['pincode'],
    location: e['location'],
    country: e['country'],
    userId: e['user_id'],
    status: e['status'],
    rejectionReason: e['rejection_reason'] ?? null,
    createdAt: e['created_at'],
    user: { id: e['uid'], userName: e['user_name'], displayName: e['display_name'], avatar: e['avatar'] },
  }));

  return { data, total: Number(total), page, limit, totalPages: Math.ceil(Number(total) / limit) };
}

export async function approve(id: string, adminId: string) {
  const event = await db('events').where({ id }).first() as Record<string, unknown> | undefined;
  if (!event) throw new AppError(404, 'Event not found');

  if (event['status'] === 'APPROVED') return findOne(id);

  await db('events').where({ id }).update({ status: 'APPROVED' });
  await notificationsService.create(event['user_id'] as string, 'EVENT_APPROVED', `Your event "${event['title']}" has been approved.`, id);
  await logAudit(adminId, 'EVENT_APPROVED', { previousStatus: event['status'], title: event['title'] }, 'events', id);
  return findOne(id);
}

export async function reject(id: string, adminId: string, reason?: string) {
  const event = await db('events').where({ id }).first() as Record<string, unknown> | undefined;
  if (!event) throw new AppError(404, 'Event not found');

  if (event['status'] === 'REJECTED') return findOne(id);

  await db('events').where({ id }).update({ status: 'REJECTED', rejection_reason: reason ?? null });
  const message = `Your event "${event['title']}" has been rejected.${reason ? ` Reason: ${reason}` : ''}`;
  await notificationsService.create(event['user_id'] as string, 'EVENT_REJECTED', message, id);
  await logAudit(adminId, 'EVENT_REJECTED', { previousStatus: event['status'], reason: reason ?? null, title: event['title'] }, 'events', id);
  return findOne(id);
}

export async function update(id: string, data: UpdateEventDtoType, userId: string) {
  const event = await db('events').where({ id }).first() as Record<string, unknown> | undefined;
  if (!event) throw new AppError(404, 'Event not found');

  const byAdmin = event['user_id'] !== userId;
  if (byAdmin) {
    const user = await db('users').where({ id: userId }).first() as Record<string, unknown> | undefined;
    if (!user || user['role'] !== 'ADMIN') throw new AppError(403, 'You can only update your own events');
  }

  const updateData: Record<string, unknown> = {};
  if (data.title !== undefined) updateData['title'] = data.title;
  if (data.description !== undefined) updateData['description'] = data.description;
  if (data.images !== undefined) updateData['images'] = data.images;
  if (data.eventDate !== undefined) updateData['event_date'] = new Date(data.eventDate);
  if (data.eventTime !== undefined) updateData['event_time'] = data.eventTime;
  if (data.eventEndTime !== undefined) updateData['event_end_time'] = data.eventEndTime;
  if (data.eventCategory !== undefined) updateData['event_category'] = data.eventCategory;
  if (data.timezone !== undefined) updateData['timezone'] = data.timezone;
  if (data.eventMode !== undefined) updateData['event_mode'] = data.eventMode;
  if (data.locationLink !== undefined) updateData['location_link'] = data.locationLink;
  if (data.address !== undefined) updateData['address'] = data.address;
  if (data.pincode !== undefined) updateData['pincode'] = data.pincode;
  if (data.location !== undefined) updateData['location'] = data.location;
  if (data.country !== undefined) updateData['country'] = data.country;

  // Resubmitting a rejected event: the owner editing their own rejected
  // event re-enters the approval gate exactly like a brand-new one, instead
  // of silently staying REJECTED after the edit.
  let reenteredPending = false;
  if (!byAdmin && event['status'] === 'REJECTED') {
    const caller = await db('users').where({ id: userId }).select('role', 'is_trusted', 'is_blocked').first() as Record<string, unknown> | undefined;
    const isAutoApproved = !!caller && caller['role'] === 'ADMIN';
    updateData['status'] = isAutoApproved ? 'APPROVED' : 'PENDING';
    updateData['rejection_reason'] = null;
    reenteredPending = !isAutoApproved;
  }

  await db('events').where({ id }).update(updateData);

  if (reenteredPending) {
    await notifyAdminsOfPendingEvent(id, (data.title as string | undefined) ?? (event['title'] as string));
  }

  if (data.images !== undefined) {
    const oldImages = Array.isArray(event['images']) ? (event['images'] as unknown[]) : [];
    const newImages = data.images ?? [];
    deleteUploadedFiles(oldImages.filter((img) => typeof img === 'string' && !newImages.includes(img)));
  }

  await logAudit(userId, 'EVENT_UPDATED', { byAdmin, fields: Object.keys(updateData) }, 'events', id);

  return findOne(id);
}

export async function deleteEvent(id: string, userId: string) {
  const event = await db('events').where({ id }).first() as Record<string, unknown> | undefined;
  if (!event) throw new AppError(404, 'Event not found');

  const byAdmin = event['user_id'] !== userId;
  if (byAdmin) {
    const user = await db('users').where({ id: userId }).first() as Record<string, unknown> | undefined;
    if (!user || user['role'] !== 'ADMIN') throw new AppError(403, 'You can only delete your own events');
  }

  await db('events').where({ id }).delete();
  deleteUploadedFiles(event['images']);
  await logAudit(userId, 'EVENT_DELETED', { byAdmin, title: event['title'] }, 'events', id);
  if (byAdmin) {
    await notificationsService.create(
      event['user_id'] as string, 'EVENT_REMOVED',
      `Your event "${event['title']}" was removed by an administrator.`,
    );
  }
  return { message: 'Event deleted successfully' };
}
