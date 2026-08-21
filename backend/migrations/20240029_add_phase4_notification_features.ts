import { Knex } from 'knex';

export const config = { transaction: false };

/**
 * Phase 4 of the notification module:
 * - WELCOME notification type (registration).
 * - Per-user muted notification types — a plain text[] blacklist, same
 *   convention as users.interests/communities.rules. Defaults to
 *   '{COMMUNITY_POST}' for every user (new and existing) so the "new post
 *   in your joined community" fan-out is opt-in, not opt-out — nobody gets
 *   flooded by default; removing it from their muted list opts them in.
 * - Email digest opt-in + a cursor timestamp so the digest job only ever
 *   sends notifications created since the last run.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.raw(`ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'WELCOME';`);

  const [hasMuted, hasDigestEnabled, hasLastDigest] = await Promise.all([
    knex.schema.hasColumn('users', 'muted_notification_types'),
    knex.schema.hasColumn('users', 'email_digest_enabled'),
    knex.schema.hasColumn('users', 'last_digest_sent_at'),
  ]);
  if (hasMuted && hasDigestEnabled && hasLastDigest) return;

  await knex.schema.alterTable('users', (t) => {
    if (!hasMuted) t.specificType('muted_notification_types', 'text[]').notNullable().defaultTo('{COMMUNITY_POST}');
    if (!hasDigestEnabled) t.boolean('email_digest_enabled').notNullable().defaultTo(false);
    if (!hasLastDigest) t.timestamp('last_digest_sent_at').nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  const [hasMuted, hasDigestEnabled, hasLastDigest] = await Promise.all([
    knex.schema.hasColumn('users', 'muted_notification_types'),
    knex.schema.hasColumn('users', 'email_digest_enabled'),
    knex.schema.hasColumn('users', 'last_digest_sent_at'),
  ]);
  if (!hasMuted && !hasDigestEnabled && !hasLastDigest) return;

  await knex.schema.alterTable('users', (t) => {
    if (hasMuted) t.dropColumn('muted_notification_types');
    if (hasDigestEnabled) t.dropColumn('email_digest_enabled');
    if (hasLastDigest) t.dropColumn('last_digest_sent_at');
  });
  // WELCOME enum value is not dropped — Postgres can't drop a single enum value.
}
