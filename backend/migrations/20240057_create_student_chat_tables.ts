import { Knex } from 'knex';

/**
 * In-App Chat tables for the Student Connect module (STUDENT_CONNECT_SPEC.md
 * §2's "Model B"). These are always created regardless of the current
 * STUDENT_CONNECT_MODEL value — only runtime behavior is gated by that flag
 * (see student-connect.service.ts's assertChatModelEnabled()), not the
 * schema, so flipping the flag never needs a migration.
 *
 * Exactly one thread per connection (unique connection_id) — a thread is
 * created the moment a connection is accepted, mirroring the same trigger
 * point Model A uses to unlock contact details.
 */
export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable('student_chat_threads'))) {
    await knex.schema.createTable('student_chat_threads', (t) => {
      t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      t.uuid('connection_id').notNullable().unique()
        .references('id').inTable('student_connections').onDelete('CASCADE');
      t.timestamps(true, true);
    });
  }

  if (!(await knex.schema.hasTable('student_chat_messages'))) {
    await knex.schema.createTable('student_chat_messages', (t) => {
      t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      t.uuid('thread_id').notNullable()
        .references('id').inTable('student_chat_threads').onDelete('CASCADE');
      t.uuid('sender_user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
      t.text('body').notNullable();
      t.timestamp('read_at').nullable();
      t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());

      t.index(['thread_id', 'created_at']);
    });
  }

  // Deferred from 20240056 — student_chat_messages didn't exist yet then.
  const hasFk = await knex.raw(`
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'student_reports_message_id_foreign'
  `);
  if (hasFk.rows.length === 0) {
    await knex.schema.alterTable('student_reports', (t) => {
      t.foreign('message_id').references('id').inTable('student_chat_messages').onDelete('SET NULL');
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('student_reports', (t) => {
    t.dropForeign('message_id');
  });
  await knex.schema.dropTableIfExists('student_chat_messages');
  await knex.schema.dropTableIfExists('student_chat_threads');
}
