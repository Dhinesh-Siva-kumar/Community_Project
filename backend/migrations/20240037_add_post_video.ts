import { Knex } from 'knex';

/**
 * Adds posts.video so a community post can carry a single uploaded clip.
 *
 * Nullable text rather than an array: a post holds at most one video, and it
 * is mutually exclusive with `images` (enforced in the DTO/controller, since
 * a CHECK constraint here would block the transitional states an edit goes
 * through). Stores the same `/uploads/...` path shape as `images`.
 */
export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasColumn('posts', 'video'))) {
    await knex.schema.alterTable('posts', (t) => {
      t.text('video').nullable();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn('posts', 'video')) {
    await knex.schema.alterTable('posts', (t) => t.dropColumn('video'));
  }
}
