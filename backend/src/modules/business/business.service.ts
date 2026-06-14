import db from '../../config/db';
import { AppError } from '../../middleware/errorHandler';
import type { CreateBusinessDtoType, UpdateBusinessDtoType, CreateBusinessCategoryDtoType, ListBusinessQueryDtoType } from './business.dto';

export async function createCategory(data: CreateBusinessCategoryDtoType) {
  const existing = await db('business_categories').where({ name: data.name }).first();
  if (existing) throw new AppError(409, 'Category already exists');

  const [category] = await db('business_categories').insert(data).returning('*');
  return category;
}

export async function getCategories() {
  const categories = await db('business_categories as bc')
    .leftJoin('businesses as b', 'bc.id', 'b.category_id')
    .groupBy('bc.id')
    .select('bc.*', db.raw('COUNT(b.id) as business_count'))
    .orderBy('bc.name', 'asc');

  return (categories as Array<Record<string, unknown>>).map((c) => ({
    ...c,
    _count: { businesses: Number(c['business_count']) },
  }));
}

export async function create(data: CreateBusinessDtoType, userId: string) {
  const category = await db('business_categories').where({ id: data.categoryId }).first();
  if (!category) throw new AppError(404, 'Business category not found');

  const [business] = await db('businesses')
    .insert({
      name: data.name,
      category_id: data.categoryId,
      description: data.description ?? null,
      images: data.images ?? [],
      address: data.address ?? null,
      pincode: data.pincode ?? null,
      country: data.country ?? 'United Kingdom',
      location: data.location ?? null,
      latitude: data.latitude ?? null,
      longitude: data.longitude ?? null,
      phone: data.phone ?? null,
      email: data.email ?? null,
      website: data.website ?? null,
      opening_hours: data.openingHours ?? null,
      user_id: userId,
    })
    .returning('*');

  const user = await db('users').where({ id: userId }).select('id', 'user_name', 'display_name').first();
  return { ...(business as Record<string, unknown>), category, user };
}

export async function findAll(params: ListBusinessQueryDtoType) {
  const { categoryId, pincode, page, limit, search, country, openingHours, dateFrom, dateTo } = params;
  const offset = (page - 1) * limit;

  const query = db('businesses as b')
    .join('users as u', 'b.user_id', 'u.id')
    .join('business_categories as bc', 'b.category_id', 'bc.id')
    .where('b.is_active', true)
    .select('b.*', 'u.id as uid', 'u.user_name', 'u.display_name', 'bc.id as cat_id', 'bc.name as cat_name', 'bc.icon as cat_icon');

  const countQuery = db('businesses').where({ is_active: true });

  if (categoryId) { query.andWhere('b.category_id', categoryId); countQuery.andWhere('category_id', categoryId); }
  if (pincode) { query.andWhere('b.pincode', pincode); countQuery.andWhere({ pincode }); }
  if (search) {
    query.andWhere(function () { this.whereILike('b.name', `%${search}%`).orWhereILike('b.description', `%${search}%`); });
    countQuery.andWhere(function () { this.whereILike('name', `%${search}%`).orWhereILike('description', `%${search}%`); });
  }
  if (country) {
    query.andWhereILike('b.country', `%${country}%`);
    countQuery.andWhereILike('country', `%${country}%`);
  }
  if (openingHours) {
    query.andWhereILike('b.opening_hours', `%${openingHours}%`);
    countQuery.andWhereILike('opening_hours', `%${openingHours}%`);
  }
  if (dateFrom) {
    query.andWhere('b.created_at', '>=', dateFrom);
    countQuery.andWhere('created_at', '>=', dateFrom);
  }
  if (dateTo) {
    const toEnd = `${dateTo}T23:59:59.999Z`;
    query.andWhere('b.created_at', '<=', toEnd);
    countQuery.andWhere('created_at', '<=', toEnd);
  }

  const [businesses, [{ total }]] = await Promise.all([
    query.orderBy('b.created_at', 'desc').limit(limit).offset(offset),
    countQuery.count({ total: '*' }),
  ]);

  const data = (businesses as Array<Record<string, unknown>>).map((b) => ({
    ...b,
    user: { id: b['uid'], userName: b['user_name'], displayName: b['display_name'] },
    category: { id: b['cat_id'], name: b['cat_name'], icon: b['cat_icon'] },
  }));

  return { data, total: Number(total), page, limit, totalPages: Math.ceil(Number(total) / limit) };
}

export async function findOne(id: string) {
  const business = await db('businesses as b')
    .join('users as u', 'b.user_id', 'u.id')
    .join('business_categories as bc', 'b.category_id', 'bc.id')
    .where('b.id', id)
    .select('b.*', 'u.id as uid', 'u.user_name', 'u.display_name', 'u.email as user_email', 'u.avatar',
            'bc.id as cat_id', 'bc.name as cat_name', 'bc.icon as cat_icon')
    .first();

  if (!business) throw new AppError(404, 'Business not found');

  const b = business as Record<string, unknown>;
  return {
    ...b,
    user: { id: b['uid'], userName: b['user_name'], displayName: b['display_name'], email: b['user_email'], avatar: b['avatar'] },
    category: { id: b['cat_id'], name: b['cat_name'], icon: b['cat_icon'] },
  };
}

export async function update(id: string, data: UpdateBusinessDtoType, userId: string) {
  const business = await db('businesses').where({ id }).first() as Record<string, unknown> | undefined;
  if (!business) throw new AppError(404, 'Business not found');

  if (business['user_id'] !== userId) {
    const user = await db('users').where({ id: userId }).first() as Record<string, unknown> | undefined;
    if (!user || user['role'] !== 'ADMIN') throw new AppError(403, 'You can only update your own business');
  }

  const updateData: Record<string, unknown> = {};
  if (data.name !== undefined) updateData['name'] = data.name;
  if (data.categoryId !== undefined) updateData['category_id'] = data.categoryId;
  if (data.description !== undefined) updateData['description'] = data.description;
  if (data.images !== undefined) updateData['images'] = data.images;
  if (data.address !== undefined) updateData['address'] = data.address;
  if (data.pincode !== undefined) updateData['pincode'] = data.pincode;
  if (data.country !== undefined) updateData['country'] = data.country;
  if (data.location !== undefined) updateData['location'] = data.location;
  if (data.latitude !== undefined) updateData['latitude'] = data.latitude;
  if (data.longitude !== undefined) updateData['longitude'] = data.longitude;
  if (data.phone !== undefined) updateData['phone'] = data.phone;
  if (data.email !== undefined) updateData['email'] = data.email;
  if (data.website !== undefined) updateData['website'] = data.website;
  if (data.openingHours !== undefined) updateData['opening_hours'] = data.openingHours;

  await db('businesses').where({ id }).update(updateData);
  return findOne(id);
}

export async function deleteBusiness(id: string, userId: string) {
  const business = await db('businesses').where({ id }).first() as Record<string, unknown> | undefined;
  if (!business) throw new AppError(404, 'Business not found');

  if (business['user_id'] !== userId) {
    const user = await db('users').where({ id: userId }).first() as Record<string, unknown> | undefined;
    if (!user || user['role'] !== 'ADMIN') throw new AppError(403, 'You can only delete your own business');
  }

  await db('businesses').where({ id }).delete();
  return { message: 'Business deleted successfully' };
}
