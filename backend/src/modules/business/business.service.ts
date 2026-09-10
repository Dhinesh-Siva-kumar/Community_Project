import type { Knex } from 'knex';
import db from '../../config/db';
import { AppError } from '../../middleware/errorHandler';
import { deleteUploadedFile, deleteUploadedFiles } from '../../services/upload-storage.service';
import { logAudit } from '../../services/audit.service';
import { geocodeAddress } from '../../services/geocoding.service';
import { validateAddressHierarchy, getDivisionChain } from '../geography/geography.service';
import { getViewerScope, applyBusinessVisibilityRestriction } from '../../services/business-visibility.service';
import { formatLegacyDays, formatLegacyHours } from './opening-hours.util';
import * as notificationsService from '../notifications/notifications.service';
import type { CreateBusinessDtoType, UpdateBusinessDtoType, CreateBusinessCategoryDtoType, UpdateBusinessCategoryDtoType, ListBusinessQueryDtoType } from './business.dto';

async function notifyAdminsOfPendingBusiness(businessId: string, name: string): Promise<void> {
  const admins = await db('users').where({ role: 'ADMIN' }).select('id');
  if (!admins.length) return;
  const message = `New business "${name}" pending approval.`;
  await Promise.all(
    (admins as Array<Record<string, unknown>>).map((admin) =>
      notificationsService.create(admin['id'] as string, 'BUSINESS_PENDING', message, businessId),
    ),
  );
}

/** camelCase DTO → snake_case columns; `db.raw`/knex won't do this for us. */
function toCategoryColumns(data: CreateBusinessCategoryDtoType | UpdateBusinessCategoryDtoType): Record<string, unknown> {
  const cols: Record<string, unknown> = {};
  if (data.name !== undefined) cols['name'] = data.name;
  if (data.icon !== undefined) cols['icon'] = data.icon;
  if (data.description !== undefined) cols['description'] = data.description;
  if (data.isActive !== undefined) cols['is_active'] = data.isActive;
  if (data.displayOrder !== undefined) cols['display_order'] = data.displayOrder;
  return cols;
}

function mapCategory(c: Record<string, unknown>): Record<string, unknown> {
  return { ...c, isActive: c['is_active'] ?? true, displayOrder: c['display_order'] ?? 0 };
}

export async function createCategory(data: CreateBusinessCategoryDtoType, adminId: string) {
  const existing = await db('business_categories').where({ name: data.name }).first();
  if (existing) throw new AppError(409, 'Category already exists', 'CATEGORY_ALREADY_EXISTS');

  const [category] = await db('business_categories').insert(toCategoryColumns(data)).returning('*');
  await logAudit(adminId, 'BUSINESS_CATEGORY_CREATED', { name: data.name }, 'business_categories', (category as Record<string, unknown>)['id'] as string);
  return mapCategory(category as Record<string, unknown>);
}

export async function updateCategory(id: string, data: UpdateBusinessCategoryDtoType, adminId: string) {
  const existing = await db('business_categories').where({ id }).first();
  if (!existing) throw new AppError(404, 'Category not found', 'CATEGORY_FOUND');
  if (data.name) {
    const dup = await db('business_categories').where({ name: data.name }).whereNot({ id }).first();
    if (dup) throw new AppError(409, 'Category name already exists', 'CATEGORY_NAME_ALREADY_EXISTS');
  }
  const [updated] = await db('business_categories').where({ id }).update(toCategoryColumns(data)).returning('*');
  await logAudit(adminId, 'BUSINESS_CATEGORY_UPDATED', { fields: Object.keys(data) }, 'business_categories', id);
  return mapCategory(updated as Record<string, unknown>);
}

export async function deleteCategory(id: string, adminId: string) {
  const existing = await db('business_categories').where({ id }).first() as Record<string, unknown> | undefined;
  if (!existing) throw new AppError(404, 'Category not found', 'CATEGORY_FOUND');
  const [inUse] = await db('businesses').where({ category_id: id }).count('id as count');
  if (Number((inUse as any).count) > 0)
    throw new AppError(409, `Cannot delete: ${(inUse as any).count} business(es) use this category`, 'CATEGORY_IN_USE');
  await db('business_categories').where({ id }).delete();
  await logAudit(adminId, 'BUSINESS_CATEGORY_DELETED', { name: existing['name'] }, 'business_categories', id);
  return { message: 'Category deleted successfully' };
}

