import { Knex } from 'knex';

/**
 * Adds moderation/verification status tracking so the admin dashboard can
 * surface real pending counts:
 *   - users.verification_status  (Pending User Verification)
 *   - businesses.status          (Pending Business Verification)
 *   - jobs.status                (Pending Job Approval)
 *   - reports table              (Reports to Review)
 *
 * Existing rows are backfilled to the "already cleared" state so this
 * migration doesn't retroactively flag pre-existing data as pending; only
 * new rows created after this migration start out PENDING.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    DO $$ BEGIN
      CREATE TYPE user_verification_status AS ENUM ('PENDING', 'VERIFIED', 'REJECTED');
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;
  `);
  await knex.raw(`
    DO $$ BEGIN
      CREATE TYPE business_status AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;
  `);
  await knex.raw(`
    DO $$ BEGIN
      CREATE TYPE job_status AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;
  `);
  await knex.raw(`
    DO $$ BEGIN
      CREATE TYPE report_target_type AS ENUM ('POST');
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;
  `);
  await knex.raw(`
    DO $$ BEGIN
      CREATE TYPE report_status AS ENUM ('PENDING', 'REVIEWED', 'DISMISSED');
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;
  `);

  if (!(await knex.schema.hasColumn('users', 'verification_status'))) {
    await knex.schema.alterTable('users', (t) => {
      t.specificType('verification_status', 'user_verification_status')
        .notNullable()
        .defaultTo('PENDING');
    });
    await knex('users').update({ verification_status: 'VERIFIED' });
  }

  if (!(await knex.schema.hasColumn('businesses', 'status'))) {
    await knex.schema.alterTable('businesses', (t) => {
      t.specificType('status', 'business_status').notNullable().defaultTo('PENDING');
    });
    await knex('businesses').update({ status: 'APPROVED' });
  }

  if (!(await knex.schema.hasColumn('jobs', 'status'))) {
    await knex.schema.alterTable('jobs', (t) => {
      t.specificType('status', 'job_status').notNullable().defaultTo('PENDING');
    });
    await knex('jobs').update({ status: 'APPROVED' });
  }

  if (!(await knex.schema.hasTable('reports'))) {
    await knex.schema.createTable('reports', (t) => {
      t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      t.uuid('reporter_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
      t.specificType('target_type', 'report_target_type').notNullable().defaultTo('POST');
      t.uuid('target_id').notNullable();
      t.text('reason').nullable();
      t.specificType('status', 'report_status').notNullable().defaultTo('PENDING');
      t.timestamp('created_at').defaultTo(knex.fn.now());
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('reports');

  if (await knex.schema.hasColumn('jobs', 'status')) {
    await knex.schema.alterTable('jobs', (t) => t.dropColumn('status'));
  }
  if (await knex.schema.hasColumn('businesses', 'status')) {
    await knex.schema.alterTable('businesses', (t) => t.dropColumn('status'));
  }
  if (await knex.schema.hasColumn('users', 'verification_status')) {
    await knex.schema.alterTable('users', (t) => t.dropColumn('verification_status'));
  }

  await knex.raw('DROP TYPE IF EXISTS report_status');
  await knex.raw('DROP TYPE IF EXISTS report_target_type');
  await knex.raw('DROP TYPE IF EXISTS job_status');
  await knex.raw('DROP TYPE IF EXISTS business_status');
  await knex.raw('DROP TYPE IF EXISTS user_verification_status');
}
