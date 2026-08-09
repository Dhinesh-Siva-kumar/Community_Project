import { Knex } from 'knex';

/**
 * Adds posts.rejection_reason so admins can tell a post's author why it was
 * rejected, surfaced on the user-facing "My Posts" list.
 */
export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasColumn('posts', 'rejection_reason'))) {
    await knex.schema.alterTable('posts', (t) => {
      t.text('rejection_reason').nullable();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn('posts', 'rejection_reason')) {
    await knex.schema.alterTable('posts', (t) => t.dropColumn('rejection_reason'));
  }
}
