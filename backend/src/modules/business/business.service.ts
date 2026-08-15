import db from '../../config/db';
import { AppError } from '../../middleware/errorHandler';
import { deleteUploadedFile, deleteUploadedFiles } from '../../services/upload-storage.service';
import { logAudit } from '../../services/audit.service';
import { geocodeAddress } from '../../services/geocoding.service';
import { validateAddressHierarchy, getDivisionChain } from '../geography/geography.service';
import type { CreateBusinessDtoType, UpdateBusinessDtoType, CreateBusinessCategoryDtoType, UpdateBusinessCategoryDtoType, ListBusinessQueryDtoType } from './business.dto';

export async function createCategory(data: CreateBusinessCategoryDtoType, adminId: string) {
  const existing = await db('business_categories').where({ name: data.name }).first();
  if (existing) throw new AppError(409, 'Category already exists');

  const [category] = await db('business_categories').insert(data).returning('*');
  await logAudit(adminId, 'BUSINESS_CATEGORY_CREATED', { name: data.name }, 'business_categories', (category as Record<string, unknown>)['id'] as string);
  return category;
}

export async function updateCategory(id: string, data: UpdateBusinessCategoryDtoType, adminId: string) {
  const existing = await db('business_categories').where({ id }).first();
  if (!existing) throw new AppError(404, 'Category not found');
  if (data.name) {
    const dup = await db('business_categories').where({ name: data.name }).whereNot({ id }).first();
    if (dup) throw new AppError(409, 'Category name already exists');
  }
  const [updated] = await db('business_categories').where({ id }).update(data).returning('*');
  await logAudit(adminId, 'BUSINESS_CATEGORY_UPDATED', { fields: Object.keys(data) }, 'business_categories', id);
  return updated;
}

export async function deleteCategory(id: string, adminId: string) {
  const existing = await db('business_categories').where({ id }).first() as Record<string, unknown> | undefined;
  if (!existing) throw new AppError(404, 'Category not found');
  const [inUse] = await db('businesses').where({ category_id: id }).count('id as count');
  if (Number((inUse as any).count) > 0)
    throw new AppError(409, `Cannot delete: ${(inUse as any).count} business(es) use this category`);
  await db('business_categories').where({ id }).delete();
  await logAudit(adminId, 'BUSINESS_CATEGORY_DELETED', { name: existing['name'] }, 'business_categories', id);
  return { message: 'Category deleted successfully' };
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

  await validateAddressHierarchy({
    countryId: data.countryId,
    stateId: data.stateId,
    cityId: data.cityId,
    pincode: data.pincode,
  });

  // Auto-geocode from the address when the client didn't send coordinates
  // (the normal case — there's no map picker in the form). Best-effort:
  // leaves latitude/longitude null if geocoding is unavailable or fails.
  let latitude = data.latitude ?? null;
  let longitude = data.longitude ?? null;
  if (latitude === null && longitude === null) {
    const geocoded = await geocodeAddress({
      address: data.address, city: data.city, state: data.state, country: data.country, pincode: data.pincode,
    });
    if (geocoded) { latitude = geocoded.latitude; longitude = geocoded.longitude; }
  }

  const [business] = await db('businesses')
    .insert({
      name: data.name,
      category_id: data.categoryId,
      description: data.description ?? null,
      images: data.images ?? [],
      logo: data.logo ?? null,
      address: data.address ?? null,
      pincode: data.pincode ?? null,
      country: data.country ?? 'United Kingdom',
      location: data.location ?? null,
      latitude,
      longitude,
      phone: data.phone ?? null,
      email: data.email ?? null,
      website: data.website ?? null,
      opening_hours: data.openingHours ?? null,
      city:          data.city         ?? null,
      state:         data.state        ?? null,
      opening_days:  data.openingDays  ?? null,
      whatsapp:      data.whatsapp     ?? null,
      maps_link:     data.mapsLink     ?? null,
      country_id:    data.countryId    ?? null,
      state_id:      data.stateId      ?? null,
      city_id:       data.cityId       ?? null,
      is_active:     data.isActive     ?? true,
      user_id: userId,
    })
    .returning('*');

  const user = await db('users').where({ id: userId }).select('id', 'user_name', 'display_name').first();
  await logAudit(userId, 'BUSINESS_CREATED', { name: data.name }, 'businesses', (business as Record<string, unknown>)['id'] as string);
  return { ...(business as Record<string, unknown>), userId: (business as Record<string, unknown>)['user_id'], category, user };
}

