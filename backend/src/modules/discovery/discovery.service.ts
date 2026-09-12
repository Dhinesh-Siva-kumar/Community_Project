import type { Knex } from 'knex';
import db from '../../config/db';
import * as jobsService from '../jobs/jobs.service';
import * as businessService from '../business/business.service';
import * as eventsService from '../events/events.service';
import * as communitiesService from '../communities/communities.service';
import * as postsService from '../posts/posts.service';

// ─────────────────────────────────────────────────────────────
// Guest-facing discovery/preview layer.
//
// Deliberately calls each feature's existing findAll() (no viewerId, so it
// naturally returns only active+approved rows — the same gate every other
// caller goes through) instead of writing parallel SQL here. Every result is
// then mapped through an ALLOW-list below — never a block-list — so a field
// added later to jobs/business/events/communities can never leak into a
// guest preview by default.
// ─────────────────────────────────────────────────────────────

/**
 * Events and communities only filter by free-text `country` (no `countryId`
 * support in their list DTOs, unlike jobs/business which accept
 * `countryIds`) — resolve the id the frontend sends into a name once here
 * rather than special-casing it at every call site.
 */
async function resolveCountryName(countryId?: number): Promise<string | undefined> {
  if (!countryId) return undefined;
  const row = await db('master_countries').where({ id: countryId }).select('name').first();
  return (row as Record<string, unknown> | undefined)?.['name'] as string | undefined;
}

function toJobPreview(j: Record<string, unknown>) {
  const user = j['user'] as Record<string, unknown> | undefined;
  return {
    id: j['id'],
    title: j['title'],
    companyName: j['companyName'],
    companyLogo: j['companyLogo'],
    city: j['city'],
    state: j['state'],
    country: j['country'],
    workMode: j['workMode'],
    jobType: j['jobType'],
    salaryMin: j['salaryMin'],
    salaryMax: j['salaryMax'],
    salaryType: j['salaryType'],
    salaryHidden: j['salaryHidden'],
    isRemote: j['isRemote'],
    createdAt: j['createdAt'],
    user: user ? { displayName: user['displayName'], avatar: user['avatar'] } : null,
  };
}

function toBusinessPreview(b: Record<string, unknown>) {
  const category = b['category'] as Record<string, unknown> | undefined;
  const description = typeof b['description'] === 'string' ? (b['description'] as string).slice(0, 120) : null;
  return {
    id: b['id'],
    name: b['name'],
    category: category ? { id: category['id'], name: category['name'], icon: category['icon'] } : null,
    city: b['city'],
    state: b['state'],
    country: b['country'],
    logo: b['logo'],
    description,
    createdAt: b['createdAt'],
  };
}

function toEventPreview(e: Record<string, unknown>) {
  const images = e['images'];
  return {
    id: e['id'],
    title: e['title'],
    eventDate: e['eventDate'],
    eventMode: e['eventMode'],
    eventCategory: e['eventCategory'],
    country: e['country'],
    coverImage: Array.isArray(images) && images.length > 0 ? images[0] : null,
    createdAt: e['createdAt'],
  };
}

function toCommunityPreview(c: Record<string, unknown>) {
  const description = typeof c['description'] === 'string' ? (c['description'] as string).slice(0, 150) : null;
  const count = c['_count'] as Record<string, unknown> | undefined;
  return {
    id: c['id'],
    name: c['name'],
    description,
    image: c['image'],
    country: c['country'],
    categoryName: c['category_name'] ?? null,
    memberCount: Number(count?.['members'] ?? 0),
  };
}

export async function getJobsPreview(countryId: number | undefined, limit: number) {
  const result = await jobsService.findAll({
    page: 1,
    limit,
    sortBy: 'newest',
    countryIds: countryId ? String(countryId) : undefined,
  });
  return result.data.map((j) => toJobPreview(j as unknown as Record<string, unknown>));
}

export async function getBusinessesPreview(countryId: number | undefined, limit: number) {
  const result = await businessService.findAll({
    page: 1,
    limit,
    sortBy: 'joined',
    sortDir: 'desc',
    countryIds: countryId ? String(countryId) : undefined,
  });
  return result.data.map((b) => toBusinessPreview(b as unknown as Record<string, unknown>));
}

export async function getEventsPreview(countryId: number | undefined, limit: number) {
  const country = await resolveCountryName(countryId);
  const result = await eventsService.findAll({
    page: 1,
    limit,
    sortBy: 'eventDate',
    sortDir: 'asc',
    status: 'upcoming',
    country,
  });
  return result.data.map((e) => toEventPreview(e as unknown as Record<string, unknown>));
}

export async function getCommunitiesPreview(countryId: number | undefined, limit: number) {
  const country = await resolveCountryName(countryId);
  const result = await communitiesService.findAll({
    page: 1,
    limit,
    sortBy: 'members',
    sortDir: 'desc',
    country,
  });
  return (result.data as unknown as Record<string, unknown>[])
    .filter((c) => !c['is_private'])
    .map(toCommunityPreview);
}

/** Public (non-private) community ids — the pool any guest-facing preview
 * that needs to reach into a specific community (e.g. its posts) draws from. */
async function getPublicCommunityIds(country: string | undefined, limit: number): Promise<string[]> {
  const result = await communitiesService.findAll({
    page: 1,
    limit,
    sortBy: 'members',
    sortDir: 'desc',
    country,
  });
  return (result.data as unknown as Record<string, unknown>[])
    .filter((c) => !c['is_private'])
    .map((c) => c['id'] as string);
}

