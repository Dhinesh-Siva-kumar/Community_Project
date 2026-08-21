import db from '../config/db';
import { sendDigestEmail } from './email.service';

const DIGEST_INTERVAL_MS = 24 * 60 * 60 * 1000; // once a day
const DIGEST_LOOKBACK_MS = 24 * 60 * 60 * 1000; // fallback window for a user's first-ever digest

/**
 * Emails everyone who's opted into digests (`email_digest_enabled`) a
 * summary of notifications created since their `last_digest_sent_at`
 * cursor (or the last 24h, for a first-ever run), then advances the cursor.
 * Users with nothing new since their last digest are skipped (cursor still
 * advances, so they don't get an empty email later covering the same gap).
 */
export async function runDailyDigest(): Promise<void> {
  const users = await db('users')
    .where({ email_digest_enabled: true, is_active: true, is_blocked: false })
    .whereNotNull('email')
    .select('id', 'email', 'display_name', 'user_name', 'last_digest_sent_at');

  for (const user of users as Array<Record<string, unknown>>) {
    const since = (user['last_digest_sent_at'] as Date | null) ?? new Date(Date.now() - DIGEST_LOOKBACK_MS);
    const now = new Date();

    const notifications = await db('notifications')
      .where({ user_id: user['id'] })
      .where('created_at', '>', since)
      .orderBy('created_at', 'desc')
      .select('message', 'created_at') as Array<{ message: string; created_at: Date }>;

    if (notifications.length > 0) {
      try {
        await sendDigestEmail(
          user['email'] as string,
          (user['display_name'] as string) || (user['user_name'] as string) || 'there',
          notifications.map((n) => ({ message: n.message, createdAt: n.created_at })),
        );
      } catch (err) {
        console.error(`[Digest] Failed to send digest to ${user['email']}:`, err);
        continue; // don't advance the cursor if the send failed — retry next run
      }
    }

    await db('users').where({ id: user['id'] }).update({ last_digest_sent_at: now });
  }
}

let intervalHandle: ReturnType<typeof setInterval> | null = null;

/**
 * Lightweight in-process scheduler — no cron dependency exists in this
 * codebase, so this simply re-runs the digest job on a fixed interval from
 * server start, rather than at a fixed wall-clock hour. Single-instance
 * only (each replica would run its own timer independently); fine at this
 * app's current scale. If wall-clock-aligned scheduling ("send at 8am") or
 * multi-instance safety is ever needed, swap this for node-cron or a
 * managed scheduler instead.
 */
export function startDigestScheduler(): void {
  if (intervalHandle) return;
  intervalHandle = setInterval(() => {
    runDailyDigest().catch((err) => console.error('[Digest] Failed to run daily digest:', err));
  }, DIGEST_INTERVAL_MS);
  console.log('[Digest] Scheduler started — runs every 24h from server start.');
}
