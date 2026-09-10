import { Knex } from 'knex';

/**
 * Two attributes relevant to the Tamil diaspora job audience, kept
 * separate from Employment Type (jobType) rather than folded into it:
 *
 *  - visa_sponsorship: 'Available' | 'Not Available' | 'Not Specified'
 *    Plain string column, matching the existing convention for every
 *    other enum-like job field (work_mode, salary_type, shift_type —
 *    see 20240004_add_job_fields.ts) rather than a native Postgres enum.
 *  - referral_available: boolean Yes/No — whether the poster is offering
 *    (or open to) a referral, mirroring the existing salary_hidden /
 *    is_remote boolean columns.
 *
 * Both default to the "unspecified" state so every existing job stays
 * valid without a backfill: visa sponsorship reads as genuinely unknown
 * rather than a false "Not Available", and referral defaults to No.
 */
export async function up(knex: Knex): Promise<void> {
  const hasVisa = await knex.schema.hasColumn('jobs', 'visa_sponsorship');
  const hasReferral = await knex.schema.hasColumn('jobs', 'referral_available');
  if (!hasVisa || !hasReferral) {
    await knex.schema.alterTable('jobs', (t) => {
      if (!hasVisa) t.string('visa_sponsorship').notNullable().defaultTo('Not Specified');
      if (!hasReferral) t.boolean('referral_available').notNullable().defaultTo(false);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('jobs', (t) => {
    t.dropColumn('visa_sponsorship');
    t.dropColumn('referral_available');
  });
}