/**
 * `activeOnly` excludes a category that's been deprioritised (deactivated
 * rather than deleted, so an existing business referencing it keeps
 * working) — the Add/Edit Business category picker passes this so a
 * deprioritised category can no longer be chosen for new/edited businesses.
 * Admin's own category management list omits it, so it still sees and can
 * manage every category, active or not.
 */
export async function getCategories(activeOnly = false) {
  const query = db('business_categories as bc')
    .leftJoin('businesses as b', 'bc.id', 'b.category_id')
    .groupBy('bc.id')
    .select('bc.*', db.raw('COUNT(b.id) as business_count'))
    .orderBy([{ column: 'bc.display_order', order: 'asc' }, { column: 'bc.name', order: 'asc' }]);

  if (activeOnly) query.andWhere('bc.is_active', true);

  const categories = await query;

  return (categories as Array<Record<string, unknown>>).map((c) => ({
    ...mapCategory(c),
    _count: { businesses: Number(c['business_count']) },
  }));
}

export async function create(data: CreateBusinessDtoType, userId: string) {
  const category = await db('business_categories').where({ id: data.categoryId }).first();
  if (!category) throw new AppError(404, 'Business category not found', 'BUSINESS_CATEGORY_FOUND');

  const caller = await db('users').where({ id: userId }).select('role', 'is_trusted', 'is_blocked').first() as Record<string, unknown> | undefined;
  const isAutoApproved = !!caller && caller['role'] === 'ADMIN';
  const status = isAutoApproved ? 'APPROVED' : 'PENDING';

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
      menu_images: data.menuImages ?? [],
      card_images: data.cardImages ?? [],
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
      // The two legacy free-text columns are derived from the structured
      // hours whenever those are supplied, so every consumer still reading
      // them stays correct without knowing about the JSON.
      opening_hours: data.openingHoursJson ? formatLegacyHours(data.openingHoursJson) : (data.openingHours ?? null),
      opening_days:  data.openingHoursJson ? formatLegacyDays(data.openingHoursJson)  : (data.openingDays  ?? null),
      opening_hours_json: data.openingHoursJson ? JSON.stringify(data.openingHoursJson) : null,
      city:          data.city         ?? null,
      state:         data.state        ?? null,
      whatsapp:      data.whatsapp     ?? null,
      maps_link:     data.mapsLink     ?? null,
      country_id:    data.countryId    ?? null,
      state_id:      data.stateId      ?? null,
      city_id:       data.cityId       ?? null,
      is_active:     data.isActive     ?? true,
      // Default applied here rather than in the DTO — see the note on
      // visibilityType in business.dto.ts.
      visibility_type: data.visibilityType ?? 'COUNTRY',
      status,
      user_id: userId,
    })
    .returning('*');

  const user = await db('users').where({ id: userId }).select('id', 'user_name', 'display_name').first();

  if (status === 'PENDING') {
    await notifyAdminsOfPendingBusiness((business as Record<string, unknown>)['id'] as string, data.name);
  }

  await logAudit(userId, 'BUSINESS_CREATED', { name: data.name, status }, 'businesses', (business as Record<string, unknown>)['id'] as string);
  return {
    ...(business as Record<string, unknown>),
    userId: (business as Record<string, unknown>)['user_id'],
    createdAt: (business as Record<string, unknown>)['created_at'],
    category,
    user,
  };
}

type BusinessFilterParams = Pick<
  ListBusinessQueryDtoType,
  'status' | 'approvalStatus' | 'categoryId' | 'categoryIds' | 'pincode' | 'search'
  | 'country' | 'countryIds' | 'stateId' | 'cityId' | 'visibilityType'
  | 'openOnDay' | 'openNowDay' | 'openNowTime'
  | 'hasMenu' | 'hasGallery' | 'hasWhatsapp' | 'hasWebsite'
  | 'dateFrom' | 'dateTo'