export async function findAll(params: ListBusinessQueryDtoType & { skipActiveFilter?: boolean; userId?: string }) {
  const {
    categoryId, categoryIds, pincode, page, limit, search, country, openingHours,
    dateFrom, dateTo, status, sortBy = 'joined', sortDir = 'desc', skipActiveFilter, userId,
  } = params;
  const offset = (page - 1) * limit;

  const query = db('businesses as b')
    .join('users as u', 'b.user_id', 'u.id')
    .join('business_categories as bc', 'b.category_id', 'bc.id')
    .leftJoin('master_countries as mc', 'b.country_id', 'mc.id')
    .leftJoin('master_states as ms', 'b.state_id', 'ms.id')
    .leftJoin('master_cities as mci', 'b.city_id', 'mci.id')
    .select(
      'b.*', 'u.id as uid', 'u.user_name', 'u.display_name', 'bc.id as cat_id', 'bc.name as cat_name', 'bc.icon as cat_icon',
      'mc.name as geo_country_name', 'ms.name as geo_state_name', 'mci.name as geo_city_name',
    );

  const countQuery = db('businesses');

  // Admin callers set skipActiveFilter=true to see inactive businesses too,
  // unless they've explicitly picked a status to filter by below.
  if (!skipActiveFilter) {
    query.where('b.is_active', true);
    countQuery.where({ is_active: true });
  }
  if (status) {
    const isActive = status === 'active';
    query.andWhere('b.is_active', isActive);
    countQuery.andWhere('is_active', isActive);
  }

  if (userId) { query.andWhere('b.user_id', userId); countQuery.andWhere('user_id', userId); }
  if (categoryId) { query.andWhere('b.category_id', categoryId); countQuery.andWhere('category_id', categoryId); }
  if (categoryIds) {
    const ids = categoryIds.split(',').map(s => s.trim()).filter(Boolean);
    if (ids.length > 0) {
      query.whereIn('b.category_id', ids);
      countQuery.whereIn('category_id', ids);
    }
  }
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
    // `opening_hours` is free text. Businesses created/edited through the
    // admin form always get an exact "9:00 AM – 5:00 PM" style string built
    // from its time pickers — which never literally contains "9-5" or
    // "24/7" — while businesses created through the user-facing form (a
    // plain text input) might. Match both: the literal preset text (for
    // free-typed values) and the admin form's canonical pattern for that
    // preset, so the filter actually returns admin-created businesses too.
    query.andWhere((qb) => {
      qb.whereILike('b.opening_hours', `%${openingHours}%`);
      if (openingHours === '9-5') {
        qb.orWhereILike('b.opening_hours', '9:00 AM%');
      } else if (openingHours === '24/7') {
        qb.orWhere((qb2) => {
          qb2.whereILike('b.opening_hours', '12:00 AM%').andWhereILike('b.opening_hours', '%11:30 PM');
        });
      }
    });
    countQuery.andWhere((qb) => {
      qb.whereILike('opening_hours', `%${openingHours}%`);
      if (openingHours === '9-5') {
        qb.orWhereILike('opening_hours', '9:00 AM%');
      } else if (openingHours === '24/7') {
        qb.orWhere((qb2) => {
          qb2.whereILike('opening_hours', '12:00 AM%').andWhereILike('opening_hours', '%11:30 PM');
        });
      }
    });
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

  const sortColumn = sortBy === 'name' ? 'b.name' : 'b.created_at';
  const [businesses, [{ total }]] = await Promise.all([
    query.orderBy(sortColumn, sortDir).limit(limit).offset(offset),
    countQuery.count({ total: '*' }),
  ]);

  const data = (businesses as Array<Record<string, unknown>>).map((b) => ({
    ...b,
    userId:       b['user_id'],
    categoryId:   b['category_id'],
    openingHours: b['opening_hours'],
    openingDays:  b['opening_days'],
    mapsLink:     b['maps_link'],
    isActive:     b['is_active'],
    isRemote:     b['is_remote'],
    countryId:    b['country_id'],
    stateId:      b['state_id'],
    cityId:       b['city_id'],
    countryName:  b['geo_country_name'],
    stateName:    b['geo_state_name'],
    cityName:     b['geo_city_name'],
    user: { id: b['uid'], userName: b['user_name'], displayName: b['display_name'] },
    category: { id: b['cat_id'], name: b['cat_name'], icon: b['cat_icon'] },
  }));

  return { data, total: Number(total), page, limit, totalPages: Math.ceil(Number(total) / limit) };
}

