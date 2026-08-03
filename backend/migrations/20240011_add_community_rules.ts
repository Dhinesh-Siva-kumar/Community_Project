import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn('communities', 'rules');
  if (!hasColumn) {
    await knex.schema.alterTable('communities', (t) => {
      t.specificType('rules', 'text[]').notNullable().defaultTo('{}');
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn('communities', 'rules');
  if (hasColumn) {
    await knex.schema.alterTable('communities', (t) => {
      t.dropColumn('rules');
    });
  }
}
