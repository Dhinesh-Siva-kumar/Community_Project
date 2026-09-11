import db from '../../config/db';
import { AppError } from '../../middleware/errorHandler';
import { deleteUploadedFiles } from '../../services/upload-storage.service';
import { logAudit } from '../../services/audit.service';
import * as notificationsService from '../notifications/notifications.service';
import { getViewerScope, applyEventVisibilityRestriction } from '../../services/event-visibility.service';
import type {
  CreateEventDtoType, UpdateEventDtoType, ListEventsQueryDtoType,
  CreateEventCategoryDtoType, UpdateEventCategoryDtoType,
} from './events.dto';

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

/** camelCase DTO → snake_case columns; `db.raw`/knex won't do this for us. */
function toEventCategoryColumns(data: CreateEventCategoryDtoType | UpdateEventCategoryDtoType): Record<string, unknown> {
  const cols: Record<string, unknown> = {};
  if (data.name !== undefined) cols['name'] = data.name;
  if (data.icon !== undefined) cols['icon'] = data.icon;
  if (data.description !== undefined) cols['description'] = data.description;
  if (data.isActive !== undefined) cols['is_active'] = data.isActive;
  if (data.displayOrder !== undefined) cols['display_order'] = data.displayOrder;
  return cols;
}

function mapEventCategory(c: Record<string, unknown>): Record<string, unknown> {
  return { ...c, isActive: c['is_active'] ?? true, displayOrder: c['display_order'] ?? 0 };
}

export async function createEventCategory(data: CreateEventCategoryDtoType, adminId: string) {
  const existing = await db('event_categories').where({ name: data.name }).first();
  if (existing) throw new AppError(409, 'Category already exists', 'EVENT_CATEGORY_ALREADY_EXISTS');

  const [category] = await db('event_categories').insert(toEventCategoryColumns(data)).returning('*');
  await logAudit(adminId, 'EVENT_CATEGORY_CREATED', { name: data.name }, 'event_categories', (category as Record<string, unknown>)['id'] as string);
  return mapEventCategory(category as Record<string, unknown>);
}

export async function updateEventCategory(id: string, data: UpdateEventCategoryDtoType, adminId: string) {
  const existing = await db('event_categories').where({ id }).first();
  if (!existing) throw new AppError(404, 'Category not found', 'EVENT_CATEGORY_NOT_FOUND');
  if (data.name) {
    const dup = await db('event_categories').where({ name: data.name }).whereNot({ id }).first();
    if (dup) throw new AppError(409, 'Category name already exists', 'EVENT_CATEGORY_NAME_ALREADY_EXISTS');
  }
  const [updated] = await db('event_categories').where({ id }).update(toEventCategoryColumns(data)).returning('*');
  await logAudit(adminId, 'EVENT_CATEGORY_UPDATED', { fields: Object.keys(data) }, 'event_categories', id);
  return mapEventCategory(updated as Record<string, unknown>);
}

/**
 * `activeOnly` excludes a disabled category — the Add/Edit Event category
 * picker passes this so a disabled category can no longer be chosen for
 * new/edited events. Admin's own category management list omits it, so it
 * still sees and can manage every category, active or not. No delete
 * endpoint exists for event categories — disable is the only removal path,
 * so an in-use category can never be orphaned.
 */
export async function getEventCategories(activeOnly = false) {
  const query = db('event_categories as ec')
    .leftJoin('events as e', 'ec.name', 'e.event_category')
    .groupBy('ec.id')
    .select('ec.*', db.raw('COUNT(e.id) as event_count'))
    .orderBy([{ column: 'ec.display_order', order: 'asc' }, { column: 'ec.name', order: 'asc' }]);

  if (activeOnly) query.andWhere('ec.is_active', true);

  const categories = await query;

  return (categories as Array<Record<string, unknown>>).map((c) => ({
    ...mapEventCategory(c),
    _count: { events: Number(c['event_count']) },
  }));
}

/**
 * Guards event create/update against an unknown or disabled category name.
 * Distinct error codes so the client can message "doesn't exist" vs
 * "disabled" differently.
 */
async function assertActiveEventCategory(name: string): Promise<void> {
  const category = await db('event_categories').where({ name }).first() as Record<string, unknown> | undefined;
  if (!category) throw new AppError(400, `Unknown event category: ${name}`, 'EVENT_CATEGORY_NOT_FOUND');
  if (!category['is_active']) throw new AppError(400, `Event category "${name}" is disabled`, 'EVENT_CATEGORY_INACTIVE');
}

