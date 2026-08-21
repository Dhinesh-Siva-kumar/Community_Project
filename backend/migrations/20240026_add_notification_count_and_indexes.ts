import { Knex } from 'knex';

/**
 * Adds a `count` column to `notifications` (used to aggregate repeat
 * same-type/same-entity events — e.g. "Raj and 1 other liked your post" —
 * instead of inserting a new row per event), plus indexes for the standard
 * unread/list queries and the aggregation lookup.
 */
export async function up(knex: Knex): Promise<void> {
  const hasCount = await knex.schema.hasColumn('notifications', 'count');
  if (!hasCount) {
    await knex.schema.alterTable('notifications', (t) => {
      t.integer('count').notNullable().defaultTo(1);
    });
  }

  await knex.schema.alterTable('notifications', (t) => {
    t.index(['user_id', 'is_read'], 'notifications_user_id_is_read_idx');
    t.index(['user_id', 'type', 'related_entity_id'], 'notifications_aggregate_lookup_idx');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('notifications', (t) => {
    t.dropIndex(['user_id', 'is_read'], 'notifications_user_id_is_read_idx');
    t.dropIndex(['user_id', 'type', 'related_entity_id'], 'notifications_aggregate_lookup_idx');
  });

  const hasCount = await knex.schema.hasColumn('notifications', 'count');
  if (hasCount) {
    await knex.schema.alterTable('notifications', (t) => {
      t.dropColumn('count');
    });
  }
}
