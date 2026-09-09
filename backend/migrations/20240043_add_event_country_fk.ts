import { Knex } from 'knex';

/**
 * Adds a nullable country_id FK to events so the country can be matched by
 * id (needed for the visibility gate added in the next migration), mirroring
 * businesses.country_id from 20240018_add_business_geo_fk_columns.ts. Only
 * the country level is added — events have no state/city granularity.
 *
 * The existing events.country text column is left untouched — it stays as
 * the display/back-compat copy, same dual-column pattern used for
 * businesses/users/communities.
 */
export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasColumn('events', 'country_id'))) {
    await knex.schema.alterTable('events', (t) => {
      t.integer('country_id').nullable()
        .references('id').inTable('master_countries').onDelete('SET NULL');
      t.index('country_id');
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn('events', 'country_id')) {
    await knex.schema.alterTable('events', (t) => t.dropColumn('country_id'));
  }
}