// Shared with findAll()'s 'status=upcoming/completed' filter (same
// technique, same reasoning: normalize event_date to its UTC calendar date
// regardless of the DB session's own timezone setting, combine with
// event_time — defaulting to end-of-day when unset — then interpret that
// wall-clock moment in the event's own timezone, not the API server's).
// Reused here (rather than reimplemented in JS with Intl offset math) so
// "is this event upcoming" can never drift between the list filter and
// create/update validation.
const EVENT_START_INSTANT_SQL =
  `(?::date + COALESCE(NULLIF(?, '')::time, TIME '23:59:59')) AT TIME ZONE COALESCE(NULLIF(?, ''), 'UTC')`;

async function isEventStartInPast(eventDate: string, eventTime: string | null | undefined, timezone: string | null | undefined): Promise<boolean> {
  const result = await db.raw(`SELECT (${EVENT_START_INSTANT_SQL}) < NOW() AS is_past`, [eventDate, eventTime ?? '', timezone ?? '']);
  return !!(result.rows as Array<{ is_past: boolean }>)[0]?.is_past;
}

/**
 * Cross-field guard for Event Mode's required companion fields — mirrors
 * (and is the backend enforcement of) event-form-modal.component.ts's
 * applyModeValidators(): Offline/Hybrid need a physical address, Online/
 * Hybrid need a meeting/stream link. Applies to the *effective* values
 * (already merged with the existing row on update by the caller), so an
 * edit that doesn't touch these fields is judged on what would actually be
 * saved, not just what happened to be present in this one request payload.
 */
function assertModeRequirements(mode: string, address: string | null | undefined, locationLink: string | null | undefined): void {
  const hasAddress = !!(address ?? '').trim();
  const hasLink = !!(locationLink ?? '').trim();
  if ((mode === 'Offline' || mode === 'Hybrid') && !hasAddress) {
    throw new AppError(400, 'Address is required for Offline and Hybrid events', 'EVENT_ADDRESS_REQUIRED');
  }
  if ((mode === 'Online' || mode === 'Hybrid') && !hasLink) {
    throw new AppError(400, 'Meeting/Stream Link is required for Online and Hybrid events', 'EVENT_LOCATION_LINK_REQUIRED');
  }
}

export async function create(data: CreateEventDtoType, userId: string) {
  await assertActiveEventCategory(data.eventCategory);

  const mode = data.eventMode ?? 'Offline';
  // Online events never carry physical-location data, regardless of what
  // was submitted — the frontend already clears these on mode switch, this
  // is the server-side backstop (defense in depth, not the only guard).
  const address = mode === 'Online' ? null : (data.address ?? null);
  const pincode = mode === 'Online' ? null : (data.pincode ?? null);
  const location = mode === 'Online' ? null : (data.location ?? null);
  const stateId = mode === 'Online' ? null : (data.stateId ?? null);
  const cityId = mode === 'Online' ? null : (data.cityId ?? null);
  assertModeRequirements(mode, address, data.locationLink ?? null);

  if (await isEventStartInPast(data.eventDate, data.eventTime, data.timezone)) {
    throw new AppError(400, 'Event date/time must be in the future', 'EVENT_DATE_IN_PAST');
  }

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
      event_mode: mode,
      location_link: data.locationLink ?? null,
      address,
      pincode,
      location,
      country: data.country ?? 'United Kingdom',
      country_id: data.countryId ?? null,
      state_id: stateId,
      city_id: cityId,
      visibility_type: data.visibilityType ?? 'COUNTRY',
      booking_url: data.bookingUrl ?? null,
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
    countryId: e['country_id'],
    stateId: e['state_id'],
    cityId: e['city_id'],
    visibilityType: e['visibility_type'],
    bookingUrl: e['booking_url'],
    userId: e['user_id'],
    isActive: e['is_active'],
    status: e['status'],
    rejectionReason: e['rejection_reason'] ?? null,
    createdAt: e['created_at'],
    updatedAt: e['updated_at'],
    user: { id: user?.id, userName: user?.user_name, displayName: user?.display_name, avatar: user?.avatar },
  };
}

