import { Knex } from 'knex';

/**
 * Admin-configurable display order for business_categories, respected
 * wherever categories are listed or filtered (getCategories()). Every
 * existing row defaults to 0, which — combined with the name tiebreaker
 * already used everywhere categories are sorted — reproduces today's
 * alphabetical ordering exactly until an admin explicitly reorders one.
 */
export async function up(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn('business_categories', 'display_order');
  if (!hasColumn) {
    await knex.schema.alterTable('business_categories', (t) => {
      t.integer('display_order').notNullable().defaultTo(0);
    });
  }

  await knex.raw(`
    CREATE INDEX IF NOT EXISTS business_categories_display_order_idx
      ON business_categories (display_order, name);
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP INDEX IF EXISTS business_categories_display_order_idx;`);

  const hasColumn = await knex.schema.hasColumn('business_categories', 'display_order');
  if (hasColumn) {
    await knex.schema.alterTable('business_categories', (t) => {
      t.dropColumn('display_order');
    });
  }
}
