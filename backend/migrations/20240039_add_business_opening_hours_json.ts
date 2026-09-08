import { Knex } from 'knex';

/**
 * Structured opening hours for businesses.
 *
 * Until now hours lived in two free-text columns — `opening_days`
 * ("Monday,Tuesday") and `opening_hours` ("9:00 AM – 5:00 PM") — which
 * allow exactly one time range shared by every day and can only be
 * filtered by string matching. This adds a jsonb column holding a
 * per-day structure:
 *
 *   {
 *     "mode": "SAME" | "PER_DAY",
 *     "days": {
 *       "MON": { "open": "09:00", "close": "17:00", "is24h": false },
 *       "SAT": { "open": "10:00", "close": "14:00" }
 *     }
 *   }
 *
 * Keyed by day (not an array) so `jsonb_exists(days, 'TUE')` answers
 * "open on Tuesday" directly. Times are zero-padded 24h `HH:mm`, which
 * sorts lexicographically in chronological order — so range comparison
 * is plain string comparison with no casts.
 *
 * The two legacy columns are deliberately kept and are rewritten from
 * this JSON on every create/update, so list cards, the admin table and
 * any other existing consumer keep working untouched.
 *
 * scripts/backfill-business-opening-hours.ts best-effort populates this
 * column for pre-existing rows.
 */
export async function up(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn('businesses', 'opening_hours_json');
  if (!hasColumn) {
    await knex.schema.alterTable('businesses', (t) => {
      t.jsonb('opening_hours_json').nullable();
    });
  }

  // Default gin opclass, NOT jsonb_path_ops — the latter does not support
  // the `?` / jsonb_exists operator the "open on <day>" filter relies on.
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS businesses_opening_hours_json_gin
      ON businesses USING gin (opening_hours_json);
  `);

  // Encapsulates the "is this business open at <day, time>" predicate so
  // the query builder can call it as a one-liner. Doing it in SQL also
  // sidesteps the collision between knex's `?` bind placeholder and
  // Postgres's `?` jsonb operator.
  //
  // The ELSE branch handles overnight ranges (close < open, e.g. a bar
  // open 20:00–02:00), where "open" means at-or-after opening OR
  // at-or-before closing.
  await knex.raw(`
    CREATE OR REPLACE FUNCTION business_is_open_at(hours jsonb, day text, t text)
    RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
      SELECT CASE
        WHEN hours IS NULL OR NOT jsonb_exists(hours -> 'days', day) THEN false
        WHEN (hours->'days'->day->>'open') <= (hours->'days'->day->>'close')
          THEN t >= (hours->'days'->day->>'open') AND t <= (hours->'days'->day->>'close')
        ELSE   t >= (hours->'days'->day->>'open') OR  t <= (hours->'days'->day->>'close')
      END;
    $$;
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP FUNCTION IF EXISTS business_is_open_at(jsonb, text, text);`);
  await knex.raw(`DROP INDEX IF EXISTS businesses_opening_hours_json_gin;`);

  const hasColumn = await knex.schema.hasColumn('businesses', 'opening_hours_json');
  if (hasColumn) {
    await knex.schema.alterTable('businesses', (t) => {
      t.dropColumn('opening_hours_json');
    });
  }
}
