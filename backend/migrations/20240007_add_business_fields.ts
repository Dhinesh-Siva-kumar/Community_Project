import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('businesses', (t) => {
    t.string('city').nullable();
    t.string('state').nullable();
    t.string('opening_days').nullable();
    t.string('whatsapp').nullable();
    t.string('maps_link').nullable();
    t.string('logo').nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('businesses', (t) => {
    t.dropColumn('city');
    t.dropColumn('state');
    t.dropColumn('opening_days');
    t.dropColumn('whatsapp');
    t.dropColumn('maps_link');
    t.dropColumn('logo');
  });
}