> & { skipActiveFilter?: boolean; userId?: string };

/**
 * Every business list filter, written once with a `b.` prefix.
 *
 * Both the page query and the count query alias `businesses as b` — even
 * though the count query joins nothing — so each filter is applied to both
 * from a single definition and the rows returned can never drift from the
 * `total` reported alongside them.
 */
function applyBusinessFilters(qb: Knex.QueryBuilder, params: BusinessFilterParams): void {
  const {
    skipActiveFilter, status, approvalStatus, userId, categoryId, categoryIds,
    pincode, search, country, countryIds, stateId, cityId, visibilityType,
    openOnDay, openNowDay, openNowTime,
    hasMenu, hasGallery, hasWhatsapp, hasWebsite, dateFrom, dateTo,
  } = params;

  // Admin callers set skipActiveFilter=true to see inactive businesses too,
  // unless they've explicitly picked a status to filter by below.
  if (!skipActiveFilter) qb.where('b.is_active', true);
  if (status) qb.andWhere('b.is_active', status === 'active');

  // ── Moderation status — non-owner/non-admin callers only ever see
  // APPROVED businesses; skipActiveFilter=true (admin browse, or the
  // caller's own "mine" list) bypasses this the same way it already
  // bypasses the is_active filter above.
  if (!skipActiveFilter) qb.where('b.status', 'APPROVED');
  if (approvalStatus?.length) qb.whereIn('b.status', approvalStatus);

  if (userId) qb.andWhere('b.user_id', userId);
  if (categoryId) qb.andWhere('b.category_id', categoryId);
  if (categoryIds) {
    const ids = categoryIds.split(',').map((s) => s.trim()).filter(Boolean);
    if (ids.length > 0) qb.whereIn('b.category_id', ids);
  }
  if (pincode) qb.andWhere('b.pincode', pincode);
  if (search) {
    qb.andWhere(function () {
      this.whereILike('b.name', `%${search}%`).orWhereILike('b.description', `%${search}%`);
    });
  }
  if (country) qb.andWhereILike('b.country', `%${country}%`);
  if (countryIds) {
    const ids = countryIds.split(',').map((s) => Number(s.trim())).filter((n) => Number.isInteger(n) && n > 0);
    if (ids.length > 0) qb.whereIn('b.country_id', ids);
  }
  if (stateId) qb.andWhere('b.state_id', stateId);
  if (cityId) qb.andWhere('b.city_id', cityId);

  if (visibilityType) qb.andWhere('b.visibility_type', visibilityType);

  // Structured opening hours. Both predicates read opening_hours_json only,
  // so a business whose hours were never migrated off the legacy free-text
  // columns simply doesn't match — running the backfill script is what
  // brings older rows into these filters.
  if (openOnDay) qb.andWhereRaw(`jsonb_exists(b.opening_hours_json -> 'days', ?)`, [openOnDay]);
  if (openNowDay && openNowTime) {
    qb.andWhereRaw('business_is_open_at(b.opening_hours_json, ?, ?)', [openNowDay, openNowTime]);
  }

  // array_length() returns NULL (not 0) for an empty array, and `NULL > 0`
  // is NULL — so these correctly exclude businesses with no images.
  if (hasMenu) qb.andWhereRaw('array_length(b.menu_images, 1) > 0');
  if (hasGallery) qb.andWhereRaw('array_length(b.images, 1) > 0');
  if (hasWhatsapp) qb.whereNotNull('b.whatsapp').andWhereRaw(`b.whatsapp <> ''`);
  if (hasWebsite) qb.whereNotNull('b.website').andWhereRaw(`b.website <> ''`);

  if (dateFrom) qb.andWhere('b.created_at', '>=', dateFrom);
  if (dateTo) qb.andWhere('b.created_at', '<=', `${dateTo}T23:59:59.999Z`);
}

