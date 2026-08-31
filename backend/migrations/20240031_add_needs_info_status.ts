import { Knex } from 'knex';

/**
 * Adds a third moderation outcome, NEEDS_INFO, to all five approvable
 * entities' status enums. An admin uses it (via the Approval page's new
 * "Request More Info" action) to ask the submitter for changes without
 * rejecting outright — the row stays around with rejection_reason holding
 * the admin's message, and editing it flips status back to PENDING (see
 * each module's update() function).
 *
 * ALTER TYPE ... ADD VALUE cannot run inside a transaction block.
 */
export const config = { transaction: false };

export async function up(knex: Knex): Promise<void> {
  const types = ['post_status', 'community_status', 'business_status', 'job_status', 'event_status'];
  for (const type of types) {
    await knex.raw(`ALTER TYPE ${type} ADD VALUE IF NOT EXISTS 'NEEDS_INFO';`);
  }
}

export async function down(): Promise<void> {
  // Postgres has no built-in support for dropping a single enum value;
  // reversing this would require recreating each status type and every
  // dependent column, which isn't worth doing for a no-op-if-unused value.
}
