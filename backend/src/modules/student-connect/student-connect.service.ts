import type { Knex } from 'knex';
import db from '../../config/db';
import { env } from '../../config/env';
import { AppError } from '../../middleware/errorHandler';
import { logAudit } from '../../services/audit.service';
import * as notificationsService from '../notifications/notifications.service';
import type {
  RegisterStudentProfileDtoType,
  UpdateStudentProfileDtoType,
  SearchStudentsQueryDtoType,
  CreateConnectionRequestDtoType,
  CreateStudentReportDtoType,
  ListChatMessagesQueryDtoType,
} from './student-connect.dto';

// ============================================================
// Dual-model toggle (STUDENT_CONNECT_SPEC.md §2) — every branch point in
// this file funnels through these two helpers, nothing else reads
// env.STUDENT_CONNECT_MODEL directly.
// ============================================================
export function isChatModel(): boolean {
  return env.STUDENT_CONNECT_MODEL === 'IN_APP_CHAT';
}

export function getConfig() {
  return {
    model: env.STUDENT_CONNECT_MODEL,
    chatEnabled: isChatModel(),
    paidMentoringSelectable: isChatModel(),
  };
}

/** Chat endpoints behave as if they don't exist under Contact Sharing — a
 * 404, not a 403, so disabling the model never leaks that chat exists. */
function assertChatModelEnabled(): void {
  if (!isChatModel()) throw new AppError(404, 'Not found', 'NOT_FOUND');
}

// ============================================================
// Mappers
// ============================================================
function mapProfileRow(row: Record<string, unknown>) {
  return {
    id: row['id'],
    userId: row['user_id'],
    firstName: row['first_name'],
    photoUrl: row['photo_url'],
    countryId: row['country_id'],
    regionId: row['region_id'],
    cityId: row['city_id'],
    cityFreeText: row['city_free_text'],
    universityId: row['university_id'],
    universityFreeText: row['university_free_text'],
    course: row['course'],
    studyLevel: row['study_level'],
    yearOfStudy: row['year_of_study'],
    languages: row['languages'] ?? [],
    shortIntro: row['short_intro'],
    previousCountryId: row['previous_country_id'],
    academicBackground: row['academic_background'],
    areasOfHelp: row['areas_of_help'] ?? [],
    mentorAvailable: row['mentor_available'],
    mentoringType: row['mentoring_type'],
    consultationPrice: row['consultation_price'],
    verificationStatus: row['verification_status'],
    verificationMethod: row['verification_method'],
    lastRejectionReason: row['last_rejection_reason'],
    isActive: row['is_active'],
    createdAt: row['created_at'],
    updatedAt: row['updated_at'],
  };
}

function mapConnectionRequestRow(row: Record<string, unknown>) {
  return {
    id: row['id'],
    fromUserId: row['from_user_id'],
    toUserId: row['to_user_id'],
    message: row['message'],
    status: row['status'],
    createdAt: row['created_at'],
    respondedAt: row['responded_at'],
  };
}

function mapConnectionRow(row: Record<string, unknown>) {
  return {
    id: row['id'],
    userAId: row['user_a_id'],
    userBId: row['user_b_id'],
    connectedAt: row['connected_at'],
  };
}

function mapChatMessageRow(row: Record<string, unknown>) {
  return {
    id: row['id'],
    threadId: row['thread_id'],
    senderUserId: row['sender_user_id'],
    text: row['body'],
    createdAt: row['created_at'],
    readAt: row['read_at'],
  };
}

async function areConnected(userA: string, userB: string): Promise<boolean> {
  const [a, b] = [userA, userB].sort();
  const row = await db('student_connections').where({ user_a_id: a, user_b_id: b }).first();
  return !!row;
}

