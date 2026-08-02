import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    DO $$ BEGIN
      CREATE TYPE community_mode AS ENUM ('HELP_EMERGENCY', 'ENQUIRE');
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;
  `);

  const hasColumn = await knex.schema.hasColumn('communities', 'community_mode');
  if (!hasColumn) {
    await knex.schema.alterTable('communities', (t) => {
      t.specificType('community_mode', 'community_mode').notNullable().defaultTo('HELP_EMERGENCY');
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn('communities', 'community_mode');
  if (hasColumn) {
    await knex.schema.alterTable('communities', (t) => {
      t.dropColumn('community_mode');
    });
  }

  await knex.raw(`DROP TYPE IF EXISTS community_mode;`);
}
