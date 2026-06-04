import db from '../config/db';

type AuditAction =
  | 'USER_REGISTER'
  | 'USER_LOGIN'
  | 'USER_LOGOUT'
  | 'PASSWORD_RESET'
  | 'PROFILE_UPDATE'
  | 'USER_BLOCKED'
  | 'USER_UNBLOCKED'
  | string;

export async function logAudit(
  userId: string | null,
  action: AuditAction,
  metadata?: Record<string, unknown>,
): Promise<void> {
  try {
    await db('audit_logs').insert({
      user_id: userId,
      action,
      metadata: metadata ? JSON.stringify(metadata) : null,
    });
  } catch (err) {
    // Fire-and-forget: log but never throw
    console.error('[AuditService] Failed to write audit log:', err);
  }
}
