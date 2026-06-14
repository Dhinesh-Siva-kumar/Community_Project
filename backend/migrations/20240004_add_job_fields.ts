import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('jobs', (t) => {
    // ── Company ──────────────────────────────────────────────────
    t.string('company_name').nullable();
    t.string('company_logo').nullable();          // single URL
    t.string('company_website').nullable();

    // ── Structured Location (keep existing location/country/pincode) ──
    t.string('city').nullable();
    t.string('state').nullable();
    t.text('full_address').nullable();
    t.boolean('is_remote').notNullable().defaultTo(false);
    t.string('work_mode').nullable();             // 'Remote'|'Hybrid'|'On-site'

    // ── Role details ─────────────────────────────────────────────
    t.integer('exp_min').nullable();
    t.integer('exp_max').nullable();
    t.string('education').nullable();
    t.integer('openings').nullable();
    t.string('shift_type').nullable();            // 'Day'|'Night'|'Rotational'|'Flexible'

    // ── Structured Salary (keep existing salary string) ───────────
    t.integer('salary_min').nullable();
    t.integer('salary_max').nullable();
    t.string('salary_type').nullable();           // 'Fixed'|'Hourly'|'Monthly'|'Annual'
    t.string('salary_currency').nullable();       // 'INR'|'GBP'|'USD'|'EUR'|'AED'
    t.boolean('salary_hidden').notNullable().defaultTo(false);

    // ── Schedule ─────────────────────────────────────────────────
    t.string('work_start_time').nullable();
    t.string('work_end_time').nullable();
    t.specificType('working_days', 'text[]').notNullable().defaultTo('{}');

    // ── Structured Contact (keep existing contact_info) ────────────
    t.string('contact_person').nullable();
    t.string('contact_email').nullable();
    t.string('contact_phone').nullable();
    t.string('application_url').nullable();

    // ── Skills & Structured Content ───────────────────────────────
    t.specificType('skills', 'text[]').notNullable().defaultTo('{}');
    t.text('responsibilities').nullable();
    t.text('qualifications').nullable();
    t.text('requirements').nullable();
    t.text('benefits').nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('jobs', (t) => {
    t.dropColumn('company_name');
    t.dropColumn('company_logo');
    t.dropColumn('company_website');
    t.dropColumn('city');
    t.dropColumn('state');
    t.dropColumn('full_address');
    t.dropColumn('is_remote');
    t.dropColumn('work_mode');
    t.dropColumn('exp_min');
    t.dropColumn('exp_max');
    t.dropColumn('education');
    t.dropColumn('openings');
    t.dropColumn('shift_type');
    t.dropColumn('salary_min');
    t.dropColumn('salary_max');
    t.dropColumn('salary_type');
    t.dropColumn('salary_currency');
    t.dropColumn('salary_hidden');
    t.dropColumn('work_start_time');
    t.dropColumn('work_end_time');
    t.dropColumn('working_days');
    t.dropColumn('contact_person');
    t.dropColumn('contact_email');
    t.dropColumn('contact_phone');
    t.dropColumn('application_url');
    t.dropColumn('skills');
    t.dropColumn('responsibilities');
    t.dropColumn('qualifications');
    t.dropColumn('requirements');
    t.dropColumn('benefits');
  });
}
