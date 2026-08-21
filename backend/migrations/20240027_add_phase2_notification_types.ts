import { Knex } from 'knex';

// Postgres enum values can't be added inside a transaction.
export const config = { transaction: false };

/**
 * Phase 2 of the notification module — account/moderation transparency
 * (block/unblock/trust/untrust/deactivate/password-reset) and admin-deletion
 * of another user's content across all 5 content modules.
 */
export async function up(knex: Knex): Promise<void> {
  const values = [
    'TRUST_REVOKED', 'ACCOUNT_DEACTIVATED', 'PASSWORD_RESET_BY_ADMIN',
    'POST_REMOVED', 'COMMUNITY_REMOVED', 'BUSINESS_REMOVED', 'EVENT_REMOVED', 'JOB_REMOVED',
  ];
  for (const value of values) {
    await knex.raw(`ALTER TYPE notification_type ADD VALUE IF NOT EXISTS '${value}';`);
  }
}

export async function down(): Promise<void> {
  // no-op — Postgres can't drop a single enum value
}
