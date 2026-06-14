import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Ensure master_countries exists — it may be missing if migration 20240001
  // was recorded as run before this table was added to it.
  if (!(await knex.schema.hasTable('master_countries'))) {
    await knex.schema.createTable('master_countries', (t) => {
      t.increments('id').primary();
      t.string('name', 100).notNullable();
      t.string('iso2', 2).notNullable().unique();
      t.string('dial_code', 10).notNullable();
      t.string('flag_emoji', 10).nullable();
    });
  }

  // Ensure interest_master exists for the same reason.
  if (!(await knex.schema.hasTable('interest_master'))) {
    await knex.schema.createTable('interest_master', (t) => {
      t.increments('interest_id').primary();
      t.string('interest_name').unique().notNullable();
      t.boolean('is_active').notNullable().defaultTo(true);
    });
  }

  await knex.schema.alterTable('communities', (t) => {
    t.integer('interest_id')
      .nullable()
      .references('interest_id')
      .inTable('interest_master')
      .onDelete('SET NULL');

    t.string('country').nullable();

    t.integer('country_id')
      .nullable()
      .references('id')
      .inTable('master_countries')
      .onDelete('SET NULL');

    t.boolean('is_private').notNullable().defaultTo(false);
    t.boolean('is_global').notNullable().defaultTo(false);
    t.boolean('is_default').notNullable().defaultTo(false);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('communities', (t) => {
    t.dropColumn('interest_id');
    t.dropColumn('country');
    t.dropColumn('country_id');
    t.dropColumn('is_private');
    t.dropColumn('is_global');
    t.dropColumn('is_default');
  });
}
