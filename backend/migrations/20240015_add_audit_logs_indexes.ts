import { Knex } from 'knex';

/**
 * Adds a user_agent column and query indexes to audit_logs now that it's
 * read platform-wide from the admin Audit Log page (filtering/sorting by
 * created_at, action, resource, user_id) rather than only via the small
 * per-user activity drawer.
 */
export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasColumn('audit_logs', 'user_agent'))) {
    await knex.schema.alterTable('audit_logs', (t) => {
      t.string('user_agent').nullable();
    });
  }

  await knex.schema.alterTable('audit_logs', (t) => {
    t.index('created_at', 'audit_logs_created_at_index');
    t.index('action', 'audit_logs_action_index');
    t.index('resource', 'audit_logs_resource_index');
    t.index('user_id', 'audit_logs_user_id_index');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('audit_logs', (t) => {
    t.dropIndex('created_at', 'audit_logs_created_at_index');
    t.dropIndex('action', 'audit_logs_action_index');
    t.dropIndex('resource', 'audit_logs_resource_index');
    t.dropIndex('user_id', 'audit_logs_user_id_index');
  });

  if (await knex.schema.hasColumn('audit_logs', 'user_agent')) {
    await knex.schema.alterTable('audit_logs', (t) => t.dropColumn('user_agent'));
  }
}