// ============================================================
// Profile CRUD — a missing row IS the "unregistered" state
// (STUDENT_CONNECT_SPEC.md §4); there is no separate status value for it.
// ============================================================
export async function getMyProfile(userId: string) {
  const row = await db('student_profiles').where({ user_id: userId }).first();
  if (!row) throw new AppError(404, 'Student profile not found', 'STUDENT_PROFILE_NOT_FOUND');
  return mapProfileRow(row as Record<string, unknown>);
}

export async function registerProfile(userId: string, dto: RegisterStudentProfileDtoType) {
  const existing = await db('student_profiles').where({ user_id: userId }).first();
  if (existing) throw new AppError(409, 'Student profile already exists', 'STUDENT_PROFILE_ALREADY_EXISTS');

  const [row] = await db('student_profiles')
    .insert({
      user_id: userId,
      first_name: dto.firstName,
      photo_url: dto.photoUrl ?? null,
      country_id: dto.countryId,
      region_id: dto.regionId ?? null,
      city_id: dto.cityId ?? null,
      city_free_text: dto.cityFreeText ?? null,
      university_id: dto.universityId ?? null,
      university_free_text: dto.universityFreeText ?? null,
      course: dto.course,
      study_level: dto.studyLevel,
      year_of_study: dto.yearOfStudy,
      languages: dto.languages,
      short_intro: dto.shortIntro,
      previous_country_id: dto.previousCountryId ?? null,
      academic_background: dto.academicBackground ?? null,
      areas_of_help: dto.areasOfHelp ?? [],
      verification_status: 'pending',
    })
    .returning('*');

  await logAudit(userId, 'STUDENT_PROFILE_REGISTERED', { course: dto.course, countryId: dto.countryId }, 'student_profiles', row['id'] as string);
  return mapProfileRow(row as Record<string, unknown>);
}

export async function updateMyProfile(userId: string, dto: UpdateStudentProfileDtoType) {
  const existing = await db('student_profiles').where({ user_id: userId }).first() as Record<string, unknown> | undefined;
  if (!existing) throw new AppError(404, 'Student profile not found', 'STUDENT_PROFILE_NOT_FOUND');

  const updates: Record<string, unknown> = {};
  if (dto.firstName !== undefined) updates['first_name'] = dto.firstName;
  if (dto.photoUrl !== undefined) updates['photo_url'] = dto.photoUrl;
  if (dto.countryId !== undefined) updates['country_id'] = dto.countryId;
  if (dto.regionId !== undefined) updates['region_id'] = dto.regionId;
  if (dto.cityId !== undefined) updates['city_id'] = dto.cityId;
  if (dto.cityFreeText !== undefined) updates['city_free_text'] = dto.cityFreeText;
  if (dto.universityId !== undefined) updates['university_id'] = dto.universityId;
  if (dto.universityFreeText !== undefined) updates['university_free_text'] = dto.universityFreeText;
  if (dto.course !== undefined) updates['course'] = dto.course;
  if (dto.studyLevel !== undefined) updates['study_level'] = dto.studyLevel;
  if (dto.yearOfStudy !== undefined) updates['year_of_study'] = dto.yearOfStudy;
  if (dto.languages !== undefined) updates['languages'] = dto.languages;
  if (dto.shortIntro !== undefined) updates['short_intro'] = dto.shortIntro;
  if (dto.previousCountryId !== undefined) updates['previous_country_id'] = dto.previousCountryId;
  if (dto.academicBackground !== undefined) updates['academic_background'] = dto.academicBackground;
  if (dto.areasOfHelp !== undefined) updates['areas_of_help'] = dto.areasOfHelp;
  if (dto.mentorAvailable !== undefined) updates['mentor_available'] = dto.mentorAvailable;

  // Branch point 3 (plan §1): paid mentoring types are rejected outright
  // under Contact Sharing — not just disabled client-side.
  if (dto.mentoringType !== undefined) {
    if (dto.mentoringType !== 'free_chat' && !isChatModel()) {
      throw new AppError(400, 'Paid mentoring is not available', 'STUDENT_CONNECT_PAID_MENTORING_DISABLED');
    }
    updates['mentoring_type'] = dto.mentoringType;
  }

  if (Object.keys(updates).length === 0) return mapProfileRow(existing);

  const [row] = await db('student_profiles').where({ user_id: userId }).update(updates).returning('*');
  await logAudit(userId, 'STUDENT_PROFILE_UPDATED', { fields: Object.keys(updates) }, 'student_profiles', row['id'] as string);
  return mapProfileRow(row as Record<string, unknown>);
}