export async function findOne(id: string) {
  const business = await db('businesses as b')
    .join('users as u', 'b.user_id', 'u.id')
    .join('business_categories as bc', 'b.category_id', 'bc.id')
    .leftJoin('master_countries as mc', 'b.country_id', 'mc.id')
    .leftJoin('master_states as ms', 'b.state_id', 'ms.id')
    .leftJoin('master_cities as mci', 'b.city_id', 'mci.id')
    .where('b.id', id)
    .select(
      'b.*', 'u.id as uid', 'u.user_name', 'u.display_name', 'u.email as user_email', 'u.avatar',
      'bc.id as cat_id', 'bc.name as cat_name', 'bc.icon as cat_icon',
      'mc.name as geo_country_name', 'ms.name as geo_state_name', 'mci.name as geo_city_name',
    )
    .first();

  if (!business) throw new AppError(404, 'Business not found');

  const b = business as Record<string, unknown>;

  // Walks the selected division's parent chain (top-level → leaf) so the
  // Angular edit form can populate every division dropdown's options from
  // stored ids alone — no fragile name-matching required.
  const stateChain = b['state_id'] ? await getDivisionChain(b['state_id'] as number) : [];

  return {
    ...b,
    userId:       b['user_id'],
    categoryId:   b['category_id'],
    openingHours: b['opening_hours'],
    openingDays:  b['opening_days'],
    mapsLink:     b['maps_link'],
    isActive:     b['is_active'],
    countryId:    b['country_id'],
    stateId:      b['state_id'],
    cityId:       b['city_id'],
    countryName:  b['geo_country_name'],
    stateName:    b['geo_state_name'],
    cityName:     b['geo_city_name'],
    stateChain,
    user: { id: b['uid'], userName: b['user_name'], displayName: b['display_name'], email: b['user_email'], avatar: b['avatar'] },
    category: { id: b['cat_id'], name: b['cat_name'], icon: b['cat_icon'] },
  };
}

