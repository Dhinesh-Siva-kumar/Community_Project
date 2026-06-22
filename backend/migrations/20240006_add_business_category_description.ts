import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('business_categories', (t) => {
    t.text('description').nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('business_categories', (t) => {
    t.dropColumn('description');
  });
}
