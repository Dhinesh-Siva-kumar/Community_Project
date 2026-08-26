import db from '../../config/db';
import { AppError } from '../../middleware/errorHandler';
import { CitiesQueryDtoType } from './geography.dto';

// ── Types ───────────────────────────────────────────────────────

export interface GeoCountry {
  id: number;
  name: string;
  iso2: string;
  dialCode: string;
  flagEmoji: string | null;
  postalCodeFormat: string | null;
  postalCodeRegex: string | null;
}

export interface AdministrativeLevelConfig {
  level: number;
  label: string;
}

export interface CountryAddressConfig {
  countryId: number;
  name: string;
  iso2: string;
  postalCode: { format: string | null; regex: string | null; required: boolean };
  divisionLevels: AdministrativeLevelConfig[];
}

/** A row from master_states — the generic, self-referential administrative
 * division table (state/province/district/county/emirate/etc., any depth). */
export interface Division {
  id: number;
  name: string;
  type: string | null;
  level: number;
  parentId: number | null;
  countryId: number;
}

export interface GeoCity {
  id: number;
  name: string;
  stateId: number | null;
  countryId: number;
  latitude: number | null;
  longitude: number | null;
}

interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

function titleCase(s: string): string {
  return s.replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}

// ── Countries ───────────────────────────────────────────────────

export async function getCountries(): Promise<GeoCountry[]> {
  const rows = await db('master_countries')
    .orderBy('name', 'asc')
    .select('id', 'name', 'iso2', 'dial_code', 'flag_emoji', 'postal_code_format', 'postal_code_regex');

  return (rows as Array<Record<string, unknown>>).map((r) => ({
    id: r['id'] as number,
    name: r['name'] as string,
    iso2: r['iso2'] as string,
    dialCode: r['dial_code'] as string,
    flagEmoji: (r['flag_emoji'] as string | null) ?? null,
    postalCodeFormat: (r['postal_code_format'] as string | null) ?? null,
    postalCodeRegex: (r['postal_code_regex'] as string | null) ?? null,
  }));
}

/**
 * One-call answer to "how many division dropdowns does this country need,
 * what should they be labeled, and is a postal code required" — computed
 * from the actual imported hierarchy rather than a hardcoded per-country
 * switch. Division depth is capped at 2 (state/province, then
 * district/county-equivalent) — the deepest the source dataset actually
 * goes; the underlying master_states table itself supports arbitrary depth
 * via parent_id if that's ever needed later.
 */
export async function getCountryConfig(countryId: number): Promise<CountryAddressConfig> {
  const country = await db('master_countries').where({ id: countryId }).first();
  if (!country) throw new AppError(404, 'Country not found', 'COUNTRY_FOUND');

  const rows: Array<{ level: number; type: string | null }> = await db('master_states')
    .where({ country_id: countryId })
    .select(db.raw('CASE WHEN parent_id IS NULL THEN 1 ELSE 2 END AS level'), 'type');

  const divisionLevels: AdministrativeLevelConfig[] = [];
  for (const levelNum of [1, 2]) {
    const atLevel = rows.filter((r) => Number(r.level) === levelNum);
    if (atLevel.length === 0) continue;

    // Label the dropdown with whichever division `type` is most common at
    // this level for this country (e.g. "province" for USA's states,
    // "district" for a country whose level-2 rows are mostly districts).
    const typeCounts = new Map<string, number>();
    for (const r of atLevel) {
      if (!r.type) continue;
      typeCounts.set(r.type, (typeCounts.get(r.type) ?? 0) + 1);
    }
    let bestType: string | null = null;
    let bestCount = 0;
    for (const [type, count] of typeCounts) {
      if (count > bestCount) { bestType = type; bestCount = count; }
    }
    const fallbackLabel = levelNum === 1 ? 'State / Region' : 'District';
    divisionLevels.push({ level: levelNum, label: bestType ? titleCase(bestType) : fallbackLabel });
  }

  return {
    countryId: country['id'],
    name: country['name'],
    iso2: country['iso2'],
    postalCode: {
      format: country['postal_code_format'] ?? null,
      regex: country['postal_code_regex'] ?? null,
      required: !!country['postal_code_regex'],
    },
    divisionLevels,
  };
}

// ── Divisions ───────────────────────────────────────────────────

/**
 * Top-level divisions for a country (no parentId), or the children of a
 * given division (parentId) — validated to belong to the same country.
 */
