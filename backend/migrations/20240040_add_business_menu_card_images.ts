import { Knex } from 'knex';

/**
 * Splits business imagery into three separate categories.
 *
 * The existing `businesses.images` column keeps its meaning and becomes
 * "Gallery Photos"; these two new arrays hold menu card and business card
 * images respectively. `logo` stays its own scalar column.
 *
 * Same shape as `businesses.images` (text[] NOT NULL DEFAULT '{}'), so
 * existing rows need no backfill — they simply start with empty menu and
 * card galleries.
 */
export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasColumn('businesses', 'menu_images'))) {
    await knex.schema.alterTable('businesses', (t) => {
      t.specificType('menu_images', 'text[]').notNullable().defaultTo('{}');
    });
  }
  if (!(await knex.schema.hasColumn('businesses', 'card_images'))) {
    await knex.schema.alterTable('businesses', (t) => {
      t.specificType('card_images', 'text[]').notNullable().defaultTo('{}');
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn('businesses', 'card_images')) {
    await knex.schema.alterTable('businesses', (t) => t.dropColumn('card_images'));
  }
  if (await knex.schema.hasColumn('businesses', 'menu_images')) {
    await knex.schema.alterTable('businesses', (t) => t.dropColumn('menu_images'));
  }
}
