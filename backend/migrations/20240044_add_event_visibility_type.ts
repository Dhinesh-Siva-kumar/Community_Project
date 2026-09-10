import { Knex } from 'knex';

/**
 * Adds a visibility scope to events, mirroring
 * 20240038_add_business_visibility_type.ts:
 *
 *  COUNTRY   — visible only to users whose own country matches the event's
 *              country (the default).
 *  WORLDWIDE — visible to every user regardless of country.
 *
 * NOT NULL DEFAULT 'COUNTRY' backfills existing rows without a table
 * rewrite on PG11+, so no separate data migration is needed.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    DO $$ BEGIN
      CREATE TYPE event_visibility AS ENUM ('COUNTRY', 'WORLDWIDE');
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;
  `);

  const hasColumn = await knex.schema.hasColumn('events', 'visibility_type');
  if (!hasColumn) {
    await knex.schema.alterTable('events', (t) => {
      t.specificType('visibility_type', 'event_visibility').notNullable().defaultTo('COUNTRY');
    });
  }

  // The listing gate always filters on visibility_type and, for the
  // COUNTRY branch, country_id — so index them together.
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS events_visibility_country_idx
      ON events (visibility_type, country_id);
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP INDEX IF EXISTS events_visibility_country_idx;`);

  const hasColumn = await knex.schema.hasColumn('events', 'visibility_type');
  if (hasColumn) {
    await knex.schema.alterTable('events', (t) => {
      t.dropColumn('visibility_type');
    });
  }

  await knex.raw(`DROP TYPE IF EXISTS event_visibility;`);
}