// ============================================================
// Discover search — query contract matches STUDENT_CONNECT_SPEC.md §8.5
// ============================================================
export async function searchStudents(viewerId: string, query: SearchStudentsQueryDtoType) {
  const { q, countryId, studyLevel, language, verifiedOnly, mentorOnly, freeOnly, page, limit } = query;
  const offset = (page - 1) * limit;

  function applyFilters(qb: Knex.QueryBuilder): void {
    qb.where('sp.is_active', true).whereNot('sp.user_id', viewerId);
    qb.whereNotExists(function (this: Knex.QueryBuilder) {
      this.select(1).from('student_blocks as b').whereRaw(
        '(b.blocker_user_id = ? AND b.blocked_user_id = sp.user_id) OR (b.blocker_user_id = sp.user_id AND b.blocked_user_id = ?)',
        [viewerId, viewerId],
      );
    });
    if (countryId) qb.where('sp.country_id', countryId);
    if (studyLevel) qb.where('sp.study_level', studyLevel);
    if (language) qb.whereRaw('? = ANY(sp.languages)', [language]);
    if (verifiedOnly) qb.where('sp.verification_status', 'verified');
    if (mentorOnly) qb.where('sp.mentor_available', true);
    if (freeOnly) qb.where('sp.mentor_available', true).where('sp.mentoring_type', 'free_chat');
    if (q) {
      qb.where((b) => {
        b.whereILike('sp.first_name', `%${q}%`)
          .orWhereILike('sp.course', `%${q}%`)
          .orWhereILike('univ.name', `%${q}%`);
      });
    }
  }

  const baseQuery = () => db('student_profiles as sp')
    .leftJoin('master_universities as univ', 'sp.university_id', 'univ.id')
    .leftJoin('master_countries as c', 'sp.country_id', 'c.id');

  const dataQuery = baseQuery()
    .select('sp.*', 'univ.name as university_name', 'c.name as country_name')
    .orderBy('sp.created_at', 'desc')
    .limit(limit)
    .offset(offset);
  const countQuery = baseQuery().count({ total: '*' });
  applyFilters(dataQuery);
  applyFilters(countQuery);

  const [rows, countRows] = await Promise.all([dataQuery, countQuery]);
  const total = Number((countRows[0] as { total: string | number })?.total ?? 0);

  const userIds = (rows as Array<Record<string, unknown>>).map((r) => r['user_id'] as string);
  const [connectionRows, savedRows] = userIds.length
    ? await Promise.all([
      db('student_connections')
        .where((b) => b.where('user_a_id', viewerId).orWhere('user_b_id', viewerId))
        .andWhere((b) => b.whereIn('user_a_id', userIds).orWhereIn('user_b_id', userIds)),
      db('student_saved_profiles').where({ user_id: viewerId }).whereIn('saved_user_id', userIds),
    ])
    : [[], []];

  const connectedUserIds = new Set<string>();
  (connectionRows as Array<Record<string, unknown>>).forEach((c) => {
    const other = c['user_a_id'] === viewerId ? c['user_b_id'] : c['user_a_id'];
    connectedUserIds.add(other as string);
  });
  const savedUserIds = new Set((savedRows as Array<Record<string, unknown>>).map((s) => s['saved_user_id'] as string));

  const data = (rows as Array<Record<string, unknown>>).map((r) => ({
    ...mapProfileRow(r),
    universityName: r['university_name'] ?? r['university_free_text'],
    countryName: r['country_name'],
    isConnected: connectedUserIds.has(r['user_id'] as string),
    isSaved: savedUserIds.has(r['user_id'] as string),
  }));

  return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
}

