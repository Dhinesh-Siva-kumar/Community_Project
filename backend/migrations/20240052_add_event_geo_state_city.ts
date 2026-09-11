import { Knex } from 'knex';

/**
 * Adds nullable state_id/city_id FKs to events, completing the location
 * hierarchy alongside the country_id already added by
 * 20240043_add_event_country_fk.ts — mirrors
 * 20240041_add_job_geo_fk_columns.ts exactly (same table shapes:
 * master_states/master_cities, same "leaf division id in one state_id
 * column" reasoning as jobs).
 *
 * The existing events.address/pincode/location/country text columns are
 * left untouched — they stay as the display/back-compat copy, same
 * dual-column pattern used for jobs/businesses. No backfill: events never
 * captured a state/city id before, so there is nothing to backfill —
 * existing rows simply keep state_id/city_id NULL and keep displaying their
 * existing free-text address/location exactly as before.
 */
export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasColumn('events', 'state_id'))) {
    await knex.schema.alterTable('events', (t) => {
      t.integer('state_id').nullable()
        .references('id').inTable('master_states').onDelete('SET NULL');
      t.index('state_id');
    });
  }
  if (!(await knex.schema.hasColumn('events', 'city_id'))) {
    await knex.schema.alterTable('events', (t) => {
      t.integer('city_id').nullable()
        .references('id').inTable('master_cities').onDelete('SET NULL');
      t.index('city_id');
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn('events', 'city_id')) {
    await knex.schema.alterTable('events', (t) => t.dropColumn('city_id'));
  }
  if (await knex.schema.hasColumn('events', 'state_id')) {
    await knex.schema.alterTable('events', (t) => t.dropColumn('state_id'));
  }
}
