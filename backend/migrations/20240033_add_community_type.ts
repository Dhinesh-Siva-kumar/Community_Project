import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    DO $$ BEGIN
      CREATE TYPE community_type AS ENUM ('HUB', 'INDIVIDUAL');
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;
  `);

  const hasColumn = await knex.schema.hasColumn('communities', 'community_type');
  if (!hasColumn) {
    await knex.schema.alterTable('communities', (t) => {
      t.specificType('community_type', 'community_type').notNullable().defaultTo('INDIVIDUAL');
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn('communities', 'community_type');
  if (hasColumn) {
    await knex.schema.alterTable('communities', (t) => {
      t.dropColumn('community_type');
    });
  }

  await knex.raw(`DROP TYPE IF EXISTS community_type;`);
}