// ============================================================
// Public profile view — the privacy mechanism itself (plan §1 branch 2).
// ============================================================
export async function getPublicProfile(viewerId: string, targetUserId: string) {
  const row = await db('student_profiles as sp')
    .leftJoin('master_universities as univ', 'sp.university_id', 'univ.id')
    .leftJoin('master_countries as c', 'sp.country_id', 'c.id')
    .where('sp.user_id', targetUserId)
    .select('sp.*', 'univ.name as university_name', 'c.name as country_name')
    .first() as Record<string, unknown> | undefined;
  if (!row) throw new AppError(404, 'Student profile not found', 'STUDENT_PROFILE_NOT_FOUND');

  const connected = await areConnected(viewerId, targetUserId);
  const isSavedRow = await db('student_saved_profiles').where({ user_id: viewerId, saved_user_id: targetUserId }).first();

  const shaped: Record<string, unknown> = {
    ...mapProfileRow(row),
    universityName: row['university_name'] ?? row['university_free_text'],
    countryName: row['country_name'],
    isConnected: connected,
    isSaved: !!isSavedRow,
  };

  if (isChatModel()) {
    // Never returned under this model, connected or not.
    shaped['chatUnlocked'] = connected;
  } else if (connected) {
    const user = await db('users').where({ id: targetUserId }).select('email', 'phone_no').first() as
      { email: string | null; phone_no: string | null } | undefined;
    shaped['email'] = user?.email ?? null;
    shaped['phone'] = user?.phone_no ?? null;
  }

  return shaped;
}

// ============================================================
// Connection request lifecycle
// ============================================================
export async function createConnectionRequest(fromUserId: string, dto: CreateConnectionRequestDtoType) {
  if (dto.toUserId === fromUserId) {
    throw new AppError(400, 'Cannot send a connection request to yourself', 'STUDENT_CONNECT_SELF_REQUEST');
  }

  const blocked = await db('student_blocks')
    .where((b) => b.where({ blocker_user_id: fromUserId, blocked_user_id: dto.toUserId })
      .orWhere({ blocker_user_id: dto.toUserId, blocked_user_id: fromUserId }))
    .first();
  if (blocked) throw new AppError(403, 'Cannot send a request to this user', 'STUDENT_CONNECT_BLOCKED');

  if (await areConnected(fromUserId, dto.toUserId)) {
    throw new AppError(409, 'Already connected', 'STUDENT_CONNECT_ALREADY_CONNECTED');
  }

  const existingPending = await db('student_connection_requests')
    .where({ from_user_id: fromUserId, to_user_id: dto.toUserId, status: 'pending' })
    .first();
  if (existingPending) throw new AppError(409, 'Request already pending', 'STUDENT_CONNECT_REQUEST_PENDING');

  const [row] = await db('student_connection_requests')
    .insert({ from_user_id: fromUserId, to_user_id: dto.toUserId, message: dto.message, status: 'pending' })
    .returning('*');

  const senderProfile = await db('student_profiles').where({ user_id: fromUserId }).select('first_name').first() as
    { first_name: string } | undefined;
  await notificationsService.create(
    dto.toUserId,
    'STUDENT_CONNECTION_REQUEST',
    `${senderProfile?.first_name ?? 'A student'} sent you a connection request.`,
    row['id'] as string,
  );
  await logAudit(fromUserId, 'STUDENT_CONNECTION_REQUEST_SENT', { toUserId: dto.toUserId }, 'student_connection_requests', row['id'] as string);

  return mapConnectionRequestRow(row as Record<string, unknown>);
}

