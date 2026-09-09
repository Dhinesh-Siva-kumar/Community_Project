import { Knex } from 'knex';

/**
 * Adds an optional booking/registration URL to events — surfaced on the
 * Event Details page as a link plus a QR code generated client-side from
 * this same value (no separate QR image is stored).
 */
export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasColumn('events', 'booking_url'))) {
    await knex.schema.alterTable('events', (t) => {
      t.string('booking_url', 500).nullable();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn('events', 'booking_url')) {
    await knex.schema.alterTable('events', (t) => t.dropColumn('booking_url'));
  }
}