export async function getDivisions(countryId: number, parentId?: number): Promise<Division[]> {
  const country = await db('master_countries').where({ id: countryId }).first('id');
  if (!country) throw new AppError(404, 'Country not found', 'COUNTRY_FOUND');

  let query = db('master_states').where({ country_id: countryId });
  if (parentId) {
    const parent = await db('master_states').where({ id: parentId, country_id: countryId }).first('id');
    if (!parent) throw new AppError(400, 'Parent division does not belong to the selected country', 'INVALID_PARENT_DIVISION');
    query = query.andWhere({ parent_id: parentId });
  } else {
    query = query.whereNull('parent_id');
  }

  const rows = await query.orderBy('name', 'asc').select('id', 'name', 'type', 'parent_id', 'country_id');
  return (rows as Array<Record<string, unknown>>).map((r) => ({
    id: r['id'] as number,
    name: r['name'] as string,
    type: (r['type'] as string | null) ?? null,
    level: r['parent_id'] ? 2 : 1,
    parentId: (r['parent_id'] as number | null) ?? null,
    countryId: r['country_id'] as number,
  }));
}

/** Walks a division's self-referential parent chain, top-level → leaf (max depth 2). */
export async function getDivisionChain(divisionId: number): Promise<Division[]> {
  const chain: Division[] = [];
  let currentId: number | null = divisionId;
  // Bounded loop — the real dataset never nests more than 2 levels deep.
  for (let i = 0; i < 5 && currentId != null; i++) {
    const rowResult = await db('master_states')
      .where({ id: currentId })
      .first('id', 'name', 'type', 'parent_id', 'country_id');
    const row = rowResult as Record<string, unknown> | undefined;
    if (!row) break;
    const nextParentId: number | null = row['parent_id'] == null ? null : (row['parent_id'] as number);
    chain.unshift({
      id: row['id'] as number,
      name: row['name'] as string,
      type: row['type'] == null ? null : (row['type'] as string),
      level: nextParentId == null ? 1 : 2,
      parentId: nextParentId,
      countryId: row['country_id'] as number,
    });
    currentId = nextParentId;
  }
  return chain;
}

// ── Cities ──────────────────────────────────────────────────────

/** Searchable, paginated, always scoped by division or country — never the full worldwide list. */
export async function searchCities(params: CitiesQueryDtoType): Promise<PaginatedResult<GeoCity>> {
  const { divisionId, countryId, search, page, limit } = params;
  if (!divisionId && !countryId) throw new AppError(400, 'divisionId or countryId is required', 'DIVISIONID_COUNTRYID_REQUIRED');

  const offset = (page - 1) * limit;
  const baseQuery = () => {
    let q = db('master_cities');
    if (divisionId) q = q.where({ state_id: divisionId });
    else if (countryId) q = q.where({ country_id: countryId });
    if (search) q = q.andWhereILike('name', `%${search}%`);
    return q;
  };

  const [rows, [{ total }]] = await Promise.all([
    baseQuery().orderBy('name', 'asc').limit(limit).offset(offset)
      .select('id', 'name', 'state_id', 'country_id', 'latitude', 'longitude'),
    baseQuery().count({ total: '*' }),
  ]);

  return {
    data: (rows as Array<Record<string, unknown>>).map((r) => ({
      id: r['id'] as number,
      name: r['name'] as string,
      stateId: (r['state_id'] as number | null) ?? null,
      countryId: r['country_id'] as number,
      latitude: (r['latitude'] as number | null) ?? null,
      longitude: (r['longitude'] as number | null) ?? null,
    })),
    total: Number(total),
    page,
    limit,
    totalPages: Math.ceil(Number(total) / limit),
  };
}

// ── Address hierarchy validation (used by the business module) ──

/**
 * Server-side guard against invalid id combinations arriving through the
 * API directly (bypassing the Angular cascade): confirms a city really
 * belongs to the given state/country, and — where the selected country has
 * a known postal format — that the pincode matches it.
 */
export async function validateAddressHierarchy(params: {
  countryId?: number | null;
  stateId?: number | null;
  cityId?: number | null;
  pincode?: string | null;
}): Promise<void> {
  const { countryId, stateId, cityId, pincode } = params;

  if (stateId && countryId) {
    const state = await db('master_states').where({ id: stateId, country_id: countryId }).first('id');
    if (!state) throw new AppError(400, 'Selected state/division does not belong to the selected country', 'INVALID_STATE_HIERARCHY');
  }

  if (cityId) {
    let q = db('master_cities').where({ id: cityId });
    if (countryId) q = q.andWhere({ country_id: countryId });
    if (stateId) q = q.andWhere({ state_id: stateId });
    const city = await q.first('id');
    if (!city) throw new AppError(400, 'Selected city does not belong to the selected country/state', 'INVALID_CITY_HIERARCHY');
  }

  if (countryId && pincode) {
    const country = await db('master_countries').where({ id: countryId }).first('postal_code_regex');
    const regex = country?.['postal_code_regex'] as string | undefined;
    if (regex) {
      let valid: boolean;
      try {
        valid = new RegExp(regex).test(pincode);
      } catch {
        // A malformed regex string is our data problem, not the caller's —
        // never hard-fail the request over it.
        valid = true;
      }
      if (!valid) throw new AppError(400, 'Postal code format is invalid for the selected country', 'INVALID_PINCODE');
    }
  }
}
