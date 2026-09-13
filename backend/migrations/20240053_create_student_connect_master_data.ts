import { Knex } from 'knex';

/**
 * Master data for the Student Connect & Mentor module's education taxonomy
 * (Country → Region/State → City → University → Course, per
 * STUDENT_CONNECT_SPEC.md §1's scalability rule). Country/Region/City are
 * already served by the existing master_countries/master_states/master_cities
 * tables (see master-data.service.ts) — only University and Course are new.
 *
 * Admin-manageable, no hard-coded country lock-in: a starter set of rows is
 * seeded separately in seeds/01_seed.ts (onConflict-ignore, same pattern as
 * every other master-data seed block), not inside this migration.
 */
export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable('master_universities'))) {
    await knex.schema.createTable('master_universities', (t) => {
      t.increments('id').primary();
      t.string('name', 200).notNullable();
      t.integer('country_id').notNullable()
        .references('id').inTable('master_countries').onDelete('CASCADE');
      t.integer('region_id').nullable()
        .references('id').inTable('master_states').onDelete('SET NULL');
      t.integer('city_id').nullable()
        .references('id').inTable('master_cities').onDelete('SET NULL');
      t.timestamps(true, true);
      t.index('country_id');
      t.unique(['name', 'country_id']);
    });
  }

  if (!(await knex.schema.hasTable('master_courses'))) {
    await knex.schema.createTable('master_courses', (t) => {
      t.increments('id').primary();
      t.string('name', 200).notNullable().unique();
      t.timestamps(true, true);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('master_courses');
  await knex.schema.dropTableIfExists('master_universities');
}