export async function findAll(
  params: ListBusinessQueryDtoType & {
    skipActiveFilter?: boolean;
    /** Owner filter — restricts the list to one user's businesses ("mine"). */
    userId?: string;
    /** The signed-in caller, for the country/worldwide visibility gate. */
    viewerId?: string;
  },
) {
  const { page, limit, sortBy = 'joined', sortDir = 'desc', skipActiveFilter, viewerId } = params;
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

  const countQuery = db('businesses as b');

  applyBusinessFilters(query, params);
  applyBusinessFilters(countQuery, params);

  // Country/worldwide visibility — lands on exactly the same callers as the
  // moderation gate above: admins and "mine" lists set skipActiveFilter and
  // are therefore exempt.
  if (!skipActiveFilter && viewerId) {
    const scope = await getViewerScope(viewerId);
    applyBusinessVisibilityRestriction(query, 'b.', viewerId, scope);
    applyBusinessVisibilityRestriction(countQuery, 'b.', viewerId, scope);
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
    openingHoursJson: b['opening_hours_json'] ?? null,
    menuImages:   b['menu_images'] ?? [],
    cardImages:   b['card_images'] ?? [],
    visibilityType: b['visibility_type'],
    mapsLink:     b['maps_link'],
    isActive:     b['is_active'],
    rejectionReason: b['rejection_reason'] ?? null,
    createdAt:    b['created_at'],
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

  if (!business) throw new AppError(404, 'Business not found', 'BUSINESS_FOUND');

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
    openingHoursJson: b['opening_hours_json'] ?? null,
    menuImages:   b['menu_images'] ?? [],
    cardImages:   b['card_images'] ?? [],
    visibilityType: b['visibility_type'],
    mapsLink:     b['maps_link'],
    isActive:     b['is_active'],
    rejectionReason: b['rejection_reason'] ?? null,
    createdAt:    b['created_at'],
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

export async function countPending() {
  const [{ count }] = await db('businesses').where({ status: 'PENDING' }).count({ count: '*' });
  return { count: Number(count) };
}

export interface FindPendingBusinessOptions {
  page:     number;
  limit:    number;
  search?:  string;
  country?: string;
  dateFrom?: string;
  dateTo?:   string;
  sortBy?:  'joined' | 'name' | 'submitter' | 'country';
  sortDir?: 'asc' | 'desc';
}

export async function findPendingOnly(options: FindPendingBusinessOptions) {
  const { page, limit, search, country, dateFrom, dateTo, sortBy = 'joined', sortDir = 'desc' } = options;
  const offset = (page - 1) * limit;

  // Same joins and field shape as findAll()/findOne() — the Admin Approval
  // page's Business tab reviews a submission in full (including fields like
  // visibilityType, isActive, mapsLink, the id-based geography and the
  // submitter's contact details), not just the summary this used to select.
  const query = db('businesses as b')
    .join('users as u', 'b.user_id', 'u.id')
    .join('business_categories as bc', 'b.category_id', 'bc.id')
    .leftJoin('master_countries as mc', 'b.country_id', 'mc.id')
    .leftJoin('master_states as ms', 'b.state_id', 'ms.id')
    .leftJoin('master_cities as mci', 'b.city_id', 'mci.id')
    .where('b.status', 'PENDING')
    .select(
      'b.*', 'u.id as uid', 'u.user_name', 'u.display_name', 'u.email as user_email', 'u.avatar',
      'bc.id as cat_id', 'bc.name as cat_name', 'bc.icon as cat_icon',
      'mc.name as geo_country_name', 'ms.name as geo_state_name', 'mci.name as geo_city_name',
    );

  const countQuery = db('businesses as b').where('b.status', 'PENDING');

  // Same single-definition treatment as findAll — the pending list only ever
  // needs this four-filter subset.
  for (const qb of [query, countQuery]) {
    if (search) {
      qb.andWhere(function () {
        this.whereILike('b.name', `%${search}%`).orWhereILike('b.description', `%${search}%`);
      });
    }
    if (country) qb.andWhereILike('b.country', `%${country}%`);
    if (dateFrom) qb.andWhere('b.created_at', '>=', dateFrom);
    if (dateTo) qb.andWhere('b.created_at', '<=', `${dateTo}T23:59:59.999Z`);
  }

  const sortColumn = sortBy === 'name' ? 'b.name'
    : sortBy === 'submitter' ? 'u.display_name'
    : sortBy === 'country' ? 'b.country'
    : 'b.created_at';
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
    openingHoursJson: b['opening_hours_json'] ?? null,
    menuImages:   b['menu_images'] ?? [],
    cardImages:   b['card_images'] ?? [],
    visibilityType: b['visibility_type'],
    mapsLink:     b['maps_link'],
    isActive:     b['is_active'],
    rejectionReason: b['rejection_reason'] ?? null,
    createdAt:    b['created_at'],
    countryId:    b['country_id'],
    stateId:      b['state_id'],
    cityId:       b['city_id'],
    countryName:  b['geo_country_name'],
    stateName:    b['geo_state_name'],
    cityName:     b['geo_city_name'],
    user: { id: b['uid'], userName: b['user_name'], displayName: b['display_name'], email: b['user_email'], avatar: b['avatar'] },
    category: { id: b['cat_id'], name: b['cat_name'], icon: b['cat_icon'] },
  }));

  return { data, total: Number(total), page, limit, totalPages: Math.ceil(Number(total) / limit) };
}

