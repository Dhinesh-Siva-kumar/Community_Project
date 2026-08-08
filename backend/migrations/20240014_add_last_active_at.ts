import { Knex } from 'knex';

/**
 * Adds users.last_active_at so the admin analytics dashboard can compute
 * Active Users (today/week/month) and Retention Rate. Populated by the
 * `authenticate` middleware (throttled touch on each request) and on login.
 */
export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasColumn('users', 'last_active_at'))) {
    await knex.schema.alterTable('users', (t) => {
      t.timestamp('last_active_at').nullable();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn('users', 'last_active_at')) {
    await knex.schema.alterTable('users', (t) => t.dropColumn('last_active_at'));
  }
}