export async function listConnectionRequests(userId: string) {
  const [received, sent] = await Promise.all([
    db('student_connection_requests as r')
      .join('student_profiles as sp', 'r.from_user_id', 'sp.user_id')
      .where('r.to_user_id', userId)
      .orderBy('r.created_at', 'desc')
      .select('r.*', 'sp.first_name', 'sp.course'),
    db('student_connection_requests as r')
      .join('student_profiles as sp', 'r.to_user_id', 'sp.user_id')
      .where('r.from_user_id', userId)
      .orderBy('r.created_at', 'desc')
      .select('r.*', 'sp.first_name', 'sp.course'),
  ]);

  return {
    received: (received as Array<Record<string, unknown>>).map((r) => ({
      ...mapConnectionRequestRow(r), firstName: r['first_name'], course: r['course'],
    })),
    sent: (sent as Array<Record<string, unknown>>).map((r) => ({
      ...mapConnectionRequestRow(r), firstName: r['first_name'], course: r['course'],
    })),
  };
}

export async function acceptConnectionRequest(userId: string, requestId: string) {
  const request = await db('student_connection_requests').where({ id: requestId }).first() as Record<string, unknown> | undefined;
  if (!request) throw new AppError(404, 'Request not found', 'STUDENT_CONNECT_REQUEST_NOT_FOUND');
  if (request['to_user_id'] !== userId) throw new AppError(403, 'Not your request to accept', 'FORBIDDEN');
  if (request['status'] !== 'pending') throw new AppError(409, 'Request already actioned', 'STUDENT_CONNECT_REQUEST_ALREADY_ACTIONED');

  const fromUserId = request['from_user_id'] as string;
  const [userA, userB] = [fromUserId, userId].sort();

  // Branch point 4 (plan §1): one extra insert when the chat model is on,
  // in the same transaction as the connection itself.
  const connection = await db.transaction(async (trx) => {
    await trx('student_connection_requests').where({ id: requestId }).update({ status: 'accepted', responded_at: trx.fn.now() });
    const [row] = await trx('student_connections').insert({ user_a_id: userA, user_b_id: userB }).returning('*');
    if (isChatModel()) {
      await trx('student_chat_threads').insert({ connection_id: row['id'] });
    }
    return row as Record<string, unknown>;
  });

  const accepterProfile = await db('student_profiles').where({ user_id: userId }).select('first_name').first() as
    { first_name: string } | undefined;
  await notificationsService.create(
    fromUserId,
    'STUDENT_CONNECTION_ACCEPTED',
    `${accepterProfile?.first_name ?? 'A student'} accepted your connection request.`,
    connection['id'] as string,
  );
  await logAudit(userId, 'STUDENT_CONNECTION_ACCEPTED', { requestId }, 'student_connections', connection['id'] as string);

  return mapConnectionRow(connection);
}

export async function declineConnectionRequest(userId: string, requestId: string) {
  const request = await db('student_connection_requests').where({ id: requestId }).first() as Record<string, unknown> | undefined;
  if (!request) throw new AppError(404, 'Request not found', 'STUDENT_CONNECT_REQUEST_NOT_FOUND');
  if (request['to_user_id'] !== userId) throw new AppError(403, 'Not your request to decline', 'FORBIDDEN');
  if (request['status'] !== 'pending') throw new AppError(409, 'Request already actioned', 'STUDENT_CONNECT_REQUEST_ALREADY_ACTIONED');

  await db('student_connection_requests').where({ id: requestId }).update({ status: 'declined', responded_at: db.fn.now() });
  await logAudit(userId, 'STUDENT_CONNECTION_DECLINED', { requestId }, 'student_connection_requests', requestId);
  return { message: 'Request declined' };
}

