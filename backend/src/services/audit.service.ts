import db from '../config/db';

export type AuditAction =
  | 'USER_REGISTER'
  | 'USER_LOGIN'
  | 'USER_LOGOUT'
  | 'PASSWORD_RESET'
  | 'PROFILE_UPDATE'
  | 'USER_BLOCKED'
  | 'USER_UNBLOCKED'
  | 'USER_CREATED'
  | 'USER_DELETED'
  | 'ROLE_CHANGED'
  | 'TRUST_GRANTED'
  | 'TRUST_REVOKED'
  | 'NOTIFICATION_SENT'
  | string;

export async function logAudit(
  userId: string | null,
  action: AuditAction,
  metadata?: Record<string, unknown>,
  resource?: string,
  resourceId?: string,
): Promise<void> {
  try {
    await db('audit_logs').insert({
      user_id:     userId,
      action,
      resource:    resource    ?? null,
      resource_id: resourceId  ?? null,
      metadata:    metadata ? JSON.stringify(metadata) : null,
    });
  } catch (err) {
    console.error('[AuditService] Failed to write audit log:', err);
  }
}
