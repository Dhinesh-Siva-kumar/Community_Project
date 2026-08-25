import { Knex } from 'knex';

/**
 * Adds a `params` JSONB column to `notifications`.
 *
 * `message` holds a fully-composed English sentence, which makes it
 * untranslatable after the fact. Storing the interpolation values separately
 * lets the client render `notification.<TYPE>` from its own catalog in the
 * reader's language instead.
 *
 * Nullable on purpose: rows written before this migration have no params, and
 * the client falls back to their stored `message`. No backfill is possible —
 * the original values were never kept.
 */
export async function up(knex: Knex): Promise<void> {
  const hasParams = await knex.schema.hasColumn('notifications', 'params');
  if (!hasParams) {
    await knex.schema.alterTable('notifications', (t) => {
      t.jsonb('params').nullable();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasParams = await knex.schema.hasColumn('notifications', 'params');
  if (hasParams) {
    await knex.schema.alterTable('notifications', (t) => {
      t.dropColumn('params');
    });
  }
}
