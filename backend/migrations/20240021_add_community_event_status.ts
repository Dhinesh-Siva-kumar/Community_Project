import { Knex } from 'knex';

/**
 * Adds the same PENDING/APPROVED/REJECTED moderation status that posts/
 * businesses/jobs already have to communities and events, so admin approval
 * can be enforced for these two entities too.
 *
 * Existing rows are backfilled to APPROVED so this migration doesn't
 * retroactively flag already-live communities/events as pending; only new
 * rows created after this migration start out PENDING.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    DO $$ BEGIN
      CREATE TYPE community_status AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;
  `);
  await knex.raw(`
    DO $$ BEGIN
      CREATE TYPE event_status AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;
  `);

  if (!(await knex.schema.hasColumn('communities', 'status'))) {
    await knex.schema.alterTable('communities', (t) => {
      t.specificType('status', 'community_status').notNullable().defaultTo('PENDING');
      t.text('rejection_reason').nullable();
    });
    await knex('communities').update({ status: 'APPROVED' });
  }

  if (!(await knex.schema.hasColumn('events', 'status'))) {
    await knex.schema.alterTable('events', (t) => {
      t.specificType('status', 'event_status').notNullable().defaultTo('PENDING');
      t.text('rejection_reason').nullable();
    });
    await knex('events').update({ status: 'APPROVED' });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn('events', 'status')) {
    await knex.schema.alterTable('events', (t) => {
      t.dropColumn('status');
      t.dropColumn('rejection_reason');
    });
  }
  if (await knex.schema.hasColumn('communities', 'status')) {
    await knex.schema.alterTable('communities', (t) => {
      t.dropColumn('status');
      t.dropColumn('rejection_reason');
    });
  }

  await knex.raw('DROP TYPE IF EXISTS event_status');
  await knex.raw('DROP TYPE IF EXISTS community_status');
}
