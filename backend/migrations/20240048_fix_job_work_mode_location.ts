import { Knex } from 'knex';

/**
 * One-time data fix: `work_mode` and `is_remote` used to be independently
 * settable from the Add/Edit Job form and could drift out of sync — real
 * data on this project's own dev DB had jobs with work_mode='On-site' and
 * is_remote=true, which made their cards/detail wrongly show "Remote".
 * `jobs.service.ts` now derives is_remote from work_mode on every future
 * save (see mapNewFields()); this backfills every row already in the
 * database to match, and clears any stale physical-location details a
 * Remote job might already be carrying. `country`/`country_id` are left
 * untouched — they drive the separate applicant-country eligibility
 * restriction, which is independent of Work Mode.
 */
export async function up(knex: Knex): Promise<void> {
  await knex('jobs')
    .whereNotNull('work_mode')
    .update({ is_remote: knex.raw(`work_mode = 'Remote'`) });

  await knex('jobs')
    .where('work_mode', 'Remote')
    .update({
      city: null,
      state: null,
      state_id: null,
      city_id: null,
      full_address: null,
      pincode: null,
      location: null,
    });
}

// Not meaningfully reversible — the previous state was inconsistent data,
// not a deliberate value worth restoring.
export async function down(): Promise<void> {}