export async function approve(id: string, adminId: string) {
  const business = await db('businesses').where({ id }).first() as Record<string, unknown> | undefined;
  if (!business) throw new AppError(404, 'Business not found', 'BUSINESS_FOUND');

  if (business['status'] === 'APPROVED') return findOne(id);

  await db('businesses').where({ id }).update({ status: 'APPROVED' });
  await notificationsService.create(business['user_id'] as string, 'BUSINESS_APPROVED', `Your business "${business['name']}" has been approved.`, id, undefined, { name: business['name'] });
  await logAudit(adminId, 'BUSINESS_APPROVED', { previousStatus: business['status'], name: business['name'] }, 'businesses', id);
  return findOne(id);
}

// Rejecting permanently deletes the submission — there is no lingering
// REJECTED state to resubmit from. Use requestMoreInfo() below when the
// owner should be able to fix and resubmit instead.
export async function reject(id: string, adminId: string, reason?: string) {
  const business = await db('businesses').where({ id }).first() as Record<string, unknown> | undefined;
  if (!business) throw new AppError(404, 'Business not found', 'BUSINESS_FOUND');

  const message = `Your business "${business['name']}" has been rejected.${reason ? ` Reason: ${reason}` : ''}`;
  await notificationsService.create(business['user_id'] as string, 'BUSINESS_REJECTED', message);
  await logAudit(adminId, 'BUSINESS_REJECTED', { previousStatus: business['status'], reason: reason ?? null, name: business['name'] }, 'businesses', id);

  await db('businesses').where({ id }).delete();
  deleteUploadedFiles(business['images']);
  deleteUploadedFiles(business['menu_images']);
  deleteUploadedFiles(business['card_images']);
  deleteUploadedFile(business['logo']);

  return { message: 'Business rejected and removed' };
}

export async function requestMoreInfo(id: string, adminId: string, reason: string) {
  const business = await db('businesses').where({ id }).first() as Record<string, unknown> | undefined;
  if (!business) throw new AppError(404, 'Business not found', 'BUSINESS_FOUND');

  await db('businesses').where({ id }).update({ status: 'NEEDS_INFO', rejection_reason: reason });
  const message = `More information is needed for your business "${business['name']}": ${reason}`;
  await notificationsService.create(business['user_id'] as string, 'BUSINESS_NEEDS_INFO', message, id);
  await logAudit(adminId, 'BUSINESS_NEEDS_INFO', { previousStatus: business['status'], reason, name: business['name'] }, 'businesses', id);
  return findOne(id);
}

