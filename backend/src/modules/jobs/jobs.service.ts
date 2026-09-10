import type { Knex } from 'knex';
import db from '../../config/db';
import { AppError } from '../../middleware/errorHandler';
import { deleteUploadedFile, deleteUploadedFiles } from '../../services/upload-storage.service';
import { logAudit } from '../../services/audit.service';
import { getViewerScope, applyJobVisibilityRestriction } from '../../services/job-visibility.service';
import * as notificationsService from '../notifications/notifications.service';
import type { CreateJobDtoType, UpdateJobDtoType, ListJobsQueryDtoType } from './jobs.dto';

async function notifyAdminsOfPendingJob(jobId: string, title: string): Promise<void> {
  const admins = await db('users').where({ role: 'ADMIN' }).select('id');
  if (!admins.length) return;
  const message = `New job "${title}" pending approval.`;
  await Promise.all(
    (admins as Array<Record<string, unknown>>).map((admin) =>
      notificationsService.create(admin['id'] as string, 'JOB_PENDING', message, jobId),
    ),
  );
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

/** Map camelCase DTO → snake_case DB column for all new fields */
function mapNewFields(data: Partial<CreateJobDtoType>): Record<string, unknown> {
  const m: Record<string, unknown> = {};

  // Company
  if (data.companyName    !== undefined) m['company_name']    = data.companyName    ?? null;
  if (data.companyLogo    !== undefined) m['company_logo']    = data.companyLogo    ?? null;
  if (data.companyWebsite !== undefined) m['company_website'] = data.companyWebsite ?? null;

  // Location
  if (data.city        !== undefined) m['city']         = data.city        ?? null;
  if (data.state       !== undefined) m['state']        = data.state       ?? null;
  if (data.fullAddress !== undefined) m['full_address'] = data.fullAddress ?? null;
  if (data.countryId   !== undefined) m['country_id']   = data.countryId   ?? null;
  if (data.stateId     !== undefined) m['state_id']     = data.stateId     ?? null;
  if (data.cityId      !== undefined) m['city_id']      = data.cityId      ?? null;
  if (data.visibilityType !== undefined) m['visibility_type'] = data.visibilityType;

  // Work Mode drives is_remote and the physical-location fields, not the
  // other way around — the two used to be independently settable in the
  // frontend form and could silently drift apart (confirmed against real
  // data: several jobs had work_mode='On-site' with is_remote=true, so
  // their cards/detail wrongly showed "Remote"). Whenever workMode is part
  // of this payload it's treated as authoritative: is_remote is derived
  // from it, and Remote additionally clears any physical-location details
  // so a stale on-site address can never linger under a Remote job.
  // `country`/`country_id` are deliberately left untouched even for
  // Remote — they drive the separate applicant-country eligibility
  // restriction ("Germany applicants only"), which is independent of Work
  // Mode and must keep working the same regardless of it.
  if (data.workMode !== undefined) {
    m['work_mode'] = data.workMode ?? null;
    m['is_remote'] = data.workMode === 'Remote';
    if (data.workMode === 'Remote') {
      m['city'] = null;
      m['state'] = null;
      m['state_id'] = null;
      m['city_id'] = null;
      m['full_address'] = null;
      m['pincode'] = null;
      m['location'] = null;
    }
  } else if (data.isRemote !== undefined) {
    // No workMode in this payload (e.g. a partial update that doesn't
    // touch it) — fall back to whatever isRemote was explicitly sent.
    m['is_remote'] = data.isRemote ?? false;
  }

  // Role
  if (data.expMin    !== undefined) m['exp_min']   = data.expMin    ?? null;
  if (data.expMax    !== undefined) m['exp_max']   = data.expMax    ?? null;
  if (data.education !== undefined) m['education'] = data.education ?? null;
  if (data.openings  !== undefined) m['openings']  = data.openings  ?? null;
  if (data.shiftType !== undefined) m['shift_type'] = data.shiftType ?? null;
  if (data.visaSponsorship   !== undefined) m['visa_sponsorship']   = data.visaSponsorship   ?? 'Not Specified';
  if (data.referralAvailable !== undefined) m['referral_available'] = data.referralAvailable ?? false;
  // '' clears the deadline (null); any other value is stored as-is.
  if (data.applicationDeadline !== undefined) m['application_deadline'] = data.applicationDeadline || null;

  // Salary
  if (data.salaryMin      !== undefined) m['salary_min']      = data.salaryMin      ?? null;
  if (data.salaryMax      !== undefined) m['salary_max']      = data.salaryMax      ?? null;
  if (data.salaryType     !== undefined) m['salary_type']     = data.salaryType     ?? null;
  if (data.salaryCurrency !== undefined) m['salary_currency'] = data.salaryCurrency ?? null;
  if (data.salaryHidden   !== undefined) m['salary_hidden']   = data.salaryHidden   ?? false;

  // Schedule
  if (data.workStartTime !== undefined) m['work_start_time'] = data.workStartTime ?? null;
  if (data.workEndTime   !== undefined) m['work_end_time']   = data.workEndTime   ?? null;
  if (data.workingDays   !== undefined) m['working_days']    = data.workingDays   ?? [];

  // Contact
  if (data.contactPerson  !== undefined) m['contact_person']  = data.contactPerson  ?? null;
  if (data.contactEmail   !== undefined) m['contact_email']   = data.contactEmail   ?? null;
  if (data.contactPhone   !== undefined) m['contact_phone']   = data.contactPhone   ?? null;
  if (data.applicationUrl !== undefined) m['application_url'] = data.applicationUrl ?? null;

  // Content
  if (data.skills          !== undefined) m['skills']      = data.skills ?? [];
  if (data.description     !== undefined) m['description'] = data.description ?? null;
  if (data.responsibilities !== undefined) m['responsibilities'] = data.responsibilities ?? null;
  if (data.qualifications   !== undefined) m['qualifications']   = data.qualifications   ?? null;
  if (data.requirements     !== undefined) m['requirements']     = data.requirements     ?? null;
  if (data.benefits         !== undefined) m['benefits']         = data.benefits         ?? null;

  return m;
}

const CLOSING_SOON_WINDOW_MS = 3 * 24 * 60 * 60 * 1000; // 3 days

/**
 * `isExpired`/`isClosingSoon` are computed here — server-side, on every
 * response that carries a job — rather than left for each client to work
 * out from the raw deadline. That's what makes the deadline "respected by
 * backend logic" in a way a client can't just lie to itself about: the
 * canonical answer always comes from the API, not from trusting whatever
 * date math a caller happens to run locally.
 */
function computeDeadlineStatus(deadline: unknown): { isExpired: boolean; isClosingSoon: boolean } {
  if (!deadline) return { isExpired: false, isClosingSoon: false };
  const deadlineMs = new Date(deadline as string).getTime();
  if (Number.isNaN(deadlineMs)) return { isExpired: false, isClosingSoon: false };
  const msRemaining = deadlineMs - Date.now();
  return {
    isExpired: msRemaining < 0,
    isClosingSoon: msRemaining >= 0 && msRemaining <= CLOSING_SOON_WINDOW_MS,
  };
}

/** Reshape a raw DB row (snake_case) → camelCase response object */
function shapeJob(j: Record<string, unknown>, user: Record<string, unknown>) {
  const deadlineStatus = computeDeadlineStatus(j['application_deadline']);
  return {
    id: j['id'],
    title: j['title'],
    specification: j['specification'],
    description:   j['description'],
    images:        j['images'],
    location:      j['location'],
    pincode:       j['pincode'],
    country:       j['country'],
    contactInfo:   j['contact_info'],
    salary:        j['salary'],
    jobType:       j['job_type'],
    timing:        j['timing'],
    isActive:      j['is_active'],
    status:        j['status'],
    rejectionReason: j['rejection_reason'] ?? null,
    createdAt:     j['created_at'],
    updatedAt:     j['updated_at'],
    userId:        j['user_id'],

    // Company
    companyName:    j['company_name'],
    companyLogo:    j['company_logo'],
    companyWebsite: j['company_website'],

    // Location
    city:        j['city'],
    state:       j['state'],
    fullAddress: j['full_address'],
    isRemote:    j['is_remote'],
    workMode:    j['work_mode'],
    countryId:   j['country_id'],
    stateId:     j['state_id'],
    cityId:      j['city_id'],
    visibilityType: j['visibility_type'],

    // Role
    expMin:    j['exp_min'],
    expMax:    j['exp_max'],
    education: j['education'],
    openings:  j['openings'],
    shiftType: j['shift_type'],
    visaSponsorship:   j['visa_sponsorship'],
    referralAvailable: j['referral_available'],
    applicationDeadline: j['application_deadline'],
    isExpired:      deadlineStatus.isExpired,
    isClosingSoon:  deadlineStatus.isClosingSoon,

    // Salary
    salaryMin:      j['salary_min'],
    salaryMax:      j['salary_max'],
    salaryType:     j['salary_type'],
    salaryCurrency: j['salary_currency'],
    salaryHidden:   j['salary_hidden'],

    // Schedule
    workStartTime: j['work_start_time'],
    workEndTime:   j['work_end_time'],
    workingDays:   j['working_days'],

    // Contact
    contactPerson:  j['contact_person'],
    contactEmail:   j['contact_email'],
    contactPhone:   j['contact_phone'],
    applicationUrl: j['application_url'],

    // Content
    skills: j['skills'],
    // description is already mapped above in the legacy block
    responsibilities: j['responsibilities'],
    qualifications:   j['qualifications'],
    requirements:     j['requirements'],
    benefits:         j['benefits'],

    user,
  };
}

// ─────────────────────────────────────────────────────────────
// create
// ─────────────────────────────────────────────────────────────
export async function create(data: CreateJobDtoType, userId: string) {
  const caller = await db('users').where({ id: userId }).select('role', 'is_trusted', 'is_blocked').first() as Record<string, unknown> | undefined;
  const isAutoApproved = !!caller && caller['role'] === 'ADMIN';
  const status = isAutoApproved ? 'APPROVED' : 'PENDING';

  const [job] = await db('jobs')
    .insert({
      title:        data.title,
      specification: data.specification ?? null,
      description:   data.description   ?? null,
      images:        data.images         ?? [],
      location:      data.location       ?? null,
      pincode:       data.pincode        ?? null,
      country:       data.country        ?? 'United Kingdom',
      contact_info:  data.contactInfo    ?? null,
      salary:        data.salary         ?? null,
      job_type:      data.jobType        ?? null,
      timing:        data.timing         ?? null,
      user_id:       userId,
      status,
      ...mapNewFields(data),
    })
    .returning('*');

  const user = await db('users').where({ id: userId })
    .select('id', 'user_name', 'display_name', 'avatar').first() as Record<string, unknown>;

  if (status === 'PENDING') {
    await notifyAdminsOfPendingJob((job as Record<string, unknown>)['id'] as string, data.title);
  }

  await logAudit(userId, 'JOB_CREATED', { title: data.title, status }, 'jobs', (job as Record<string, unknown>)['id'] as string);

  return shapeJob(job as Record<string, unknown>, {
    id: user['id'], userName: user['user_name'],
    displayName: user['display_name'], avatar: user['avatar'],
  });
}

// ─────────────────────────────────────────────────────────────
// findAll
// ─────────────────────────────────────────────────────────────
type JobFilterParams = Pick<
  ListJobsQueryDtoType,
  'pincode' | 'search' | 'country' | 'state' | 'city' | 'countryIds' | 'stateId' | 'cityId'
  | 'visibilityType' | 'jobType' | 'workMode' | 'shiftType' | 'jobTypes' | 'workModes' | 'skills'
  | 'visaSponsorship' | 'referralAvailable'
  | 'education' | 'expMin' | 'expMax' | 'salaryMin' | 'salaryMax' | 'salaryHidden'
  | 'postedWithin' | 'dateFrom' | 'dateTo' | 'status' | 'approvalStatus' | 'postedBy'
> & { skipActiveFilter?: boolean; userId?: string };

/**
 * Every job list filter, written once with a `j.` prefix.
 *
 * Both the page query and the count query alias `jobs as j` — even though
 * the count query joins nothing — so each filter is applied to both from a
 * single definition and the rows returned can never drift from the `total`
 * reported alongside them. Mirrors `applyBusinessFilters` in
 * `business.service.ts`.
 */
function applyJobFilters(qb: Knex.QueryBuilder, params: JobFilterParams): void {
  const {
    skipActiveFilter, status, approvalStatus, userId, pincode, search,
    country, state, city, countryIds, stateId, cityId, visibilityType,
    jobType, workMode, shiftType, jobTypes, workModes, skills,
    visaSponsorship, referralAvailable, education,
    salaryHidden, expMin, expMax, salaryMin, salaryMax,
    postedWithin, dateFrom, dateTo, postedBy,
  } = params;

  // Admin callers set skipActiveFilter=true to see inactive jobs too,
  // unless they've explicitly picked a status to filter by below.
  if (!skipActiveFilter) qb.where('j.is_active', true);
  if (status) qb.andWhere('j.is_active', status === 'active');

  // ── Moderation status — non-owner/non-admin callers only ever see
  // APPROVED jobs; skipActiveFilter=true (admin browse, or the caller's own
  // "mine" list) bypasses this the same way it already bypasses the
  // is_active filter above.
  if (!skipActiveFilter) qb.where('j.status', 'APPROVED');
  if (approvalStatus?.length) qb.whereIn('j.status', approvalStatus);

  if (userId) qb.andWhere('j.user_id', userId);
  if (pincode) qb.andWhere('j.pincode', pincode);

  if (search) {
    const term = `%${search}%`;
    qb.andWhere(function () {
      this.whereILike('j.title', term)
        .orWhereILike('j.company_name', term)
        .orWhereILike('j.description', term)
        .orWhereILike('j.specification', term);
    });
  }

  if (country) qb.andWhereILike('j.country', `%${country}%`);
  if (state) qb.andWhereILike('j.state', `%${state}%`);
  if (city) qb.andWhereILike('j.city', `%${city}%`);
  if (countryIds) {
    const ids = countryIds.split(',').map((s) => Number(s.trim())).filter((n) => Number.isInteger(n) && n > 0);
    if (ids.length > 0) qb.whereIn('j.country_id', ids);
  }
  if (stateId) qb.andWhere('j.state_id', stateId);
  if (cityId) qb.andWhere('j.city_id', cityId);

  if (visibilityType) qb.andWhere('j.visibility_type', visibilityType);

  if (jobType) qb.andWhere('j.job_type', jobType);
  if (workMode) qb.andWhere('j.work_mode', workMode);
  if (shiftType) qb.andWhere('j.shift_type', shiftType);
  if (education) qb.andWhere('j.education', education);
  if (jobTypes) {
    const types = jobTypes.split(',').map((s) => s.trim()).filter(Boolean);
    if (types.length > 0) qb.whereIn('j.job_type', types);
  }
  if (workModes) {
    const modes = workModes.split(',').map((s) => s.trim()).filter(Boolean);
    if (modes.length > 0) qb.whereIn('j.work_mode', modes);
  }

  // Case-insensitive substring match against any stored skill — "react"
  // matches a job tagged "React.js", not just an exact "react" tag.
  if (skills) {
    qb.andWhereRaw(
      `EXISTS (SELECT 1 FROM unnest(j.skills) AS s WHERE s ILIKE ?)`,
      [`%${skills.trim()}%`],
    );
  }

  if (visaSponsorship) qb.andWhere('j.visa_sponsorship', visaSponsorship);
  if (referralAvailable !== undefined) qb.andWhere('j.referral_available', referralAvailable);

  // Recruiter/poster search (admin) — a subquery rather than a join, so it
  // works identically on the joined `query` and the un-joined `countQuery`.
  if (postedBy) {
    const term = `%${postedBy}%`;
    qb.whereIn('j.user_id', function (this: Knex.QueryBuilder) {
      this.select('id').from('users').andWhere(function () {
        this.whereILike('user_name', term).orWhereILike('display_name', term);
      });
    });
  }

  if (salaryHidden !== undefined) qb.andWhere('j.salary_hidden', salaryHidden);

  if (expMin != null) {
    qb.andWhere(function () { this.whereNull('j.exp_min').orWhere('j.exp_min', '>=', expMin); });
  }
  if (expMax != null) {
    qb.andWhere(function () { this.whereNull('j.exp_max').orWhere('j.exp_max', '<=', expMax); });
  }
  if (salaryMin != null) {
    qb.andWhere(function () { this.whereNull('j.salary_min').orWhere('j.salary_min', '>=', salaryMin); });
  }
  if (salaryMax != null) {
    qb.andWhere(function () { this.whereNull('j.salary_max').orWhere('j.salary_max', '<=', salaryMax); });
  }

  if (postedWithin) qb.andWhereRaw(`j.created_at >= NOW() - INTERVAL '${Number(postedWithin)} days'`);
  if (dateFrom) qb.andWhere('j.created_at', '>=', dateFrom);
  if (dateTo) qb.andWhere('j.created_at', '<=', `${dateTo}T23:59:59.999Z`);
}

export async function findAll(
  params: ListJobsQueryDtoType & {
    skipActiveFilter?: boolean;
    /** Owner filter — restricts the list to one user's jobs ("mine"). */
    userId?: string;
    /** The signed-in caller, for the country/worldwide visibility gate. */
    viewerId?: string;
  },
) {
  const { page, limit, sortBy, skipActiveFilter, viewerId } = params;
  const offset = (page - 1) * limit;

  const query = db('jobs as j')
    .join('users as u', 'j.user_id', 'u.id')
    .select('j.*', 'u.id as uid', 'u.user_name', 'u.display_name', 'u.avatar');

  const countQuery = db('jobs as j');

  applyJobFilters(query, params);
  applyJobFilters(countQuery, params);

  // Country/worldwide visibility — lands on exactly the same callers as the
  // moderation gate above: admins and "mine" lists set skipActiveFilter and
  // are therefore exempt.
  if (!skipActiveFilter && viewerId) {
    const scope = await getViewerScope(viewerId);
    applyJobVisibilityRestriction(query, 'j.', viewerId, scope);
    applyJobVisibilityRestriction(countQuery, 'j.', viewerId, scope);
  }

  // ── Sorting ──────────────────────────────────────────────────
  switch (sortBy) {
    case 'oldest':          query.orderBy('j.created_at',   'asc');  break;
    case 'salary_high':     query.orderBy('j.salary_max',   'desc'); break;
    case 'salary_low':      query.orderBy('j.salary_min',   'asc');  break;
    case 'company_az':      query.orderBy('j.company_name', 'asc');  break;
    case 'title_az':        query.orderBy('j.title',        'asc');  break;
    case 'title_za':        query.orderBy('j.title',        'desc'); break;
    case 'location_az':     query.orderBy('j.city', 'asc').orderBy('j.country', 'asc'); break;
    case 'location_za':     query.orderBy('j.city', 'desc').orderBy('j.country', 'desc'); break;
    case 'type_az':         query.orderBy('j.job_type',     'asc');  break;
    case 'type_za':         query.orderBy('j.job_type',     'desc'); break;
    case 'status_active':   query.orderBy('j.is_active',    'desc'); break; // active jobs first
    case 'status_inactive': query.orderBy('j.is_active',    'asc');  break; // inactive jobs first
    case 'approval_az':     query.orderBy('j.status',       'asc');  break;
    case 'approval_za':     query.orderBy('j.status',       'desc'); break;
    default:                query.orderBy('j.created_at',   'desc'); // newest first
  }

  const [jobs, [{ total }]] = await Promise.all([
    query.limit(limit).offset(offset),
    countQuery.count({ total: '*' }),
  ]);

  const data = (jobs as Array<Record<string, unknown>>).map((j) =>
    shapeJob(j, {
      id: j['uid'], userName: j['user_name'],
      displayName: j['display_name'], avatar: j['avatar'],
    })
  );

  return { data, total: Number(total), page, limit, totalPages: Math.ceil(Number(total) / limit) };
}

// ─────────────────────────────────────────────────────────────
// findOne
// ─────────────────────────────────────────────────────────────
export async function findOne(id: string) {
  const job = await db('jobs as j')
    .join('users as u', 'j.user_id', 'u.id')
    .where('j.id', id)
    .select('j.*', 'u.id as uid', 'u.user_name', 'u.display_name', 'u.email as user_email', 'u.avatar')
    .first();

  if (!job) throw new AppError(404, 'Job not found', 'JOB_FOUND');

  const jb = job as Record<string, unknown>;
  return shapeJob(jb, {
    id: jb['uid'], userName: jb['user_name'],
    displayName: jb['display_name'], email: jb['user_email'], avatar: jb['avatar'],
  });
}

// ─────────────────────────────────────────────────────────────
// Moderation — pending queue / approve / reject
// ─────────────────────────────────────────────────────────────
export async function countPending() {
  const [{ count }] = await db('jobs').where({ status: 'PENDING' }).count({ count: '*' });
  return { count: Number(count) };
}

export interface FindPendingJobsOptions {
  page:     number;
  limit:    number;
  search?:  string;
  country?: string;
  dateFrom?: string;
  dateTo?:   string;
  sortBy?:  'joined' | 'name' | 'submitter' | 'country';
  sortDir?: 'asc' | 'desc';
}

export async function findPendingOnly(options: FindPendingJobsOptions) {
  const { page, limit, search, country, dateFrom, dateTo, sortBy = 'joined', sortDir = 'desc' } = options;
  const offset = (page - 1) * limit;

  const query = db('jobs as j')
    .join('users as u', 'j.user_id', 'u.id')
    .where('j.status', 'PENDING')
    .select('j.*', 'u.id as uid', 'u.user_name', 'u.display_name', 'u.avatar');

  const countQuery = db('jobs as j').where('j.status', 'PENDING');

  // Same single-definition treatment as findAll — the pending list only ever
  // needs this four-filter subset.
  for (const qb of [query, countQuery]) {
    if (search) {
      const term = `%${search}%`;
      qb.andWhere(function () { this.whereILike('j.title', term).orWhereILike('j.company_name', term); });
    }
    if (country) qb.andWhereILike('j.country', `%${country}%`);
    if (dateFrom) qb.andWhere('j.created_at', '>=', dateFrom);
    if (dateTo) qb.andWhere('j.created_at', '<=', `${dateTo}T23:59:59.999Z`);
  }

  const sortColumn = sortBy === 'name' ? 'j.title'
    : sortBy === 'submitter' ? 'u.display_name'
    : sortBy === 'country' ? 'j.country'
    : 'j.created_at';
  const [jobs, [{ total }]] = await Promise.all([
    query.orderBy(sortColumn, sortDir).limit(limit).offset(offset),
    countQuery.count({ total: '*' }),
  ]);

  const data = (jobs as Array<Record<string, unknown>>).map((j) =>
    shapeJob(j, { id: j['uid'], userName: j['user_name'], displayName: j['display_name'], avatar: j['avatar'] })
  );

  return { data, total: Number(total), page, limit, totalPages: Math.ceil(Number(total) / limit) };
}

export async function approve(id: string, adminId: string) {
  const job = await db('jobs').where({ id }).first() as Record<string, unknown> | undefined;
  if (!job) throw new AppError(404, 'Job not found', 'JOB_FOUND');

  if (job['status'] === 'APPROVED') return findOne(id);

  await db('jobs').where({ id }).update({ status: 'APPROVED' });
  await notificationsService.create(job['user_id'] as string, 'JOB_APPROVED', `Your job "${job['title']}" has been approved.`, id, undefined, { name: job['title'] });
  await logAudit(adminId, 'JOB_APPROVED', { previousStatus: job['status'], title: job['title'] }, 'jobs', id);
  return findOne(id);
}

// Rejecting permanently deletes the submission — there is no lingering
// REJECTED state to resubmit from. Use requestMoreInfo() below when the
// owner should be able to fix and resubmit instead.
export async function reject(id: string, adminId: string, reason?: string) {
  const job = await db('jobs').where({ id }).first() as Record<string, unknown> | undefined;
  if (!job) throw new AppError(404, 'Job not found', 'JOB_FOUND');

  const message = `Your job "${job['title']}" has been rejected.${reason ? ` Reason: ${reason}` : ''}`;
  await notificationsService.create(job['user_id'] as string, 'JOB_REJECTED', message);
  await logAudit(adminId, 'JOB_REJECTED', { previousStatus: job['status'], reason: reason ?? null, title: job['title'] }, 'jobs', id);

  await db('jobs').where({ id }).delete();
  deleteUploadedFiles(job['images']);
  deleteUploadedFile(job['company_logo']);

  return { message: 'Job rejected and removed' };
}

export async function requestMoreInfo(id: string, adminId: string, reason: string) {
  const job = await db('jobs').where({ id }).first() as Record<string, unknown> | undefined;
  if (!job) throw new AppError(404, 'Job not found', 'JOB_FOUND');

  await db('jobs').where({ id }).update({ status: 'NEEDS_INFO', rejection_reason: reason });
  const message = `More information is needed for your job "${job['title']}": ${reason}`;
  await notificationsService.create(job['user_id'] as string, 'JOB_NEEDS_INFO', message, id);
  await logAudit(adminId, 'JOB_NEEDS_INFO', { previousStatus: job['status'], reason, title: job['title'] }, 'jobs', id);
  return findOne(id);
}

// ─────────────────────────────────────────────────────────────
// update
// ─────────────────────────────────────────────────────────────
export async function update(id: string, data: UpdateJobDtoType, userId: string) {
  const job = await db('jobs').where({ id }).first() as Record<string, unknown> | undefined;
  if (!job) throw new AppError(404, 'Job not found', 'JOB_FOUND');

  const byAdmin = job['user_id'] !== userId;
  if (byAdmin) {
    const user = await db('users').where({ id: userId }).first() as Record<string, unknown> | undefined;
    if (!user || user['role'] !== 'ADMIN') throw new AppError(403, 'You can only update your own jobs', 'ONLY_UPDATE_OWN_JOBS');
  }

  const updateData: Record<string, unknown> = {};

  // Legacy fields
  if (data.title       !== undefined) updateData['title']        = data.title;
  if (data.specification !== undefined) updateData['specification'] = data.specification;
  if (data.description !== undefined) updateData['description']  = data.description;
  if (data.images      !== undefined) updateData['images']       = data.images;
  if (data.location    !== undefined) updateData['location']     = data.location;
  if (data.pincode     !== undefined) updateData['pincode']      = data.pincode;
  if (data.country     !== undefined) updateData['country']      = data.country;
  if (data.contactInfo !== undefined) updateData['contact_info'] = data.contactInfo;
  if (data.salary      !== undefined) updateData['salary']       = data.salary;
  if (data.jobType     !== undefined) updateData['job_type']     = data.jobType;
  if (data.timing      !== undefined) updateData['timing']       = data.timing;

  // New fields
  Object.assign(updateData, mapNewFields(data));

  // Resubmitting a rejected or needs-info job: the owner editing their own
  // job re-enters the approval gate exactly like a brand-new one, instead of
  // silently staying REJECTED/NEEDS_INFO after the edit.
  let reenteredPending = false;
  if (!byAdmin && (job['status'] === 'REJECTED' || job['status'] === 'NEEDS_INFO')) {
    const caller = await db('users').where({ id: userId }).select('role', 'is_trusted', 'is_blocked').first() as Record<string, unknown> | undefined;
    const isAutoApproved = !!caller && caller['role'] === 'ADMIN';
    updateData['status'] = isAutoApproved ? 'APPROVED' : 'PENDING';
    updateData['rejection_reason'] = null;
    reenteredPending = !isAutoApproved;
  }

  await db('jobs').where({ id }).update(updateData);

  if (reenteredPending) {
    await notifyAdminsOfPendingJob(id, (data.title as string | undefined) ?? (job['title'] as string));
  }

  if (data.images !== undefined) {
    const oldImages = Array.isArray(job['images']) ? (job['images'] as unknown[]) : [];
    const newImages = data.images ?? [];
    deleteUploadedFiles(oldImages.filter((img) => typeof img === 'string' && !newImages.includes(img)));
  }
  if (data.companyLogo !== undefined && job['company_logo'] !== data.companyLogo) {
    deleteUploadedFile(job['company_logo']);
  }

  await logAudit(userId, 'JOB_UPDATED', { byAdmin, fields: Object.keys(updateData) }, 'jobs', id);

  return findOne(id);
}

// ─────────────────────────────────────────────────────────────
// deleteJob
// ─────────────────────────────────────────────────────────────
export async function deleteJob(id: string, userId: string) {
  const job = await db('jobs').where({ id }).first() as Record<string, unknown> | undefined;
  if (!job) throw new AppError(404, 'Job not found', 'JOB_FOUND');

  const byAdmin = job['user_id'] !== userId;
  if (byAdmin) {
    const user = await db('users').where({ id: userId }).first() as Record<string, unknown> | undefined;
    if (!user || user['role'] !== 'ADMIN') throw new AppError(403, 'You can only delete your own jobs', 'ONLY_DELETE_OWN_JOBS');
  }

  await db('jobs').where({ id }).delete();
  deleteUploadedFiles(job['images']);
  deleteUploadedFile(job['company_logo']);
  await logAudit(userId, 'JOB_DELETED', { byAdmin, title: job['title'] }, 'jobs', id);
  if (byAdmin) {
    await notificationsService.create(
      job['user_id'] as string, 'JOB_REMOVED',
      `Your job "${job['title']}" was removed by an administrator.`,
    );
  }
  return { message: 'Job deleted successfully' };
}
