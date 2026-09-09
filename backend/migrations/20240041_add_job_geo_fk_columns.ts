import { Knex } from 'knex';

/**
 * Adds nullable country_id/state_id/city_id FKs to jobs so the location
 * hierarchy can be stored by id, not just free text — mirrors
 * `20240018_add_business_geo_fk_columns.ts` exactly.
 *
 * The existing jobs.country/state/city/pincode text columns are left
 * untouched — they stay as the display/backward-compat copy. The Angular
 * job form already collects countryId/division1Id/division2Id/cityId (it
 * has since before this migration) but the backend previously had nowhere
 * to store them, so they were silently dropped; this is what makes them
 * actually persist, and is a prerequisite for country-based job visibility.
 *
 * No backfill script: unlike businesses' free-text country column (which
 * had a real prior value to geocode from), jobs never captured an id here
 * before, so there is nothing to backfill — existing rows simply keep
 * country_id NULL and fall back to their free-text country for visibility
 * matching (see job-visibility.service.ts).
 */
export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasColumn('jobs', 'country_id'))) {
    await knex.schema.alterTable('jobs', (t) => {
      t.integer('country_id').nullable()
        .references('id').inTable('master_countries').onDelete('SET NULL');
      t.index('country_id');
    });
  }
  if (!(await knex.schema.hasColumn('jobs', 'state_id'))) {
    await knex.schema.alterTable('jobs', (t) => {
      // Holds whichever division level was ultimately selected (the leaf
      // of the hierarchy) — both level-1 and level-2 divisions live in the
      // same master_states table, so one column is enough.
      t.integer('state_id').nullable()
        .references('id').inTable('master_states').onDelete('SET NULL');
      t.index('state_id');
    });
  }
  if (!(await knex.schema.hasColumn('jobs', 'city_id'))) {
    await knex.schema.alterTable('jobs', (t) => {
      t.integer('city_id').nullable()
        .references('id').inTable('master_cities').onDelete('SET NULL');
      t.index('city_id');
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn('jobs', 'city_id')) {
    await knex.schema.alterTable('jobs', (t) => t.dropColumn('city_id'));
  }
  if (await knex.schema.hasColumn('jobs', 'state_id')) {
    await knex.schema.alterTable('jobs', (t) => t.dropColumn('state_id'));
  }
  if (await knex.schema.hasColumn('jobs', 'country_id')) {
    await knex.schema.alterTable('jobs', (t) => t.dropColumn('country_id'));
  }
}
