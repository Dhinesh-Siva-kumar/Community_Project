import { Knex } from 'knex';

/**
 * Optional application deadline / closing date. Nullable so every existing
 * job (which never had this concept) stays exactly as valid and available
 * as it already was — the "closing soon"/"expired" status the API computes
 * (see shapeJob() in jobs.service.ts) only ever applies once a deadline is
 * actually set. Stored as a plain timestamp, same convention as every other
 * date column in this project (created_at, updated_at, event_date, ...) —
 * UTC in the database, formatted to the viewer's local time on the client.
 */
export async function up(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn('jobs', 'application_deadline');
  if (!hasColumn) {
    await knex.schema.alterTable('jobs', (t) => {
      t.timestamp('application_deadline').nullable();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('jobs', (t) => {
    t.dropColumn('application_deadline');
  });
}
