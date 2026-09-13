import { Knex } from 'knex';

/**
 * Connection requests and the accepted connections they produce. The
 * service layer always normalizes user_a_id < user_b_id before inserting
 * into student_connections so the unique index below actually prevents a
 * duplicate connection regardless of who initiated it.
 */
export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable('student_connection_requests'))) {
    await knex.schema.createTable('student_connection_requests', (t) => {
      t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      t.uuid('from_user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
      t.uuid('to_user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
      t.text('message').notNullable();
      t.string('status', 20).notNullable().defaultTo('pending');
      t.timestamp('responded_at').nullable();
      t.timestamps(true, true);

      t.index('from_user_id');
      t.index('to_user_id');
    });

    // Block duplicate pending requests between the same pair (either
    // direction is checked in the service layer; the DB backstop only
    // needs to cover the exact (from,to) pair actually inserted).
    await knex.raw(`
      CREATE UNIQUE INDEX student_connection_requests_pending_pair_idx
      ON student_connection_requests (from_user_id, to_user_id)
      WHERE status = 'pending';
    `);
  }

  if (!(await knex.schema.hasTable('student_connections'))) {
    await knex.schema.createTable('student_connections', (t) => {
      t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      t.uuid('user_a_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
      t.uuid('user_b_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
      t.timestamp('connected_at').notNullable().defaultTo(knex.fn.now());

      t.unique(['user_a_id', 'user_b_id']);
      t.index('user_a_id');
      t.index('user_b_id');
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('student_connections');
  await knex.schema.dropTableIfExists('student_connection_requests');
}