export async function listConnections(userId: string) {
  const rows = await db('student_connections as c')
    .where((b) => b.where('c.user_a_id', userId).orWhere('c.user_b_id', userId))
    .select('c.*') as Array<Record<string, unknown>>;

  const otherUserIds = rows.map((r) => (r['user_a_id'] === userId ? r['user_b_id'] : r['user_a_id']) as string);
  const profiles = otherUserIds.length
    ? await db('student_profiles').whereIn('user_id', otherUserIds).select('user_id', 'first_name', 'course')
    : [];
  const profileByUserId = new Map((profiles as Array<Record<string, unknown>>).map((p) => [p['user_id'], p]));

  return rows.map((r) => {
    const otherUserId = (r['user_a_id'] === userId ? r['user_b_id'] : r['user_a_id']) as string;
    const profile = profileByUserId.get(otherUserId);
    return {
      ...mapConnectionRow(r),
      otherUserId,
      firstName: profile?.['first_name'] ?? null,
      course: profile?.['course'] ?? null,
    };
  });
}

// ============================================================
// Saved profiles
// ============================================================
export async function toggleSavedProfile(userId: string, savedUserId: string) {
  const existing = await db('student_saved_profiles').where({ user_id: userId, saved_user_id: savedUserId }).first() as
    Record<string, unknown> | undefined;

  if (existing) {
    await db('student_saved_profiles').where({ id: existing['id'] as string }).delete();
    await logAudit(userId, 'STUDENT_SAVED_TOGGLED', { savedUserId, action: 'unsaved' }, 'student_saved_profiles', existing['id'] as string);
    return { saved: false };
  }

  const [row] = await db('student_saved_profiles').insert({ user_id: userId, saved_user_id: savedUserId }).returning('*');
  await logAudit(userId, 'STUDENT_SAVED_TOGGLED', { savedUserId, action: 'saved' }, 'student_saved_profiles', row['id'] as string);
  return { saved: true };
}

export async function listSavedProfiles(userId: string) {
  const rows = await db('student_saved_profiles as s')
    .join('student_profiles as sp', 's.saved_user_id', 'sp.user_id')
    .where('s.user_id', userId)
    .orderBy('s.created_at', 'desc')
    .select('sp.*');
  return (rows as Array<Record<string, unknown>>).map((r) => mapProfileRow(r));
}

// ============================================================
// Report / Block
// ============================================================
export async function createReport(reporterId: string, dto: CreateStudentReportDtoType) {
  const [row] = await db('student_reports')
    .insert({
      reporter_user_id: reporterId,
      target_user_id: dto.targetUserId,
      message_id: dto.messageId ?? null,
      reason: dto.reason,
      status: 'open',
    })
    .returning('*');

  await logAudit(reporterId, 'STUDENT_REPORT_FILED', { targetUserId: dto.targetUserId, reason: dto.reason }, 'student_reports', row['id'] as string);
  return { id: row['id'], status: row['status'] };
}

export async function blockUser(userId: string, blockedUserId: string) {
  if (userId === blockedUserId) throw new AppError(400, 'Cannot block yourself', 'STUDENT_CONNECT_SELF_BLOCK');

  await db('student_blocks')
    .insert({ blocker_user_id: userId, blocked_user_id: blockedUserId })
    .onConflict(['blocker_user_id', 'blocked_user_id'])
    .ignore();

  // Cancel any pending request between the pair, either direction — a
  // block should sever an in-flight request, not leave it dangling.
  await db('student_connection_requests')
    .where({ status: 'pending' })
    .andWhere((b) => b.where({ from_user_id: userId, to_user_id: blockedUserId })
      .orWhere({ from_user_id: blockedUserId, to_user_id: userId }))
    .update({ status: 'declined', responded_at: db.fn.now() });

  await logAudit(userId, 'STUDENT_USER_BLOCKED', { blockedUserId }, 'student_blocks', blockedUserId);
  return { message: 'User blocked' };
}

