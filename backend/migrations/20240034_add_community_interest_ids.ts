import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn('communities', 'interest_ids');
  if (!hasColumn) {
    await knex.schema.alterTable('communities', (t) => {
      t.specificType('interest_ids', 'integer[]').notNullable().defaultTo('{}');
    });
  }

  // Backfill from the existing single interest_id so communities created
  // before multi-select still carry their one category forward.
  await knex.raw(`
    UPDATE communities
    SET interest_ids = ARRAY[interest_id]
    WHERE interest_id IS NOT NULL AND interest_ids = '{}'
  `);
}

export async function down(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn('communities', 'interest_ids');
  if (hasColumn) {
    await knex.schema.alterTable('communities', (t) => {
      t.dropColumn('interest_ids');
    });
  }
}
