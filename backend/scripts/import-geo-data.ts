import 'dotenv/config';
import zlib from 'zlib';
import db from '../src/config/db';

/**
 * One-off/re-runnable bulk import of worldwide country/state/city data from
 * the dr5hn/countries-states-cities-database dataset (ODbL v1.0 — free for
 * commercial use, attribution required: https://github.com/dr5hn/countries-states-cities-database).
 *
 * Run with: npm run import:geo-data
 *
 * Idempotent — safe to re-run at any time:
 *  - Countries are matched by their existing unique `iso2` and only ever
 *    UPDATEd (never inserted) — master_countries stays fully owned by
 *    seeds/01_seed.ts.
 *  - States/divisions and cities are upserted via `onConflict('source_id').merge()`,
 *    where `source_id` is the dataset's own row id (never our PK, never
 *    exposed to the app — see migration 20240017_extend_geo_master_tables.ts).
 */

const COUNTRIES_URL = 'https://raw.githubusercontent.com/dr5hn/countries-states-cities-database/master/csv/countries.csv';
const STATES_URL = 'https://raw.githubusercontent.com/dr5hn/countries-states-cities-database/master/csv/states.csv';
const CITIES_GZ_URL = 'https://github.com/dr5hn/countries-states-cities-database/releases/download/v3.2-export.7/csv-cities.csv.gz';

const STATE_CHUNK_SIZE = 500;
const CITY_CHUNK_SIZE = 1000;