// ============================================================
// Chat (Model B only) — every function starts with assertChatModelEnabled()
// ============================================================
async function assertThreadParticipant(userId: string, threadId: string): Promise<Record<string, unknown>> {
  const thread = await db('student_chat_threads as t')
    .join('student_connections as c', 't.connection_id', 'c.id')
    .where('t.id', threadId)
    .select('c.user_a_id', 'c.user_b_id')
    .first() as Record<string, unknown> | undefined;
  if (!thread) throw new AppError(404, 'Thread not found', 'STUDENT_CONNECT_THREAD_NOT_FOUND');
  if (thread['user_a_id'] !== userId && thread['user_b_id'] !== userId) {
    throw new AppError(403, 'Not a participant in this thread', 'FORBIDDEN');
  }
  return thread;
}

export async function listChatThreads(userId: string) {
  assertChatModelEnabled();

  const threads = await db('student_chat_threads as t')
    .join('student_connections as c', 't.connection_id', 'c.id')
    .where((b) => b.where('c.user_a_id', userId).orWhere('c.user_b_id', userId))
    .select('t.id as thread_id', 'c.user_a_id', 'c.user_b_id') as Array<Record<string, unknown>>;

  const results = await Promise.all(threads.map(async (t) => {
    const otherUserId = (t['user_a_id'] === userId ? t['user_b_id'] : t['user_a_id']) as string;
    const [profile, lastMessage, unreadRow] = await Promise.all([
      db('student_profiles').where({ user_id: otherUserId }).select('first_name', 'course').first() as
        Promise<{ first_name: string; course: string } | undefined>,
      db('student_chat_messages').where({ thread_id: t['thread_id'] }).orderBy('created_at', 'desc').first() as
        Promise<{ body: string; created_at: string } | undefined>,
      db('student_chat_messages')
        .where({ thread_id: t['thread_id'], read_at: null })
        .andWhereNot('sender_user_id', userId)
        .count({ total: '*' })
        .first() as Promise<{ total: string | number } | undefined>,
    ]);

    return {
      id: t['thread_id'],
      otherUserId,
      firstName: profile?.first_name ?? null,
      course: profile?.course ?? null,
      lastMessagePreview: lastMessage?.body ?? null,
      lastMessageAt: lastMessage?.created_at ?? null,
      unreadCount: Number(unreadRow?.total ?? 0),
    };
  }));

  return results.sort((a, b) => {
    const at = a.lastMessageAt ? new Date(a.lastMessageAt as string).getTime() : 0;
    const bt = b.lastMessageAt ? new Date(b.lastMessageAt as string).getTime() : 0;
    return bt - at;
  });
}

export async function listChatMessages(userId: string, threadId: string, query: ListChatMessagesQueryDtoType) {
  assertChatModelEnabled();
  await assertThreadParticipant(userId, threadId);

  const qb = db('student_chat_messages').where({ thread_id: threadId }).orderBy('created_at', 'desc').limit(query.limit ?? 30);
  if (query.before) qb.andWhere('created_at', '<', query.before);
  const rows = await qb;

  return (rows as Array<Record<string, unknown>>).reverse().map(mapChatMessageRow);
}

export async function sendChatMessage(userId: string, threadId: string, text: string) {
  assertChatModelEnabled();
  const thread = await assertThreadParticipant(userId, threadId);
  const recipientId = (thread['user_a_id'] === userId ? thread['user_b_id'] : thread['user_a_id']) as string;

  const [row] = await db('student_chat_messages')
    .insert({ thread_id: threadId, sender_user_id: userId, body: text })
    .returning('*');

  const senderProfile = await db('student_profiles').where({ user_id: userId }).select('first_name').first() as
    { first_name: string } | undefined;
  await notificationsService.create(
    recipientId,
    'STUDENT_CHAT_MESSAGE',
    `${senderProfile?.first_name ?? 'A student'} sent you a message.`,
    threadId,
  );
  await logAudit(userId, 'STUDENT_CHAT_MESSAGE_SENT', {}, 'student_chat_messages', row['id'] as string);

  return mapChatMessageRow(row as Record<string, unknown>);
}

