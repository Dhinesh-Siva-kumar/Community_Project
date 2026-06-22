import db from '../../config/db';
import { AppError } from '../../middleware/errorHandler';
import type { CreateEventDtoType, UpdateEventDtoType, ListEventsQueryDtoType } from './events.dto';

export async function create(data: CreateEventDtoType, userId: string) {
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
    })
    .returning('*');

  const user = await db('users').where({ id: userId }).select('id', 'user_name', 'display_name', 'avatar').first();
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
    createdAt: e['created_at'],
    updatedAt: e['updated_at'],
    user: { id: user?.id, userName: user?.user_name, displayName: user?.display_name, avatar: user?.avatar },
  };
}

export async function findAll(params: ListEventsQueryDtoType) {
  const { pincode, page, limit, search } = params;
  const offset = (page - 1) * limit;

  const query = db('events as e')
    .join('users as u', 'e.user_id', 'u.id')
    .where('e.is_active', true)
    .select('e.*', 'u.id as uid', 'u.user_name', 'u.display_name', 'u.avatar');

  const countQuery = db('events').where({ is_active: true });

  if (pincode) { query.andWhere('e.pincode', pincode); countQuery.andWhere({ pincode }); }
  if (search) {
    query.andWhere(function () { this.whereILike('e.title', `%${search}%`).orWhereILike('e.description', `%${search}%`); });
    countQuery.andWhere(function () { this.whereILike('title', `%${search}%`).orWhereILike('description', `%${search}%`); });
  }

  const [events, [{ total }]] = await Promise.all([
    query.orderBy('e.event_date', 'asc').limit(limit).offset(offset),
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
    createdAt: e['created_at'],
    updatedAt: e['updated_at'],
    user: { id: e['uid'], userName: e['user_name'], displayName: e['display_name'], email: e['user_email'], avatar: e['avatar'] },
  };
}

export async function update(id: string, data: UpdateEventDtoType, userId: string) {
  const event = await db('events').where({ id }).first() as Record<string, unknown> | undefined;
  if (!event) throw new AppError(404, 'Event not found');

  if (event['user_id'] !== userId) {
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

  await db('events').where({ id }).update(updateData);
  return findOne(id);
}

export async function deleteEvent(id: string, userId: string) {
  const event = await db('events').where({ id }).first() as Record<string, unknown> | undefined;
  if (!event) throw new AppError(404, 'Event not found');

  if (event['user_id'] !== userId) {
    const user = await db('users').where({ id: userId }).first() as Record<string, unknown> | undefined;
    if (!user || user['role'] !== 'ADMIN') throw new AppError(403, 'You can only delete your own events');
  }

  await db('events').where({ id }).delete();
  return { message: 'Event deleted successfully' };
}