export async function update(id: string, data: UpdateBusinessDtoType, userId: string) {
  const business = await db('businesses').where({ id }).first() as Record<string, unknown> | undefined;
  if (!business) throw new AppError(404, 'Business not found');

  const byAdmin = business['user_id'] !== userId;
  if (byAdmin) {
    const user = await db('users').where({ id: userId }).first() as Record<string, unknown> | undefined;
    if (!user || user['role'] !== 'ADMIN') throw new AppError(403, 'You can only update your own business');
  }

   const updateData: Record<string, unknown> = {};
   if (data.name !== undefined) updateData['name'] = data.name;
   if (data.categoryId !== undefined) updateData['category_id'] = data.categoryId;
   if (data.description !== undefined) updateData['description'] = data.description;
   if (data.images !== undefined) updateData['images'] = data.images;
   if (data.logo !== undefined) updateData['logo'] = data.logo;
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
   if (data.city !== undefined) updateData['city'] = data.city;
   if (data.state !== undefined) updateData['state'] = data.state;
   if (data.openingDays !== undefined) updateData['opening_days'] = data.openingDays;
   if (data.whatsapp !== undefined) updateData['whatsapp'] = data.whatsapp;
   if (data.mapsLink !== undefined) updateData['maps_link'] = data.mapsLink;
   if (data.countryId !== undefined) updateData['country_id'] = data.countryId;
   if (data.stateId !== undefined) updateData['state_id'] = data.stateId;
   if (data.cityId !== undefined) updateData['city_id'] = data.cityId;
   if (data.isActive !== undefined) updateData['is_active'] = data.isActive;

  // Validate the hierarchy using whichever id is being set now, falling
  // back to the business's existing stored id for any field left unchanged
  // by this partial update.
  const effectiveCountryId = data.countryId !== undefined ? data.countryId : (business['country_id'] as number | null);
  const effectiveStateId   = data.stateId   !== undefined ? data.stateId   : (business['state_id']   as number | null);
  const effectiveCityId    = data.cityId    !== undefined ? data.cityId    : (business['city_id']    as number | null);
  const effectivePincode   = data.pincode   !== undefined ? data.pincode   : (business['pincode']    as string | null);
  await validateAddressHierarchy({
    countryId: effectiveCountryId,
    stateId: effectiveStateId,
    cityId: effectiveCityId,
    pincode: effectivePincode,
  });

  // Re-geocode only when it's actually warranted: an address-related field
  // changed, or the business has no coordinates yet — and only when the
  // client didn't explicitly send latitude/longitude (an explicit value
  // always wins). Avoids burning a paid API call on unrelated edits.
  const addressFieldChanged = data.address !== undefined || data.city !== undefined
    || data.state !== undefined || data.country !== undefined || data.pincode !== undefined;
  if (data.latitude === undefined && data.longitude === undefined
    && (addressFieldChanged || business['latitude'] == null)) {
    const geocoded = await geocodeAddress({
      address: data.address !== undefined ? data.address : (business['address'] as string | null),
      city:    data.city    !== undefined ? data.city    : (business['city']    as string | null),
      state:   data.state   !== undefined ? data.state   : (business['state']   as string | null),
      country: data.country !== undefined ? data.country : (business['country'] as string | null),
      pincode: effectivePincode,
    });
    if (geocoded) {
      updateData['latitude'] = geocoded.latitude;
      updateData['longitude'] = geocoded.longitude;
    }
  }

  await db('businesses').where({ id }).update(updateData);

  if (data.images !== undefined) {
    const oldImages = Array.isArray(business['images']) ? (business['images'] as unknown[]) : [];
    const newImages = data.images ?? [];
    deleteUploadedFiles(oldImages.filter((img) => typeof img === 'string' && !newImages.includes(img)));
  }
  if (data.logo !== undefined && business['logo'] !== data.logo) {
    deleteUploadedFile(business['logo']);
  }

  await logAudit(userId, 'BUSINESS_UPDATED', { byAdmin, fields: Object.keys(updateData) }, 'businesses', id);

  return findOne(id);
}

export async function deleteBusiness(id: string, userId: string) {
  const business = await db('businesses').where({ id }).first() as Record<string, unknown> | undefined;
  if (!business) throw new AppError(404, 'Business not found');

  const byAdmin = business['user_id'] !== userId;
  if (byAdmin) {
    const user = await db('users').where({ id: userId }).first() as Record<string, unknown> | undefined;
    if (!user || user['role'] !== 'ADMIN') throw new AppError(403, 'You can only delete your own business');
  }

  await db('businesses').where({ id }).delete();
  deleteUploadedFiles(business['images']);
  deleteUploadedFile(business['logo']);
  await logAudit(userId, 'BUSINESS_DELETED', { byAdmin, name: business['name'] }, 'businesses', id);
  return { message: 'Business deleted successfully' };
}