export async function markThreadRead(userId: string, threadId: string) {
  assertChatModelEnabled();
  await assertThreadParticipant(userId, threadId);

  await db('student_chat_messages')
    .where({ thread_id: threadId, read_at: null })
    .andWhereNot('sender_user_id', userId)
    .update({ read_at: db.fn.now() });

  return { message: 'Marked as read' };
}

// ============================================================
// Admin — same router/file, inline authorize('ADMIN'), matching every
// other module's convention (no /api/admin namespace exists in this repo).
// ============================================================
export async function listVerificationQueue(page: number, limit: number) {
  const offset = (page - 1) * limit;

  const [rows, countRows] = await Promise.all([
    db('student_profiles as sp')
      .join('users as u', 'sp.user_id', 'u.id')
      .leftJoin('master_universities as univ', 'sp.university_id', 'univ.id')
      .where('sp.verification_status', 'pending')
      .orderBy('sp.created_at', 'asc')
      .limit(limit)
      .offset(offset)
      .select('sp.*', 'u.display_name', 'u.avatar', 'univ.name as university_name'),
    db('student_profiles').where('verification_status', 'pending').count({ total: '*' }),
  ]);
  const total = Number((countRows[0] as { total: string | number })?.total ?? 0);

  return {
    data: (rows as Array<Record<string, unknown>>).map((r) => ({
      ...mapProfileRow(r),
      displayName: r['display_name'],
      avatar: r['avatar'],
      universityName: r['university_name'] ?? r['university_free_text'],
    })),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

export async function getVerificationQueueCount() {
  const [{ total }] = await db('student_profiles').where('verification_status', 'pending').count({ total: '*' });
  return { count: Number(total) };
}

export async function approveVerification(userId: string, adminId: string) {
  const profile = await db('student_profiles').where({ user_id: userId }).first() as Record<string, unknown> | undefined;
  if (!profile) throw new AppError(404, 'Student profile not found', 'STUDENT_PROFILE_NOT_FOUND');

  await db('student_profiles').where({ user_id: userId }).update({ verification_status: 'verified', last_rejection_reason: null });
  await notificationsService.create(
    userId,
    'STUDENT_VERIFICATION_APPROVED',
    'Your student verification has been approved — the Verified Student badge is now live.',
  );
  await logAudit(adminId, 'STUDENT_VERIFICATION_APPROVED', {}, 'student_profiles', profile['id'] as string);
  return { message: 'Verification approved' };
}

export async function rejectVerification(userId: string, adminId: string, reason: string) {
  const profile = await db('student_profiles').where({ user_id: userId }).first() as Record<string, unknown> | undefined;
  if (!profile) throw new AppError(404, 'Student profile not found', 'STUDENT_PROFILE_NOT_FOUND');

  await db('student_profiles').where({ user_id: userId }).update({ last_rejection_reason: reason });
  await notificationsService.create(
    userId,
    'STUDENT_VERIFICATION_REJECTED',
    `More information is needed to verify your student profile: ${reason}`,
  );
  await logAudit(adminId, 'STUDENT_VERIFICATION_REJECTED', { reason }, 'student_profiles', profile['id'] as string);
  return { message: 'Marked as needing more information' };
}

export async function getThreadForModeration(adminId: string, threadId: string) {
  assertChatModelEnabled();
  const thread = await db('student_chat_threads').where({ id: threadId }).first();
  if (!thread) throw new AppError(404, 'Thread not found', 'STUDENT_CONNECT_THREAD_NOT_FOUND');

  const messages = await db('student_chat_messages').where({ thread_id: threadId }).orderBy('created_at', 'asc');
  await logAudit(adminId, 'STUDENT_CHAT_THREAD_VIEWED_BY_ADMIN', {}, 'student_chat_threads', threadId);

  return (messages as Array<Record<string, unknown>>).map(mapChatMessageRow);
}
