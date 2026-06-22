import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('events', (t) => {
    t.string('event_category').nullable();
    t.string('event_end_time').nullable();
    t.string('timezone').notNullable().defaultTo('Asia/Kolkata');
    t.string('event_mode').notNullable().defaultTo('Offline');
    t.string('location_link').nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('events', (t) => {
    t.dropColumn('event_category');
    t.dropColumn('event_end_time');
    t.dropColumn('timezone');
    t.dropColumn('event_mode');
    t.dropColumn('location_link');
  });
}
