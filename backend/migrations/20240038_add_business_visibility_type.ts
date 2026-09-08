import { Knex } from 'knex';

/**
 * Adds a visibility scope to businesses.
 *
 *  COUNTRY   — visible only to users whose own country matches the
 *              business's country (the default, and what the listing
 *              effectively did already by defaulting its country filter
 *              to the signed-in user's country).
 *  WORLDWIDE — visible to every user regardless of country.
 *
 * NOT NULL DEFAULT 'COUNTRY' backfills existing rows without a table
 * rewrite on PG11+, so no separate data migration is needed.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    DO $$ BEGIN
      CREATE TYPE business_visibility AS ENUM ('COUNTRY', 'WORLDWIDE');
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;
  `);

  const hasColumn = await knex.schema.hasColumn('businesses', 'visibility_type');
  if (!hasColumn) {
    await knex.schema.alterTable('businesses', (t) => {
      t.specificType('visibility_type', 'business_visibility').notNullable().defaultTo('COUNTRY');
    });
  }

  // The listing gate always filters on visibility_type and, for the
  // COUNTRY branch, country_id — so index them together.
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS businesses_visibility_country_idx
      ON businesses (visibility_type, country_id);
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP INDEX IF EXISTS businesses_visibility_country_idx;`);

  const hasColumn = await knex.schema.hasColumn('businesses', 'visibility_type');
  if (hasColumn) {
    await knex.schema.alterTable('businesses', (t) => {
      t.dropColumn('visibility_type');
    });
  }

  await knex.raw(`DROP TYPE IF EXISTS business_visibility;`);
}
