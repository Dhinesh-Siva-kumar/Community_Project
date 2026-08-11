import db from '../config/db';
import { getRequestContext } from './request-context';

export type AuditAction =
  // Auth
  | 'USER_REGISTER'
  | 'USER_LOGIN'
  | 'USER_LOGOUT'
  | 'PASSWORD_RESET'
  // Users (admin)
  | 'PROFILE_UPDATE'
  | 'USER_BLOCKED'
  | 'USER_UNBLOCKED'
  | 'USER_CREATED'
  | 'USER_DELETED'
  | 'ROLE_CHANGED'
  | 'TRUST_GRANTED'
  | 'TRUST_REVOKED'
  | 'NOTIFICATION_SENT'
  // Posts
  | 'POST_CREATED'
  | 'POST_UPDATED'
  | 'POST_DELETED'
  | 'POST_APPROVED'
  | 'POST_REJECTED'
  | 'COMMENT_ADDED'
  | 'COMMENT_DELETED'
  // Communities
  | 'COMMUNITY_CREATED'
  | 'COMMUNITY_UPDATED'
  | 'COMMUNITY_DELETED'
  | 'COMMUNITY_JOINED'
  | 'COMMUNITY_LEFT'
  // Business
  | 'BUSINESS_CATEGORY_CREATED'
  | 'BUSINESS_CATEGORY_UPDATED'
  | 'BUSINESS_CATEGORY_DELETED'
  | 'BUSINESS_CREATED'
  | 'BUSINESS_UPDATED'
  | 'BUSINESS_DELETED'
  // Events
  | 'EVENT_CREATED'
  | 'EVENT_UPDATED'
  | 'EVENT_DELETED'
  // Jobs
  | 'JOB_CREATED'
  | 'JOB_UPDATED'
  | 'JOB_DELETED'
  | string;

export async function logAudit(
  userId: string | null,
  action: AuditAction,
  metadata?: Record<string, unknown>,
  resource?: string,
  resourceId?: string,
): Promise<void> {
  try {
    const ctx = getRequestContext();
    await db('audit_logs').insert({
      user_id:     userId,
      action,
      resource:    resource    ?? null,
      resource_id: resourceId  ?? null,
      metadata:    metadata ? JSON.stringify(metadata) : null,
      ip_address:  ctx?.ipAddress ?? null,
      user_agent:  ctx?.userAgent ?? null,
    });
  } catch (err) {
    console.error('[AuditService] Failed to write audit log:', err);
  }
}

// ---------------------------------------------------------------------------
// Read side — shared by the admin Audit Log page (modules/audit) and the
// per-user activity drawer (modules/users), so query logic lives in one place.
// ---------------------------------------------------------------------------
export interface AuditLogFilters {
  page: number;
  limit: number;
  action?: string;
  resource?: string;
  /** Who performed the action (audit_logs.user_id). */
  actorId?: string;
  /** Legacy per-user drawer filter: actions recorded against this user as the target. */
  targetUserId?: string;
  /** Inclusive date range, YYYY-MM-DD. */
  dateFrom?: string;
  dateTo?: string;
}

export async function listAuditLogs(filters: AuditLogFilters) {
  const { page, limit, action, resource, actorId, targetUserId, dateFrom, dateTo } = filters;
  const offset = (page - 1) * limit;

  function applyFilters(q: ReturnType<typeof db>) {
    if (action) q.where('action', action);
    if (resource) q.where('resource', resource);
    if (actorId) q.where('user_id', actorId);
    if (targetUserId) q.where({ resource: 'users', resource_id: targetUserId });
    if (dateFrom) q.where('created_at', '>=', `${dateFrom}T00:00:00.000Z`);
    if (dateTo) q.where('created_at', '<=', `${dateTo}T23:59:59.999Z`);
  }

  const query = db('audit_logs as al')
    .leftJoin('users as u', 'al.user_id', 'u.id')
    .select(
      'al.id', 'al.action', 'al.resource', 'al.resource_id',
      'al.metadata', 'al.created_at', 'al.ip_address', 'al.user_agent',
      'u.id as actor_id', 'u.display_name as actor_name',
      'u.user_name as actor_username', 'u.avatar as actor_avatar',
    )
    .orderBy('al.created_at', 'desc');
  applyFilters(query);

  const countQuery = db('audit_logs');
  applyFilters(countQuery);

  const [logs, [{ total }]] = await Promise.all([
    query.limit(limit).offset(offset),
    countQuery.count({ total: '*' }),
  ]);

  return {
    data: (logs as any[]).map((l) => ({
      id:            l.id,
      action:        l.action,
      resource:      l.resource,
      resourceId:    l.resource_id,
      metadata:      l.metadata ? (() => { try { return JSON.parse(l.metadata); } catch { return l.metadata; } })() : null,
      createdAt:     String(l.created_at),
      ipAddress:     l.ip_address ?? null,
      userAgent:     l.user_agent ?? null,
      actor: l.actor_id ? {
        id:          l.actor_id,
        displayName: l.actor_name,
        userName:    l.actor_username,
        avatar:      l.actor_avatar,
      } : null,
    })),
    total:      Number(total),
    page,
    limit,
    totalPages: Math.ceil(Number(total) / limit),
  };
}

/** Distinct action/resource values and actors seen so far, for admin filter dropdowns. */
export async function getAuditLogFacets() {
  const [actions, resources, actors] = await Promise.all([
    db('audit_logs').distinct('action').orderBy('action') as Promise<{ action: string }[]>,
    db('audit_logs').distinct('resource').whereNotNull('resource').orderBy('resource') as Promise<{ resource: string }[]>,
    db('audit_logs as al')
      .join('users as u', 'al.user_id', 'u.id')
      .distinct('u.id', 'u.display_name', 'u.user_name', 'u.avatar')
      .orderBy('u.display_name') as Promise<{ id: string; display_name: string; user_name: string; avatar: string | null }[]>,
  ]);
  return {
    actions:   actions.map((a) => a.action),
    resources: resources.map((r) => r.resource),
    actors:    actors.map((a) => ({
      id: a.id, displayName: a.display_name, userName: a.user_name, avatar: a.avatar,
    })),
  };
}
