import { Knex } from 'knex';

// `community_modes` was created (20240035) as an array of the custom enum
// type `community_mode_item`. node-postgres only has built-in wire-format
// parsers for the standard/native array OIDs (text[], int[], ...) — a
// custom enum's array OID isn't registered, so every read of this column
// came back as the raw Postgres array literal string (e.g. "{HELP,EMERGENCY}")
// instead of a parsed JS array. Anything that called .map()/.includes() on
// it as an array either threw (breaking the admin Approval page's Community
// detail popup) or silently fell back to substring matching.
//
// Fix: convert the column to plain `text[]` (same approach already used by
// `rules`/`interest_ids`, which parse correctly), keeping validation of the
// allowed values at the Zod layer instead of a DB-level enum.
export async function up(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn('communities', 'community_modes');
  if (hasColumn) {
    await knex.raw(`
      ALTER TABLE communities ALTER COLUMN community_modes DROP DEFAULT;
      ALTER TABLE communities ALTER COLUMN community_modes TYPE text[] USING community_modes::text[];
      ALTER TABLE communities ALTER COLUMN community_modes SET DEFAULT '{ENQUIRE}';
    `);
  }

  await knex.raw(`DROP TYPE IF EXISTS community_mode_item;`);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
    DO $$ BEGIN
      CREATE TYPE community_mode_item AS ENUM ('HELP', 'EMERGENCY', 'ENQUIRE');
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;
  `);

  const hasColumn = await knex.schema.hasColumn('communities', 'community_modes');
  if (hasColumn) {
    await knex.raw(`
      ALTER TABLE communities ALTER COLUMN community_modes DROP DEFAULT;
      ALTER TABLE communities ALTER COLUMN community_modes TYPE community_mode_item[] USING community_modes::text[]::community_mode_item[];
      ALTER TABLE communities ALTER COLUMN community_modes SET DEFAULT '{ENQUIRE}';
    `);
  }
}
