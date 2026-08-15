import { Knex } from 'knex';

/**
 * Adds nullable state_id/city_id FKs (plus a denormalized `state` text
 * mirror) to users so Profile's Location section can use the same
 * Country -> State -> City cascading dropdowns as Business, backed by the
 * same master_states/master_cities tables.
 *
 * users.country_id already exists (added in 20240001_create_tables.ts) and
 * is already wired end-to-end via auth/users services, so it isn't touched
 * here. The existing users.country/location text columns stay as the
 * display/backward-compat copies — mirroring the exact pattern used by
 * 20240018_add_business_geo_fk_columns.ts for businesses. `location` is
 * repurposed as the city-name mirror (no new city text column needed);
 * `state` is new, mirroring business's country+state+city text/id pairing.
 */
export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasColumn('users', 'state_id'))) {
    await knex.schema.alterTable('users', (t) => {
      t.integer('state_id').nullable()
        .references('id').inTable('master_states').onDelete('SET NULL');
      t.index('state_id');
    });
  }
  if (!(await knex.schema.hasColumn('users', 'city_id'))) {
    await knex.schema.alterTable('users', (t) => {
      t.integer('city_id').nullable()
        .references('id').inTable('master_cities').onDelete('SET NULL');
      t.index('city_id');
    });
  }
  if (!(await knex.schema.hasColumn('users', 'state'))) {
    await knex.schema.alterTable('users', (t) => {
      t.string('state').nullable();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn('users', 'state')) {
    await knex.schema.alterTable('users', (t) => t.dropColumn('state'));
  }
  if (await knex.schema.hasColumn('users', 'city_id')) {
    await knex.schema.alterTable('users', (t) => t.dropColumn('city_id'));
  }
  if (await knex.schema.hasColumn('users', 'state_id')) {
    await knex.schema.alterTable('users', (t) => t.dropColumn('state_id'));
  }
}