function toPostPreview(p: Record<string, unknown>) {
  const community = p['community'] as Record<string, unknown> | undefined;
  const user = p['user'] as Record<string, unknown> | undefined;
  const counts = p['_count'] as Record<string, unknown> | undefined;
  const content = typeof p['content'] === 'string' ? (p['content'] as string) : '';
  const images = p['images'];
  return {
    id: p['id'],
    content: content.length > 220 ? `${content.slice(0, 220).trimEnd()}...` : content,
    image: Array.isArray(images) && images.length > 0 ? images[0] : null,
    type: p['type'],
    createdAt: p['createdAt'],
    community: community ? { id: community['id'], name: community['name'], image: community['image'] } : null,
    user: user ? { displayName: user['displayName'], avatar: user['avatar'] } : null,
    likeCount: Number(counts?.['likes'] ?? 0),
    commentCount: Number(counts?.['comments'] ?? 0),
  };
}

/**
 * Guest-facing "Community Stream" preview — posts from public communities
 * only (private/country-restricted communities never surface here, same as
 * getCommunitiesPreview above). Reuses postsService.findAll per community
 * (no currentUserId/isAdmin, so it naturally returns APPROVED-only posts)
 * rather than writing a fresh cross-community query.
 */
export async function getPostsPreview(countryId: number | undefined, limit: number) {
  const country = await resolveCountryName(countryId);
  const communityIds = await getPublicCommunityIds(country, 5);
  if (communityIds.length === 0) return [];

  const perCommunityLimit = Math.min(limit, 5);
  const results = await Promise.all(
    communityIds.map((communityId) =>
      postsService.findAll({ communityId, page: 1, limit: perCommunityLimit }),
    ),
  );

  const merged = results
    .flatMap((r) => r.data as unknown as Record<string, unknown>[])
    .sort((a, b) => new Date(b['createdAt'] as string).getTime() - new Date(a['createdAt'] as string).getTime())
    .slice(0, limit);

  return merged.map(toPostPreview);
}

export interface PlatformStats {
  countries: number;
  communities: number;
  jobs: number;
  businesses: number;
  events: number;
}

/** Same `is_active = true AND status = 'APPROVED'` gate every findAll() above
 * applies by default with no viewerId — the exact set of rows a guest can
 * already see via the previews, just counted instead of fetched. */
function activeApproved(query: Knex.QueryBuilder, alias: string): Knex.QueryBuilder {
  return query.where(`${alias}.is_active`, true).where(`${alias}.status`, 'APPROVED');
}

/** Per-table country key: prefer the `country_id` FK, falling back to a
 * name lookup against master_countries for legacy rows where the FK backfill
 * never ran (see jobs/business/events/communities migration notes) — so a
 * record with only the free-text `country` column still counts. */
function countryKeyQuery(table: string) {
  return activeApproved(
    db(`${table} as t`)
      .leftJoin('master_countries as mc', 'mc.name', 't.country')
      .select(db.raw('COALESCE(t.country_id, mc.id) as country_key')),
    't',
  );
}

export async function getPlatformStats(): Promise<PlatformStats> {
  const countryUnion = countryKeyQuery('communities').union([
    countryKeyQuery('businesses'),
    countryKeyQuery('jobs'),
    countryKeyQuery('events'),
  ]);

  const [
    [{ total: communities }],
    [{ total: businesses }],
    [{ total: jobs }],
    [{ total: events }],
    countryRow,
  ] = await Promise.all([
    activeApproved(db('communities as t'), 't').count({ total: '*' }),
    activeApproved(db('businesses as t'), 't').count({ total: '*' }),
    activeApproved(db('jobs as t'), 't').count({ total: '*' }),
    activeApproved(db('events as t'), 't').count({ total: '*' }),
    db.from(countryUnion.as('combined')).whereNotNull('country_key').countDistinct({ total: 'country_key' }).first(),
  ]);

  return {
    countries: Number((countryRow as { total: string | number } | undefined)?.total ?? 0),
    communities: Number(communities),
    jobs: Number(jobs),
    businesses: Number(businesses),
    events: Number(events),
  };
}

export interface DiscoverySearchResult {
  query: string;
  jobs: ReturnType<typeof toJobPreview>[];
  businesses: ReturnType<typeof toBusinessPreview>[];
  events: ReturnType<typeof toEventPreview>[];
  communities: ReturnType<typeof toCommunityPreview>[];
}

export async function searchAll(q: string, countryId: number | undefined, limit: number): Promise<DiscoverySearchResult> {
  const countryName = await resolveCountryName(countryId);

  const [jobs, businesses, events, communities] = await Promise.all([
    jobsService.findAll({ page: 1, limit, sortBy: 'newest', search: q, countryIds: countryId ? String(countryId) : undefined }),
    businessService.findAll({ page: 1, limit, sortBy: 'joined', sortDir: 'desc', search: q, countryIds: countryId ? String(countryId) : undefined }),
    eventsService.findAll({ page: 1, limit, sortBy: 'eventDate', sortDir: 'asc', search: q, country: countryName }),
    communitiesService.findAll({ page: 1, limit, sortBy: 'members', sortDir: 'desc', search: q, country: countryName }),
  ]);

  return {
    query: q,
    jobs: jobs.data.map((j) => toJobPreview(j as unknown as Record<string, unknown>)),
    businesses: businesses.data.map((b) => toBusinessPreview(b as unknown as Record<string, unknown>)),
    events: events.data.map((e) => toEventPreview(e as unknown as Record<string, unknown>)),
    communities: (communities.data as unknown as Record<string, unknown>[])
      .filter((c) => !c['is_private'])
      .map(toCommunityPreview),
  };
}