export async function update(id: string, data: UpdateBusinessDtoType, userId: string) {
  const business = await db('businesses').where({ id }).first() as Record<string, unknown> | undefined;
  if (!business) throw new AppError(404, 'Business not found', 'BUSINESS_FOUND');

  const byAdmin = business['user_id'] !== userId;
  if (byAdmin) {
    const user = await db('users').where({ id: userId }).first() as Record<string, unknown> | undefined;
    if (!user || user['role'] !== 'ADMIN') throw new AppError(403, 'You can only update your own business', 'ONLY_UPDATE_OWN_BUSINESS');
  }

   const updateData: Record<string, unknown> = {};
   if (data.name !== undefined) updateData['name'] = data.name;
   if (data.categoryId !== undefined) updateData['category_id'] = data.categoryId;
   if (data.description !== undefined) updateData['description'] = data.description;
   if (data.images !== undefined) updateData['images'] = data.images;
   if (data.menuImages !== undefined) updateData['menu_images'] = data.menuImages;
   if (data.cardImages !== undefined) updateData['card_images'] = data.cardImages;
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
   if (data.visibilityType !== undefined) updateData['visibility_type'] = data.visibilityType;
   // Applied after the two legacy openingHours/openingDays branches above so
   // the structured value always wins when both are sent.
   if (data.openingHoursJson !== undefined) {
     updateData['opening_hours_json'] = JSON.stringify(data.openingHoursJson);
     updateData['opening_hours'] = formatLegacyHours(data.openingHoursJson);
     updateData['opening_days'] = formatLegacyDays(data.openingHoursJson);
   }

  // Resubmitting a rejected or needs-info business: the owner editing their
  // own business re-enters the approval gate exactly like a brand-new one,
  // instead of silently staying REJECTED/NEEDS_INFO after the edit.
  let reenteredPending = false;
  if (!byAdmin && (business['status'] === 'REJECTED' || business['status'] === 'NEEDS_INFO')) {
    const caller = await db('users').where({ id: userId }).select('role', 'is_trusted', 'is_blocked').first() as Record<string, unknown> | undefined;
    const isAutoApproved = !!caller && caller['role'] === 'ADMIN';
    updateData['status'] = isAutoApproved ? 'APPROVED' : 'PENDING';
    updateData['rejection_reason'] = null;
    reenteredPending = !isAutoApproved;
  }

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

  if (reenteredPending) {
    await notifyAdminsOfPendingBusiness(id, (data.name as string | undefined) ?? (business['name'] as string));
  }

  // Drop the files for any image the user removed from a gallery, per
  // gallery — a gallery left out of this partial update is untouched.
  const galleryColumns: Array<[keyof UpdateBusinessDtoType, string]> = [
    ['images', 'images'],
    ['menuImages', 'menu_images'],
    ['cardImages', 'card_images'],
  ];
  for (const [dtoKey, column] of galleryColumns) {
    const next = data[dtoKey] as string[] | undefined;
    if (next === undefined) continue;
    const previous = Array.isArray(business[column]) ? (business[column] as unknown[]) : [];
    deleteUploadedFiles(previous.filter((img) => typeof img === 'string' && !next.includes(img)));
  }
  if (data.logo !== undefined && business['logo'] !== data.logo) {
    deleteUploadedFile(business['logo']);
  }

  await logAudit(userId, 'BUSINESS_UPDATED', { byAdmin, fields: Object.keys(updateData) }, 'businesses', id);

  return findOne(id);
}

export async function deleteBusiness(id: string, userId: string) {
  const business = await db('businesses').where({ id }).first() as Record<string, unknown> | undefined;
  if (!business) throw new AppError(404, 'Business not found', 'BUSINESS_FOUND');

  const byAdmin = business['user_id'] !== userId;
  if (byAdmin) {
    const user = await db('users').where({ id: userId }).first() as Record<string, unknown> | undefined;
    if (!user || user['role'] !== 'ADMIN') throw new AppError(403, 'You can only delete your own business', 'ONLY_DELETE_OWN_BUSINESS');
  }

  await db('businesses').where({ id }).delete();
  deleteUploadedFiles(business['images']);
  deleteUploadedFiles(business['menu_images']);
  deleteUploadedFiles(business['card_images']);
  deleteUploadedFile(business['logo']);
  await logAudit(userId, 'BUSINESS_DELETED', { byAdmin, name: business['name'] }, 'businesses', id);
  if (byAdmin) {
    await notificationsService.create(
      business['user_id'] as string, 'BUSINESS_REMOVED',
      `Your business "${business['name']}" was removed by an administrator.`,
    );
  }
  return { message: 'Business deleted successfully' };
}
