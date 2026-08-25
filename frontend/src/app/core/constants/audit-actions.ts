export const AUDIT_ACTION_COLORS: Record<string, string> = {
  // Users
  USER_CREATED: '#22c55e', USER_DELETED: '#ef4444', USER_BLOCKED: '#f59e0b',
  USER_UNBLOCKED: '#22c55e', ROLE_CHANGED: '#6366f1', PASSWORD_RESET: '#0ea5e9',
  PROFILE_UPDATE: '#8b5cf6', USER_LOGIN: '#64748b', USER_LOGOUT: '#94a3b8',
  USER_REGISTER: '#22c55e', NOTIFICATION_SENT: '#f97316',
  TRUST_GRANTED: '#f59e0b', TRUST_REVOKED: '#94a3b8',
  // Posts
  POST_CREATED: '#22c55e', POST_UPDATED: '#0ea5e9', POST_DELETED: '#ef4444',
  POST_APPROVED: '#22c55e', POST_REJECTED: '#ef4444',
  COMMENT_ADDED: '#22c55e', COMMENT_DELETED: '#ef4444',
  // Communities
  COMMUNITY_CREATED: '#22c55e', COMMUNITY_UPDATED: '#0ea5e9', COMMUNITY_DELETED: '#ef4444',
  COMMUNITY_JOINED: '#22c55e', COMMUNITY_LEFT: '#94a3b8',
  // Business
  BUSINESS_CATEGORY_CREATED: '#22c55e', BUSINESS_CATEGORY_UPDATED: '#0ea5e9', BUSINESS_CATEGORY_DELETED: '#ef4444',
  BUSINESS_CREATED: '#22c55e', BUSINESS_UPDATED: '#0ea5e9', BUSINESS_DELETED: '#ef4444',
  // Events
  EVENT_CREATED: '#22c55e', EVENT_UPDATED: '#0ea5e9', EVENT_DELETED: '#ef4444',
  // Jobs
  JOB_CREATED: '#22c55e', JOB_UPDATED: '#0ea5e9', JOB_DELETED: '#ef4444',
};

export const AUDIT_ACTION_ICONS: Record<string, string> = {
  USER_CREATED: 'bi-person-plus-fill', USER_DELETED: 'bi-trash-fill',
  USER_BLOCKED: 'bi-lock-fill', USER_UNBLOCKED: 'bi-unlock-fill',
  ROLE_CHANGED: 'bi-person-gear', PASSWORD_RESET: 'bi-key-fill',
  PROFILE_UPDATE: 'bi-pencil-fill', USER_LOGIN: 'bi-box-arrow-in-right',
  USER_LOGOUT: 'bi-box-arrow-right', USER_REGISTER: 'bi-person-badge-fill',
  NOTIFICATION_SENT: 'bi-bell-fill', TRUST_GRANTED: 'bi-shield-fill-check', TRUST_REVOKED: 'bi-shield-x',
  POST_CREATED: 'bi-file-earmark-plus-fill', POST_UPDATED: 'bi-pencil-square', POST_DELETED: 'bi-file-earmark-x-fill',
  POST_APPROVED: 'bi-check-circle-fill', POST_REJECTED: 'bi-x-circle-fill',
  COMMENT_ADDED: 'bi-chat-left-text-fill', COMMENT_DELETED: 'bi-chat-left-x-fill',
  COMMUNITY_CREATED: 'bi-people-fill', COMMUNITY_UPDATED: 'bi-pencil-square', COMMUNITY_DELETED: 'bi-trash-fill',
  COMMUNITY_JOINED: 'bi-box-arrow-in-right', COMMUNITY_LEFT: 'bi-box-arrow-right',
  BUSINESS_CATEGORY_CREATED: 'bi-tag-fill', BUSINESS_CATEGORY_UPDATED: 'bi-tag', BUSINESS_CATEGORY_DELETED: 'bi-trash-fill',
  BUSINESS_CREATED: 'bi-shop', BUSINESS_UPDATED: 'bi-pencil-square', BUSINESS_DELETED: 'bi-trash-fill',
  EVENT_CREATED: 'bi-calendar-plus-fill', EVENT_UPDATED: 'bi-calendar-week', EVENT_DELETED: 'bi-calendar-x-fill',
  JOB_CREATED: 'bi-briefcase-fill', JOB_UPDATED: 'bi-pencil-square', JOB_DELETED: 'bi-trash-fill',
};

export const AUDIT_ACTION_OPTIONS: string[] = Object.keys(AUDIT_ACTION_COLORS);

export const AUDIT_RESOURCE_OPTIONS: string[] = [
  'users', 'posts', 'comments', 'communities',
  'business_categories', 'businesses', 'events', 'jobs', 'notifications',
];

/**
 * Catalog keys for audit action/resource codes. These used to be derived by
 * title-casing the enum ("USER_CREATED" -> "User Created"), which only ever
 * produced English; the display now goes through the translation catalog
 * while the stored code is untouched.
 *
 * Codes with no catalog entry fall back to the old title-cased form so a new
 * backend action still reads sensibly before anyone adds a translation.
 */
export function auditActionKey(action: string): string {
  return `audit.action.${action}`;
}

export function auditResourceKey(resource: string): string {
  return `audit.resource.${resource}`;
}

export function titleCaseCode(code: string): string {
  return code.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

export function getAuditActionColor(action: string): string {
  return AUDIT_ACTION_COLORS[action] ?? '#94a3b8';
}

export function getAuditActionIcon(action: string): string {
  return AUDIT_ACTION_ICONS[action] ?? 'bi-activity';
}
