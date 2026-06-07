import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
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