// ── Minimal quoted-CSV parser (handles quoted fields, embedded commas, "" escapes) ──

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n') {
      if (text[i - 1] !== '\r' || field.length > 0 || row.length > 0) {
        row.push(field);
        rows.push(row);
      }
      row = [];
      field = '';
    } else if (ch === '\r') {
      // skip — handled by the following \n
    } else {
      field += ch;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function rowsToObjects(rows: string[][]): Record<string, string>[] {
  const header = rows[0] ?? [];
  return rows.slice(1)
    .filter(r => r.length > 1 || (r.length === 1 && r[0] !== ''))
    .map(r => {
      const obj: Record<string, string> = {};
      header.forEach((h, i) => { obj[h] = r[i] ?? ''; });
      return obj;
    });
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: HTTP ${res.status}`);
  return res.text();
}

async function fetchGunzipText(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  return zlib.gunzipSync(buf).toString('utf8');
}

const num = (v: string | undefined): number | null => (v && v.trim() !== '' ? Number(v) : null);
const str = (v: string | undefined): string | null => (v && v.trim() !== '' ? v : null);

// ── Stage 1: countries ──────────────────────────────────────────

async function importCountries(): Promise<Map<string, number>> {
  console.log('Importing countries...');
  const rows = rowsToObjects(parseCsv(await fetchText(COUNTRIES_URL)));

  let iso2Map = new Map<string, number>();
  const refreshMap = async () => {
    const existing: Array<{ id: number; iso2: string }> = await db('master_countries').select('id', 'iso2');
    iso2Map = new Map(existing.map(c => [c.iso2.toUpperCase(), c.id]));
  };
  await refreshMap();

  // Insert any of the dataset's 250 countries missing from our own seeded
  // list — seeds/01_seed.ts only ever curated ~131, which isn't "worldwide."
  // Existing rows' name/iso2/dial_code/flag_emoji are left untouched
  // (onConflict('iso2').ignore()) so this never overwrites curated seed data.
  const missingRows = rows.filter(row => !iso2Map.has((row['iso2'] || '').toUpperCase()));
  if (missingRows.length > 0) {
    const insertRows = missingRows
      .filter(row => str(row['iso2']) && str(row['name']))
      .map(row => ({
        name: row['name'],
        iso2: row['iso2'].toUpperCase(),
        dial_code: row['phonecode'] ? `+${row['phonecode'].replace(/^\+/, '')}` : '+0',
        flag_emoji: str(row['emoji']),
      }));
    if (insertRows.length > 0) {
      await db('master_countries').insert(insertRows).onConflict('iso2').ignore();
    }
    await refreshMap();
  }
  console.log(`Countries: ${missingRows.length} newly inserted, ${iso2Map.size} total now available.`);

  let updated = 0;
  let skipped = 0;
  for (const row of rows) {
    const iso2 = (row['iso2'] || '').toUpperCase();
    const ourId = iso2Map.get(iso2);
    if (!ourId) { skipped++; continue; }
    await db('master_countries').where({ id: ourId }).update({
      iso3: str(row['iso3']),
      capital: str(row['capital']),
      region: str(row['region']),
      subregion: str(row['subregion']),
      postal_code_format: str(row['postal_code_format']),
      postal_code_regex: str(row['postal_code_regex']),
      latitude: num(row['latitude']),
      longitude: num(row['longitude']),
    });
    updated++;
  }
  console.log(`Countries: metadata updated for ${updated}, skipped ${skipped} (no iso2 match in source).`);
  return iso2Map;
}

// ── Stage 2: states / administrative divisions ──────────────────

async function importStates(iso2Map: Map<string, number>): Promise<void> {
  console.log('Importing states/administrative divisions...');
  const rows = rowsToObjects(parseCsv(await fetchText(STATES_URL)));

  const batch: Record<string, unknown>[] = [];
  let skipped = 0;
  for (const row of rows) {
    const countryId = iso2Map.get((row['country_code'] || '').toUpperCase());
    if (!countryId) { skipped++; continue; }
    batch.push({
      source_id: num(row['id']),
      source_parent_id: num(row['parent_id']),
      country_id: countryId,
      name: row['name'],
      iso2: str(row['iso2']),
      type: str(row['type']),
      level: num(row['level']),
      latitude: num(row['latitude']),
      longitude: num(row['longitude']),
    });
  }

  let upserted = 0;
  for (let i = 0; i < batch.length; i += STATE_CHUNK_SIZE) {
    const chunk = batch.slice(i, i + STATE_CHUNK_SIZE);
    await db('master_states').insert(chunk).onConflict('source_id').merge();
    upserted += chunk.length;
  }
  console.log(`States/divisions: upserted ${upserted}, skipped ${skipped} (country not in our seeded list).`);

  console.log('Resolving nested division parent links...');
  const result = await db.raw(`
    UPDATE master_states s
    SET parent_id = p.id
    FROM master_states p
    WHERE s.source_parent_id = p.source_id
      AND s.source_parent_id IS NOT NULL
  `);
  console.log(`Parent links resolved for ${result.rowCount ?? 0} rows.`);
}

// ── Stage 3: cities ──────────────────────────────────────────────

async function importCities(iso2Map: Map<string, number>): Promise<void> {
  console.log('Downloading cities dataset (~4.8MB compressed)...');
  const text = await fetchGunzipText(CITIES_GZ_URL);
  const rows = rowsToObjects(parseCsv(text));
  console.log(`Parsed ${rows.length} city rows.`);

  const stateRows: Array<{ id: number; source_id: number | null }> =
    await db('master_states').select('id', 'source_id').whereNotNull('source_id');
  const stateSourceMap = new Map<number, number>();
  stateRows.forEach(s => { if (s.source_id != null) stateSourceMap.set(s.source_id, s.id); });

  const batch: Record<string, unknown>[] = [];
  let skippedNoCountry = 0;
  for (const row of rows) {
    const countryId = iso2Map.get((row['country_code'] || '').toUpperCase());
    if (!countryId) { skippedNoCountry++; continue; }
    const sourceStateId = num(row['state_id']);
    const stateId = sourceStateId != null ? (stateSourceMap.get(sourceStateId) ?? null) : null;
    batch.push({
      source_id: num(row['id']),
      country_id: countryId,
      state_id: stateId,
      name: row['name'],
      type: str(row['type']),
      latitude: num(row['latitude']),
      longitude: num(row['longitude']),
    });
  }

  let upserted = 0;
  for (let i = 0; i < batch.length; i += CITY_CHUNK_SIZE) {
    const chunk = batch.slice(i, i + CITY_CHUNK_SIZE);
    await db('master_cities').insert(chunk).onConflict('source_id').merge();
    upserted += chunk.length;
    process.stdout.write(`\r  cities upserted: ${upserted}/${batch.length}`);
  }
  console.log(`\nCities: upserted ${upserted}, skipped ${skippedNoCountry} (country not in our seeded list).`);
}

// ── Entry point ────────────────────────────────────────────────

/**
 * Removes the old hand-seeded ~55 states/~60 cities from migration
 * 20240005 (they have no source_id, since they predate this import).
 * Safe: nothing has ever referenced those specific row ids by FK — the
 * business/job forms only ever stored free-text state/city names, and the
 * new businesses.state_id/city_id columns are still all NULL pre-backfill.
 * Deleting the old master_states rows cascades to their master_cities rows
 * via the existing state_id FK's ON DELETE CASCADE.
 */
async function clearLegacyHandSeededRows(): Promise<void> {
  const { rowCount: statesRemoved } = await db.raw(
    `DELETE FROM master_states WHERE source_id IS NULL`
  );
  console.log(`Removed ${statesRemoved ?? 0} legacy hand-seeded states (and their cities, via cascade).`);
}

async function main(): Promise<void> {
  const start = Date.now();
  await clearLegacyHandSeededRows();
  const iso2Map = await importCountries();
  await importStates(iso2Map);
  await importCities(iso2Map);
  const elapsedSec = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`\nGeo data import complete in ${elapsedSec}s.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Geo data import failed:', err);
    process.exit(1);
  });
