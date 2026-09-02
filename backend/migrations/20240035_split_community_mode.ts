import { Knex } from 'knex';

// Splits the old single-value community_mode ('HELP_EMERGENCY' | 'ENQUIRE')
// into a multi-select community_modes array so a community can offer any
// combination of Help, Emergency and Enquire tabs instead of only the two
// fixed bundles. Every existing 'HELP_EMERGENCY' community becomes
// {HELP,EMERGENCY} (both tabs it already showed); 'ENQUIRE' becomes
// {ENQUIRE}.
export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    DO $$ BEGIN
      CREATE TYPE community_mode_item AS ENUM ('HELP', 'EMERGENCY', 'ENQUIRE');
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;
  `);

  const hasNewColumn = await knex.schema.hasColumn('communities', 'community_modes');
  if (!hasNewColumn) {
    await knex.schema.alterTable('communities', (t) => {
      t.specificType('community_modes', 'community_mode_item[]').notNullable().defaultTo('{ENQUIRE}');
    });
  }

  const hasOldColumn = await knex.schema.hasColumn('communities', 'community_mode');
  if (hasOldColumn) {
    await knex.raw(`
      UPDATE communities
      SET community_modes = CASE
        WHEN community_mode = 'ENQUIRE' THEN ARRAY['ENQUIRE']::community_mode_item[]
        ELSE ARRAY['HELP','EMERGENCY']::community_mode_item[]
      END
    `);

    await knex.schema.alterTable('communities', (t) => {
      t.dropColumn('community_mode');
    });
    await knex.raw(`DROP TYPE IF EXISTS community_mode;`);
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
    DO $$ BEGIN
      CREATE TYPE community_mode AS ENUM ('HELP_EMERGENCY', 'ENQUIRE');
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;
  `);

  const hasOldColumn = await knex.schema.hasColumn('communities', 'community_mode');
  if (!hasOldColumn) {
    await knex.schema.alterTable('communities', (t) => {
      t.specificType('community_mode', 'community_mode').notNullable().defaultTo('HELP_EMERGENCY');
    });
  }

  const hasNewColumn = await knex.schema.hasColumn('communities', 'community_modes');
  if (hasNewColumn) {
    await knex.raw(`
      UPDATE communities
      SET community_mode = CASE
        WHEN 'ENQUIRE' = ANY(community_modes) THEN 'ENQUIRE'
        ELSE 'HELP_EMERGENCY'
      END::community_mode
    `);

    await knex.schema.alterTable('communities', (t) => {
      t.dropColumn('community_modes');
    });
    await knex.raw(`DROP TYPE IF EXISTS community_mode_item;`);
  }
}
