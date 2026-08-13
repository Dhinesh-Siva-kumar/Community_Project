import { Knex } from 'knex';

/**
 * Adds nullable country_id/state_id/city_id FKs to businesses so the
 * address hierarchy can be stored/validated by id, not just free text.
 *
 * The existing businesses.country/state/city/pincode text columns are
 * intentionally left untouched — they stay as the display/backward-compat
 * copy, mirroring the existing users/communities pattern of keeping both
 * a real FK and a denormalized text column. Existing business records are
 * unaffected; a separate backfill script (scripts/backfill-business-geo.ts)
 * best-effort populates the new columns for pre-existing rows.
 */
export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasColumn('businesses', 'country_id'))) {
    await knex.schema.alterTable('businesses', (t) => {
      t.integer('country_id').nullable()
        .references('id').inTable('master_countries').onDelete('SET NULL');
      t.index('country_id');
    });
  }
  if (!(await knex.schema.hasColumn('businesses', 'state_id'))) {
    await knex.schema.alterTable('businesses', (t) => {
      // Holds whichever division level was ultimately selected (the leaf
      // of the hierarchy) — both level-1 and level-2 divisions live in the
      // same master_states table, so one column is enough.
      t.integer('state_id').nullable()
        .references('id').inTable('master_states').onDelete('SET NULL');
      t.index('state_id');
    });
  }
  if (!(await knex.schema.hasColumn('businesses', 'city_id'))) {
    await knex.schema.alterTable('businesses', (t) => {
      t.integer('city_id').nullable()
        .references('id').inTable('master_cities').onDelete('SET NULL');
      t.index('city_id');
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn('businesses', 'city_id')) {
    await knex.schema.alterTable('businesses', (t) => t.dropColumn('city_id'));
  }
  if (await knex.schema.hasColumn('businesses', 'state_id')) {
    await knex.schema.alterTable('businesses', (t) => t.dropColumn('state_id'));
  }
  if (await knex.schema.hasColumn('businesses', 'country_id')) {
    await knex.schema.alterTable('businesses', (t) => t.dropColumn('country_id'));
  }
}
