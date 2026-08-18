import { Knex } from 'knex';

/**
 * businesses.status / jobs.status already exist (added in 20240013) but have
 * never actually been read or written by the app — every row created since
 * then silently sits at the column default 'PENDING'. This migration adds
 * rejection_reason (mirrors posts.rejection_reason) and blanket-backfills any
 * still-PENDING row to APPROVED so nothing already-live disappears the
 * moment the app starts enforcing an approval-status filter on top of the
 * existing is_active filter.
 */
export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasColumn('businesses', 'rejection_reason'))) {
    await knex.schema.alterTable('businesses', (t) => {
      t.text('rejection_reason').nullable();
    });
  }
  if (!(await knex.schema.hasColumn('jobs', 'rejection_reason'))) {
    await knex.schema.alterTable('jobs', (t) => {
      t.text('rejection_reason').nullable();
    });
  }

  await knex('businesses').where({ status: 'PENDING' }).update({ status: 'APPROVED' });
  await knex('jobs').where({ status: 'PENDING' }).update({ status: 'APPROVED' });
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn('jobs', 'rejection_reason')) {
    await knex.schema.alterTable('jobs', (t) => t.dropColumn('rejection_reason'));
  }
  if (await knex.schema.hasColumn('businesses', 'rejection_reason')) {
    await knex.schema.alterTable('businesses', (t) => t.dropColumn('rejection_reason'));
  }
}
