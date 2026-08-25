import { NotificationType } from '../../core/models';

/**
 * Per-type icon/color + click-through route for notifications. Icon/color
 * convention mirrors activityIcon/activityColor already used for the admin
 * dashboard's Recent Activity feed (admin-dashboard.component.ts) rather
 * than inventing a new one.
 */

const ICONS: Record<NotificationType, string> = {
  POST_APPROVED: 'bi-check-circle-fill',
  POST_REJECTED: 'bi-x-circle-fill',
  POST_PENDING: 'bi-hourglass-split',
  NEW_COMMENT: 'bi-chat-left-text-fill',
  NEW_LIKE: 'bi-heart-fill',
  COMMUNITY_POST: 'bi-file-earmark-text-fill',
  USER_BLOCKED: 'bi-slash-circle-fill',
  USER_UNBLOCKED: 'bi-unlock-fill',
  TRUST_GRANTED: 'bi-patch-check-fill',
  EVENT_CREATED: 'bi-calendar-event-fill',
  JOB_POSTED: 'bi-briefcase-fill',
  COMMUNITY_PENDING: 'bi-hourglass-split',
  COMMUNITY_APPROVED: 'bi-check-circle-fill',
  COMMUNITY_REJECTED: 'bi-x-circle-fill',
  BUSINESS_PENDING: 'bi-hourglass-split',
  BUSINESS_APPROVED: 'bi-check-circle-fill',
  BUSINESS_REJECTED: 'bi-x-circle-fill',
  JOB_PENDING: 'bi-hourglass-split',
  JOB_APPROVED: 'bi-check-circle-fill',
  JOB_REJECTED: 'bi-x-circle-fill',
  EVENT_PENDING: 'bi-hourglass-split',
  EVENT_APPROVED: 'bi-check-circle-fill',
  EVENT_REJECTED: 'bi-x-circle-fill',
  TRUST_REVOKED: 'bi-patch-exclamation-fill',
  ACCOUNT_DEACTIVATED: 'bi-person-x-fill',
  PASSWORD_RESET_BY_ADMIN: 'bi-shield-lock-fill',
  POST_REMOVED: 'bi-trash-fill',
  COMMUNITY_REMOVED: 'bi-trash-fill',
  BUSINESS_REMOVED: 'bi-trash-fill',
  EVENT_REMOVED: 'bi-trash-fill',
  JOB_REMOVED: 'bi-trash-fill',
  COMMUNITY_MEMBER_JOINED: 'bi-person-plus-fill',
  WELCOME: 'bi-stars',
};

const COLORS: Record<NotificationType, string> = {
  POST_APPROVED: '#16A34A',
  POST_REJECTED: '#DC2626',
  POST_PENDING: '#D97706',
  NEW_COMMENT: '#0284C7',
  NEW_LIKE: '#DB2777',
  COMMUNITY_POST: '#2563EB',
  USER_BLOCKED: '#DC2626',
  USER_UNBLOCKED: '#16A34A',
  TRUST_GRANTED: '#7C3AED',
  EVENT_CREATED: '#7C3AED',
  JOB_POSTED: '#0D9488',
  COMMUNITY_PENDING: '#D97706',
  COMMUNITY_APPROVED: '#16A34A',
  COMMUNITY_REJECTED: '#DC2626',
  BUSINESS_PENDING: '#D97706',
  BUSINESS_APPROVED: '#16A34A',
  BUSINESS_REJECTED: '#DC2626',
  JOB_PENDING: '#D97706',
  JOB_APPROVED: '#16A34A',
  JOB_REJECTED: '#DC2626',
  EVENT_PENDING: '#D97706',
  EVENT_APPROVED: '#16A34A',
  EVENT_REJECTED: '#DC2626',
  TRUST_REVOKED: '#D97706',
  ACCOUNT_DEACTIVATED: '#DC2626',
  PASSWORD_RESET_BY_ADMIN: '#D97706',
  POST_REMOVED: '#DC2626',
  COMMUNITY_REMOVED: '#DC2626',
  BUSINESS_REMOVED: '#DC2626',
  EVENT_REMOVED: '#DC2626',
  JOB_REMOVED: '#DC2626',
  COMMUNITY_MEMBER_JOINED: '#16A34A',
  WELCOME: '#D97706',
};