export async function findAll(params: ListEventsQueryDtoType & { skipActiveFilter?: boolean; userId?: string; viewerId?: string }) {
  const {
    pincode, nearPincode, eventMode, page, limit, search, country, stateId, cityId, eventCategory, status, approvalStatus,
    dateFrom, dateTo, eventDateFrom, eventDateTo, sortBy = 'eventDate', sortDir = 'asc', skipActiveFilter, userId, viewerId,
    visibilityType,
  } = params;
  const offset = (page - 1) * limit;

  const query = db('events as e')
    .join('users as u', 'e.user_id', 'u.id')
    .select('e.*', 'u.id as uid', 'u.user_name', 'u.display_name', 'u.avatar');

  const countQuery = db('events as e');

  // Admin callers set skipActiveFilter=true to see inactive events too.
  if (!skipActiveFilter) {
    query.where('e.is_active', true);
    countQuery.where({ is_active: true });
  }

  // 'status' filters by the event's actual start instant — 'upcoming'
  // (hasn't started yet) vs 'completed' (already started) — independent of
  // is_active. event_date is normalized to its UTC calendar date (however
  // it was stored, regardless of the DB session's own timezone setting),
  // combined with event_time (defaulting to end-of-day when unset so an
  // event dated "today" without a specific time still counts as upcoming
  // for the whole day), then interpreted in the event's own `timezone` —
  // NOT the API server's local timezone, which is what the old date-only
  // comparison implicitly used and could disagree with the event's actual
  // timezone by several hours.
  if (status) {
    const startInstant =
      `((e.event_date AT TIME ZONE 'UTC')::date + COALESCE(NULLIF(e.event_time, '')::time, TIME '23:59:59')) ` +
      `AT TIME ZONE COALESCE(NULLIF(e.timezone, ''), 'UTC')`;
    const op = status === 'upcoming' ? '>=' : '<';
    query.andWhereRaw(`${startInstant} ${op} NOW()`);
    countQuery.andWhereRaw(`${startInstant} ${op} NOW()`);
  }

  // ── Moderation status — non-owner/non-admin callers only ever see
  // APPROVED events; skipActiveFilter=true (admin browse, or the caller's
  // own "mine" list) bypasses this the same way it already bypasses the
  // is_active filter above.
  if (!skipActiveFilter) {
    query.where('e.status', 'APPROVED');
    countQuery.where('status', 'APPROVED');
  }
  if (approvalStatus?.length) {
    query.whereIn('e.status', approvalStatus);
    countQuery.whereIn('status', approvalStatus);
  }
  if (userId) { query.andWhere('e.user_id', userId); countQuery.andWhere('user_id', userId); }

  if (pincode) { query.andWhere('e.pincode', pincode); countQuery.andWhere({ pincode }); }
  if (eventMode) { query.andWhere('e.event_mode', eventMode); countQuery.andWhere({ event_mode: eventMode }); }
  if (eventCategory) { query.andWhere('e.event_category', eventCategory); countQuery.andWhere({ event_category: eventCategory }); }
  if (search) {
    query.andWhere(function () { this.whereILike('e.title', `%${search}%`).orWhereILike('e.description', `%${search}%`); });
    countQuery.andWhere(function () { this.whereILike('title', `%${search}%`).orWhereILike('description', `%${search}%`); });
  }
  if (country) {
    query.andWhereILike('e.country', `%${country}%`);
    countQuery.andWhereILike('country', `%${country}%`);
  }
  if (stateId) { query.andWhere('e.state_id', stateId); countQuery.andWhere({ state_id: stateId }); }
  if (cityId) { query.andWhere('e.city_id', cityId); countQuery.andWhere({ city_id: cityId }); }
  // Opt-in visibility filter ("show me only Worldwide events") — independent
  // of the automatic country/worldwide access-control gate applied below.
  if (visibilityType) {
    query.andWhere('e.visibility_type', visibilityType);
    countQuery.andWhere('visibility_type', visibilityType);
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

  // Country/worldwide visibility — lands on exactly the same callers as the
  // moderation gate above: admins and "mine" lists set skipActiveFilter and
  // are therefore exempt.
  if (!skipActiveFilter && viewerId) {
    const scope = await getViewerScope(viewerId);
    applyEventVisibilityRestriction(query, 'e.', viewerId, scope);
    applyEventVisibilityRestriction(countQuery, 'e.', viewerId, scope);
  }

  // 'near' sorts offline/hybrid events in nearPincode to the top (event date
  // as the tiebreaker), instead of filtering everything else out.
  if (sortBy === 'near' && nearPincode) {
    query
      .orderByRaw("(e.event_mode != 'Online' AND e.pincode = ?) DESC", [nearPincode])
      .orderBy('e.event_date', 'asc');
  } else if (sortBy === 'location') {
    // No single "location" column — admin table lists whichever of
    // address/location/country is populated, so sort on the same fallback.
    query.orderByRaw(`COALESCE(e.address, e.location, e.country) ${sortDir}`);
  } else {
    const sortColumn =
      sortBy === 'name'     ? 'e.title'
      : sortBy === 'joined'   ? 'e.created_at'
      : sortBy === 'category' ? 'e.event_category'
      : sortBy === 'mode'     ? 'e.event_mode'
      // 'status' (Upcoming/Completed) is derived entirely from event_date,
      // so sorting by event_date also sorts by status (completed events —
      // the smaller dates — group together, then upcoming ones).
      : 'e.event_date'; // eventDate | status
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
    countryId: e['country_id'],
    stateId: e['state_id'],
    cityId: e['city_id'],
    visibilityType: e['visibility_type'],
    bookingUrl: e['booking_url'],
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

/**
 * Detail lookup. Unlike business.service.ts's findOne (which stays fully
 * open), events deliberately gate this the same way findAll does: a
 * Country-scoped event is invisible to a viewer from a different country
 * unless they're the owner or an admin. Pass viewerRole/viewerId from the
 * authenticated caller; omit viewerId only for internal callers that have
 * already established access (e.g. update()/deleteEvent() below, which do
 * their own owner/admin check).
 */
export async function findOne(id: string, viewerId?: string, viewerRole?: string) {
  const event = await db('events as e')
    .join('users as u', 'e.user_id', 'u.id')
    .where('e.id', id)
    .select('e.*', 'u.id as uid', 'u.user_name', 'u.display_name', 'u.email as user_email', 'u.avatar')
    .first();

  if (!event) throw new AppError(404, 'Event not found', 'EVENT_FOUND');

  const e = event as Record<string, unknown>;

  if (viewerId && viewerRole !== 'ADMIN' && e['user_id'] !== viewerId) {
    const scope = await getViewerScope(viewerId);
    const visible = await db('events as e')
      .where('e.id', id)
      .modify((qb) => applyEventVisibilityRestriction(qb, 'e.', viewerId, scope))
      .first('e.id');
    // Same 404 shape as "not found" — a hidden event shouldn't leak its
    // existence to a viewer who isn't allowed to see it.
    if (!visible) throw new AppError(404, 'Event not found', 'EVENT_FOUND');
  }

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
    countryId: e['country_id'],
    stateId: e['state_id'],
    cityId: e['city_id'],
    visibilityType: e['visibility_type'],
    bookingUrl: e['booking_url'],
    userId: e['user_id'],
    isActive: e['is_active'],
    status: e['status'],
    rejectionReason: e['rejection_reason'] ?? null,
    createdAt: e['created_at'],
    updatedAt: e['updated_at'],
    user: { id: e['uid'], userName: e['user_name'], displayName: e['display_name'], email: e['user_email'], avatar: e['avatar'] },
  };
}

/**
 * Other events the viewer is also allowed to see, related to `id` by
 * category first, topped up by country if there aren't enough category
 * matches. Only ever surfaces active/approved events, gated by the same
 * visibility restriction as findAll/findOne.
 */
/**
 * Relevance ranking shared by every tier below: upcoming events sort before
 * past ones (bucketed on the event's own start instant vs NOW, same
 * timezone-aware technique as isEventStartInPast/the status=upcoming list
 * filter — not a raw event_date compare, which would misjudge an event
 * that's dated "today" but already started), and within each bucket,
 * whichever event's date sits closest to the source event's own date sorts
 * first. This replaces a plain "soonest event_date first" sort, which
 * surfaced old completed events ahead of near-future ones and had no
 * concept of "closest to what the visitor is already looking at."
 */
function relatedEventsOrderByRaw(sourceEventDate: Date): [string, Array<string | number | Date>] {
  const startInstant =
    `((e.event_date AT TIME ZONE 'UTC')::date + COALESCE(NULLIF(e.event_time, '')::time, TIME '23:59:59')) ` +
    `AT TIME ZONE COALESCE(NULLIF(e.timezone, ''), 'UTC')`;
  return [
    `(CASE WHEN (${startInstant}) >= NOW() THEN 0 ELSE 1 END) ASC, ABS(EXTRACT(EPOCH FROM (e.event_date - ?::timestamptz))) ASC`,
    [sourceEventDate],
  ];
}

export async function findRelated(id: string, viewerId?: string, limit = 6) {
  const source = await db('events').where({ id }).first('event_category', 'country_id', 'country', 'event_date') as
    { event_category: string | null; country_id: number | null; country: string | null; event_date: Date } | undefined;
  if (!source) throw new AppError(404, 'Event not found', 'EVENT_FOUND');

  const scope = viewerId ? await getViewerScope(viewerId) : null;
  const [orderSql, orderBindings] = relatedEventsOrderByRaw(source.event_date);

  const baseQuery = () => {
    const qb = db('events as e')
      .join('users as u', 'e.user_id', 'u.id')
      .where('e.is_active', true)
      .andWhere('e.status', 'APPROVED')
      .andWhere('e.id', '!=', id)
      .select('e.*', 'u.id as uid', 'u.user_name', 'u.display_name', 'u.avatar');
    // Respects Country/Worldwide visibility exactly like the main listing —
    // an Online Worldwide event can suggest related events from any
    // country; a Country Based one (Online or not) only from its own.
    if (viewerId && scope) applyEventVisibilityRestriction(qb, 'e.', viewerId, scope);
    return qb;
  };

  const seen = new Set<string>([id]);
  const rows: Array<Record<string, unknown>> = [];

  // Tier 1 — same category.
  if (source.event_category) {
    const byCategory = await baseQuery()
      .andWhere('e.event_category', source.event_category)
      .orderByRaw(orderSql, orderBindings)
      .limit(limit + 1); // +1 headroom for the de-dupe below (id already excluded by the query itself)
    for (const r of byCategory as Array<Record<string, unknown>>) {
      if (rows.length >= limit) break;
      if (!seen.has(r['id'] as string)) { seen.add(r['id'] as string); rows.push(r); }
    }
  }

  // Tier 2 — same category still short of `limit`: top up with same
  // country/location (same category preferred within this tier too, so
  // it's a strict relaxation, not a replacement, of Tier 1).
  if (rows.length < limit && (source.country_id || source.country)) {
    const remaining = limit - rows.length;
    const byCountry = await baseQuery()
      .andWhere((qb) => {
        if (source.country_id) qb.orWhere('e.country_id', source.country_id);
        if (source.country) qb.orWhereILike('e.country', source.country);
      })
      .orderByRaw(
        `(e.event_category = ?) DESC, ${orderSql}`,
        [source.event_category ?? '', ...orderBindings],
      )
      .limit(remaining + seen.size); // over-fetch to allow for de-dupe below
    for (const r of byCountry as Array<Record<string, unknown>>) {
      if (rows.length >= limit) break;
      if (!seen.has(r['id'] as string)) { seen.add(r['id'] as string); rows.push(r); }
    }
  }

  // Tier 3 — still short: progressively fall back to any other eligible
  // event (still respecting is_active/status/visibility), same category
  // preferred, then same country, then date proximity — so the list never
  // silently comes back thinner than `limit` just because nothing shared a
  // category or country, as long as *something* eligible exists.
  if (rows.length < limit) {
    const remaining = limit - rows.length;
    const fallback = await baseQuery()
      .orderByRaw(
        `(e.event_category = ?) DESC, ` +
        `(${source.country_id ? 'e.country_id = ?' : '1 = 0'}) DESC, ` +
        orderSql,
        [
          source.event_category ?? '',
          ...(source.country_id ? [source.country_id] : []),
          ...orderBindings,
        ],
      )
      .limit(remaining + seen.size);
    for (const r of fallback as Array<Record<string, unknown>>) {
      if (rows.length >= limit) break;
      if (!seen.has(r['id'] as string)) { seen.add(r['id'] as string); rows.push(r); }
    }
  }

  return rows.slice(0, limit).map((e) => ({
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
    countryId: e['country_id'],
    stateId: e['state_id'],
    cityId: e['city_id'],
    visibilityType: e['visibility_type'],
    bookingUrl: e['booking_url'],
    userId: e['user_id'],
    isActive: e['is_active'],
    status: e['status'],
    rejectionReason: e['rejection_reason'] ?? null,
    createdAt: e['created_at'],
    updatedAt: e['updated_at'],
    user: { id: e['uid'], userName: e['user_name'], displayName: e['display_name'], avatar: e['avatar'] },
  }));
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
    countryId: e['country_id'],
    stateId: e['state_id'],
    cityId: e['city_id'],
    visibilityType: e['visibility_type'],
    bookingUrl: e['booking_url'],
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
  if (!event) throw new AppError(404, 'Event not found', 'EVENT_FOUND');

  if (event['status'] === 'APPROVED') return findOne(id);

  await db('events').where({ id }).update({ status: 'APPROVED' });
  await notificationsService.create(event['user_id'] as string, 'EVENT_APPROVED', `Your event "${event['title']}" has been approved.`, id, undefined, { name: event['title'] });
  await logAudit(adminId, 'EVENT_APPROVED', { previousStatus: event['status'], title: event['title'] }, 'events', id);
  return findOne(id);
}

// Rejecting is a status change, not a delete — the record, its images, and
// its audit trail all stay intact. This mirrors requestMoreInfo() below
// almost exactly (same "keep the row, let the owner fix and resubmit"
// shape); the difference is purely the resulting status and copy. The
// owner's own edit flow (update() below) already re-enters PENDING from
// REJECTED — the same branch that's long handled NEEDS_INFO resubmission.
export async function reject(id: string, adminId: string, reason: string) {
  const event = await db('events').where({ id }).first() as Record<string, unknown> | undefined;
  if (!event) throw new AppError(404, 'Event not found', 'EVENT_FOUND');

  // Same idempotency guard as approve() above — a retried request (network
  // hiccup, double-click) must not re-notify the creator or write a second
  // audit entry for a rejection that already happened.
  if (event['status'] === 'REJECTED') return findOne(id);

  await db('events').where({ id }).update({ status: 'REJECTED', rejection_reason: reason });

  const message = `Your event "${event['title']}" has been rejected. Reason: ${reason}`;
  await notificationsService.create(event['user_id'] as string, 'EVENT_REJECTED', message, id, undefined, { name: event['title'], reason });
  await logAudit(adminId, 'EVENT_REJECTED', { previousStatus: event['status'], reason, title: event['title'] }, 'events', id);

  return findOne(id);
}

export async function requestMoreInfo(id: string, adminId: string, reason: string) {
  const event = await db('events').where({ id }).first() as Record<string, unknown> | undefined;
  if (!event) throw new AppError(404, 'Event not found', 'EVENT_FOUND');

  await db('events').where({ id }).update({ status: 'NEEDS_INFO', rejection_reason: reason });
  const message = `More information is needed for your event "${event['title']}": ${reason}`;
  await notificationsService.create(event['user_id'] as string, 'EVENT_NEEDS_INFO', message, id);
  await logAudit(adminId, 'EVENT_NEEDS_INFO', { previousStatus: event['status'], reason, title: event['title'] }, 'events', id);
  return findOne(id);
}

export async function update(id: string, data: UpdateEventDtoType, userId: string) {
  const event = await db('events').where({ id }).first() as Record<string, unknown> | undefined;
  if (!event) throw new AppError(404, 'Event not found', 'EVENT_FOUND');

  const byAdmin = event['user_id'] !== userId;
  if (byAdmin) {
    const user = await db('users').where({ id: userId }).first() as Record<string, unknown> | undefined;
    if (!user || user['role'] !== 'ADMIN') throw new AppError(403, 'You can only update your own events', 'ONLY_UPDATE_OWN_EVENTS');
  }

  const updateData: Record<string, unknown> = {};
  if (data.title !== undefined) updateData['title'] = data.title;
  if (data.description !== undefined) updateData['description'] = data.description;
  if (data.images !== undefined) updateData['images'] = data.images;
  if (data.eventDate !== undefined) updateData['event_date'] = new Date(data.eventDate);
  if (data.eventTime !== undefined) updateData['event_time'] = data.eventTime;
  if (data.eventEndTime !== undefined) updateData['event_end_time'] = data.eventEndTime;
  // Only re-validate against the categories table when the category is
  // actually changing — editing any other field on an event whose category
  // has since been disabled (or removed from the canonical list) must keep
  // working, not get force-rejected because of an unrelated edit.
  if (data.eventCategory !== undefined) {
    if (data.eventCategory !== event['event_category']) {
      await assertActiveEventCategory(data.eventCategory);
    }
    updateData['event_category'] = data.eventCategory;
  }
  if (data.timezone !== undefined) updateData['timezone'] = data.timezone;
  if (data.eventMode !== undefined) updateData['event_mode'] = data.eventMode;
  if (data.locationLink !== undefined) updateData['location_link'] = data.locationLink;
  if (data.address !== undefined) updateData['address'] = data.address;
  if (data.pincode !== undefined) updateData['pincode'] = data.pincode;
  if (data.location !== undefined) updateData['location'] = data.location;
  if (data.country !== undefined) updateData['country'] = data.country;
  if (data.countryId !== undefined) updateData['country_id'] = data.countryId;
  if (data.stateId !== undefined) updateData['state_id'] = data.stateId;
  if (data.cityId !== undefined) updateData['city_id'] = data.cityId;
  if (data.visibilityType !== undefined) updateData['visibility_type'] = data.visibilityType;
  if (data.bookingUrl !== undefined) updateData['booking_url'] = data.bookingUrl;

  // ── Effective (post-update) values for the cross-field checks below —
  // merges the incoming patch with whatever's already stored, since a
  // partial edit that doesn't touch these fields must be judged on what
  // would actually be saved, not just what happened to be present in this
  // one request payload (same reasoning as the category guard above). ──
  const effEventDate = data.eventDate ?? (event['event_date'] as Date).toISOString().slice(0, 10);
  const effEventTime = data.eventTime !== undefined ? data.eventTime : (event['event_time'] as string | null);
  const effEventEndTime = data.eventEndTime !== undefined ? data.eventEndTime : (event['event_end_time'] as string | null);
  const effTimezone = data.timezone !== undefined ? data.timezone : (event['timezone'] as string | null);
  const effMode = data.eventMode ?? (event['event_mode'] as string);
  const effAddress = data.address !== undefined ? data.address : (event['address'] as string | null);
  const effLocationLink = data.locationLink !== undefined ? data.locationLink : (event['location_link'] as string | null);

  // Zero-length only — same overnight-preserving rule as CreateEventDto's
  // refine(), just evaluated here against the merged effective values since
  // a partial update may only touch one of the two time fields.
  if (effEventEndTime && effEventEndTime === effEventTime) {
    throw new AppError(400, 'Start time and End time cannot be the same', 'EVENT_TIME_RANGE_INVALID');
  }

  assertModeRequirements(effMode, effAddress, effLocationLink);

  // Only re-check "in the past" when the date/time/timezone is actually
  // changing, and only reject moving a currently-upcoming event into the
  // past — never blocks correcting an already-past/historical event's date
  // (see events.service.ts's isEventStartInPast doc comment for the same
  // reasoning already established for categories).
  const dateTimeChanging = data.eventDate !== undefined || data.eventTime !== undefined || data.timezone !== undefined;
  if (dateTimeChanging) {
    const wasUpcoming = !(await isEventStartInPast(
      (event['event_date'] as Date).toISOString().slice(0, 10),
      event['event_time'] as string | null,
      event['timezone'] as string | null,
    ));
    if (wasUpcoming && await isEventStartInPast(effEventDate, effEventTime, effTimezone)) {
      throw new AppError(400, 'Event date/time cannot be moved into the past', 'EVENT_DATE_IN_PAST');
    }
  }

  // Online events never carry physical-location data — force-clear
  // regardless of what was (or wasn't) submitted, so switching an existing
  // event to Online can't leave stale address/state/city data behind
  // (same backstop as create()).
  if (effMode === 'Online') {
    updateData['address'] = null;
    updateData['pincode'] = null;
    updateData['location'] = null;
    updateData['state_id'] = null;
    updateData['city_id'] = null;
  }

  // Resubmitting a rejected or needs-info event: the owner editing their own
  // event re-enters the approval gate exactly like a brand-new one, instead
  // of silently staying REJECTED/NEEDS_INFO after the edit.
  let reenteredPending = false;
  if (!byAdmin && (event['status'] === 'REJECTED' || event['status'] === 'NEEDS_INFO')) {
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
  if (!event) throw new AppError(404, 'Event not found', 'EVENT_FOUND');

  const byAdmin = event['user_id'] !== userId;
  if (byAdmin) {
    const user = await db('users').where({ id: userId }).first() as Record<string, unknown> | undefined;
    if (!user || user['role'] !== 'ADMIN') throw new AppError(403, 'You can only delete your own events', 'ONLY_DELETE_OWN_EVENTS');
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
