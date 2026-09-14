import { Knex } from 'knex';

/**
 * Three small, independent Student Connect side-tables grouped in one
 * migration since none depends on anything created later. student_reports'
 * message_id stays nullable with no FK yet — the target table
 * (student_chat_messages) doesn't exist until 20240057, which adds the FK
 * once it does. The column exists regardless of which concept
 * (Contact Sharing vs In-App Chat, see STUDENT_CONNECT_SPEC.md §2) is
 * active — it's simply unused under Contact Sharing.
 */
export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable('student_saved_profiles'))) {
    await knex.schema.createTable('student_saved_profiles', (t) => {
      t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      t.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
      t.uuid('saved_user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
      t.timestamps(true, true);

      t.unique(['user_id', 'saved_user_id']);
    });
  }

  if (!(await knex.schema.hasTable('student_reports'))) {
    await knex.schema.createTable('student_reports', (t) => {
      t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      t.uuid('reporter_user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
      t.uuid('target_user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
      t.uuid('message_id').nullable(); // FK added in 20240057 once student_chat_messages exists
      t.string('reason', 30).notNullable();
      t.string('status', 20).notNullable().defaultTo('open');
      t.timestamps(true, true);

      t.index('target_user_id');
      t.index('status');
    });
  }

  if (!(await knex.schema.hasTable('student_blocks'))) {
    await knex.schema.createTable('student_blocks', (t) => {
      t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      t.uuid('blocker_user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
      t.uuid('blocked_user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
      t.timestamps(true, true);

      t.unique(['blocker_user_id', 'blocked_user_id']);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('student_blocks');
  await knex.schema.dropTableIfExists('student_reports');
  await knex.schema.dropTableIfExists('student_saved_profiles');
}