const LABELS: Record<NotificationType, string> = {
  POST_APPROVED: 'Your post is approved',
  POST_REJECTED: 'Your post is rejected',
  POST_PENDING: 'A post needs approval',
  NEW_COMMENT: 'Someone comments on your post',
  NEW_LIKE: 'Someone likes your post',
  COMMUNITY_POST: 'New posts in your communities',
  USER_BLOCKED: 'Your account is blocked',
  USER_UNBLOCKED: 'Your account is unblocked',
  TRUST_GRANTED: 'You are granted trusted status',
  EVENT_CREATED: 'Event created confirmation',
  JOB_POSTED: 'Job posted confirmation',
  COMMUNITY_PENDING: 'A community needs approval',
  COMMUNITY_APPROVED: 'Your community is approved',
  COMMUNITY_REJECTED: 'Your community is rejected',
  BUSINESS_PENDING: 'A business needs approval',
  BUSINESS_APPROVED: 'Your business is approved',
  BUSINESS_REJECTED: 'Your business is rejected',
  JOB_PENDING: 'A job needs approval',
  JOB_APPROVED: 'Your job is approved',
  JOB_REJECTED: 'Your job is rejected',
  EVENT_PENDING: 'An event needs approval',
  EVENT_APPROVED: 'Your event is approved',
  EVENT_REJECTED: 'Your event is rejected',
  TRUST_REVOKED: 'Your trusted status is revoked',
  ACCOUNT_DEACTIVATED: 'Your account is deactivated',
  PASSWORD_RESET_BY_ADMIN: 'Your password is reset by an admin',
  POST_REMOVED: 'Your post is removed by an admin',
  COMMUNITY_REMOVED: 'Your community is removed by an admin',
  BUSINESS_REMOVED: 'Your business is removed by an admin',
  EVENT_REMOVED: 'Your event is removed by an admin',
  JOB_REMOVED: 'Your job is removed by an admin',
  COMMUNITY_MEMBER_JOINED: 'Someone joins your community',
  WELCOME: 'Welcome message',
};

export function notificationTypeLabel(type: NotificationType): string {
  return LABELS[type] ?? type;
}

export function notificationIcon(type: NotificationType): string {
  return ICONS[type] ?? 'bi-bell-fill';
}

export function notificationColor(type: NotificationType): string {
  return COLORS[type] ?? '#78716C';
}

/**
 * Icon badge background — the type color at low alpha, so it reads as a
 * soft tint behind the (full-opacity) icon glyph rather than a solid fill.
 * The green "approved" family (#16A34A) uses a fixed light-green pastel
 * instead — the same one already used for "Active" status badges/stat
 * tiles elsewhere in the app — rather than an alpha-blend of the base
 * green, which still read as too saturated/dark against the white list.
 */
export function notificationBgColor(type: NotificationType): string {
  const color = notificationColor(type);
  if (color === '#16A34A') return '#DCFCE7';
  return color + '1F'; // ~12%
}

export interface NotificationRoute {
  path: string[];
  queryParams?: Record<string, string>;
}

/**
 * Where clicking a notification should navigate.
 * - `*_PENDING` types only ever go to admins — route to the Approval queue,
 *   deep-linked to the right tab (mirrors ApprovalComponent's `?tab=` param).
 * - `*_APPROVED`/`*_REJECTED` go to the submitter — route to where their own
 *   content lives (posts use the profile's `?tab=posts` deep link, same
 *   pattern the dashboard's "Posts" stat card already uses).
 * - Account-level types (block/unblock/trust) go to the affected user's
 *   own profile — these are never sent to admins, only to the target user.
 */
export function notificationRoute(
  type: NotificationType,
  relatedEntityId: string | undefined,
  isAdmin: boolean,
): NotificationRoute | null {
  if (type.endsWith('_PENDING')) {
    if (!isAdmin) return null;
    const tab = type.startsWith('COMMUNITY_') ? 'community'
      : type.startsWith('BUSINESS_') ? 'business'
      : type.startsWith('JOB_') ? 'jobs'
      : type.startsWith('EVENT_') ? 'events'
      : 'posts';
    return { path: ['/admin/approval'], queryParams: { tab } };
  }

  if (type === 'POST_APPROVED' || type === 'POST_REJECTED' || type === 'POST_REMOVED' || type === 'NEW_LIKE' || type === 'NEW_COMMENT') {
    // Only ever sent to a non-admin submitter — admin-authored posts skip
    // the pending/approval gate entirely, so this path never fires for admins.
    return { path: ['/user/profile'], queryParams: { tab: 'posts' } };
  }
  if (type.startsWith('COMMUNITY_')) {
    const base = isAdmin ? '/admin/community' : '/user/community';
    return relatedEntityId ? { path: [base, relatedEntityId] } : { path: [base] };
  }
  if (type.startsWith('BUSINESS_')) {
    return { path: [isAdmin ? '/admin/business' : '/user/business'] };
  }
  if (type.startsWith('EVENT_')) {
    return { path: [isAdmin ? '/admin/events' : '/user/events'] };
  }
  if (type.startsWith('JOB_')) {
    return { path: [isAdmin ? '/admin/jobs' : '/user/jobs'] };
  }
  if (
    type === 'USER_BLOCKED' || type === 'USER_UNBLOCKED' ||
    type === 'TRUST_GRANTED' || type === 'TRUST_REVOKED' ||
    type === 'ACCOUNT_DEACTIVATED' || type === 'PASSWORD_RESET_BY_ADMIN' ||
    type === 'WELCOME'
  ) {
    return { path: ['/user/profile'] };
  }
  return null;
}
