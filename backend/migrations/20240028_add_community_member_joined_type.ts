import { Knex } from 'knex';

export const config = { transaction: false };

/** Phase 3 of the notification module — engagement (likes/comments use the
 * already-existing NEW_LIKE/NEW_COMMENT types; this adds the one new type
 * needed for "someone joined your community"). */
export async function up(knex: Knex): Promise<void> {
  await knex.raw(`ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'COMMUNITY_MEMBER_JOINED';`);
}

export async function down(): Promise<void> {
  // no-op — Postgres can't drop a single enum value
}
