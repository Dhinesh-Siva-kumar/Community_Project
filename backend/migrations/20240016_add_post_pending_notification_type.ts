import { Knex } from 'knex';

// ALTER TYPE ... ADD VALUE cannot run inside a transaction block.
export const config = { transaction: false };

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'POST_PENDING';`);
}

export async function down(): Promise<void> {
  // Postgres has no built-in support for dropping a single enum value;
  // reversing this would require recreating notification_type and every
  // dependent column, which isn't worth doing for a no-op-if-unused value.
}
