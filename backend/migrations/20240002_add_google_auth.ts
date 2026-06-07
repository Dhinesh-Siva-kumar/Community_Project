import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Add is_google and google_id columns
  await knex.schema.alterTable('users', (t) => {
    t.boolean('is_google').notNullable().defaultTo(false);
    t.string('google_id', 255).nullable();
  });

  // Make password nullable (Google users have no password)
  await knex.raw('ALTER TABLE users ALTER COLUMN password DROP NOT NULL');
}

export async function down(knex: Knex): Promise<void> {
  // Re-add NOT NULL to password (set empty string where null first)
  await knex.raw("UPDATE users SET password = '' WHERE password IS NULL");
  await knex.raw('ALTER TABLE users ALTER COLUMN password SET NOT NULL');

  await knex.schema.alterTable('users', (t) => {
    t.dropColumn('google_id');
    t.dropColumn('is_google');
  });
}
