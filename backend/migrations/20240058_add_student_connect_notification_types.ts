import { Knex } from 'knex';

// ALTER TYPE ... ADD VALUE cannot run inside a transaction block.
export const config = { transaction: false };

export async function up(knex: Knex): Promise<void> {
  const values = [
    'STUDENT_CONNECTION_REQUEST',
    'STUDENT_CONNECTION_ACCEPTED',
    'STUDENT_VERIFICATION_APPROVED',
    'STUDENT_VERIFICATION_REJECTED',
    'STUDENT_CHAT_MESSAGE',
  ];
  for (const value of values) {
    await knex.raw(`ALTER TYPE notification_type ADD VALUE IF NOT EXISTS '${value}';`);
  }
}

export async function down(): Promise<void> {
  // Postgres has no built-in support for dropping a single enum value;
  // reversing this would require recreating notification_type and every
  // dependent column, which isn't worth doing for no-op-if-unused values.
}
