import db from '../../config/db';
import { AppError } from '../../middleware/errorHandler';
import { deleteUploadedFile, deleteUploadedFiles } from '../../services/upload-storage.service';
import { logAudit } from '../../services/audit.service';
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
  if (data.isRemote    !== undefined) m['is_remote']    = data.isRemote    ?? false;
  if (data.workMode    !== undefined) m['work_mode']    = data.workMode    ?? null;

  // Role
  if (data.expMin    !== undefined) m['exp_min']   = data.expMin    ?? null;
  if (data.expMax    !== undefined) m['exp_max']   = data.expMax    ?? null;
  if (data.education !== undefined) m['education'] = data.education ?? null;
  if (data.openings  !== undefined) m['openings']  = data.openings  ?? null;
  if (data.shiftType !== undefined) m['shift_type'] = data.shiftType ?? null;

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

/** Reshape a raw DB row (snake_case) → camelCase response object */
function shapeJob(j: Record<string, unknown>, user: Record<string, unknown>) {
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

    // Role
    expMin:    j['exp_min'],
    expMax:    j['exp_max'],
    education: j['education'],
    openings:  j['openings'],
    shiftType: j['shift_type'],

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
export async function findAll(params: ListJobsQueryDtoType & { skipActiveFilter?: boolean; userId?: string }) {
  const {
    pincode, page, limit, search,
    country, state, city,
    jobType, workMode, shiftType, education,
    expMin, expMax,
    salaryMin, salaryMax, salaryHidden,
    postedWithin, dateFrom, dateTo, status, approvalStatus, sortBy, skipActiveFilter, userId,
  } = params;
  const offset = (page - 1) * limit;

  const query = db('jobs as j')
    .join('users as u', 'j.user_id', 'u.id')
    .select('j.*', 'u.id as uid', 'u.user_name', 'u.display_name', 'u.avatar');

  const countQuery = db('jobs');

  // Admin callers set skipActiveFilter=true to see inactive jobs too,
  // unless they've explicitly picked a status to filter by below.
  if (!skipActiveFilter) {
    query.where('j.is_active', true);
    countQuery.where({ is_active: true });
  }
  if (status) {
    const isActive = status === 'active';
    query.andWhere('j.is_active', isActive);
    countQuery.andWhere('is_active', isActive);
  }

  // ── Moderation status — non-owner/non-admin callers only ever see
  // APPROVED jobs; skipActiveFilter=true (admin browse, or the caller's own
  // "mine" list) bypasses this the same way it already bypasses the
  // is_active filter above.
  if (!skipActiveFilter) {
    query.where('j.status', 'APPROVED');
    countQuery.where('status', 'APPROVED');
  }
  if (approvalStatus?.length) {
    query.whereIn('j.status', approvalStatus);
    countQuery.whereIn('status', approvalStatus);
  }
  if (userId) { query.andWhere('j.user_id', userId); countQuery.andWhere('user_id', userId); }

  // ── Helper to apply the same condition to both queries ──────
  const addFilter = (queryFn: (q: typeof query) => void, countFn: (q: typeof countQuery) => void) => {
    queryFn(query);
    countFn(countQuery);
  };

  // ── Pincode (exact match) ────────────────────────────────────
  if (pincode) {
    addFilter(
      q => q.andWhere('j.pincode', pincode),
      q => q.andWhere({ pincode }),
    );
  }

  // ── Text search (ILIKE across key fields) ────────────────────
  if (search) {
    const term = `%${search}%`;
    query.andWhere(function () {
      this.whereILike('j.title', term)
        .orWhereILike('j.company_name', term)
        .orWhereILike('j.description', term)
        .orWhereILike('j.specification', term);
    });
    countQuery.andWhere(function () {
      this.whereILike('title', term)
        .orWhereILike('company_name', term)
        .orWhereILike('description', term)
        .orWhereILike('specification', term);
    });
  }

  // ── Location filters (case-insensitive) ──────────────────────
  if (country) {
    addFilter(
      q => q.andWhereILike('j.country', `%${country}%`),
      q => q.andWhereILike('country', `%${country}%`),
    );
  }
  if (state) {
    addFilter(
      q => q.andWhereILike('j.state', `%${state}%`),
      q => q.andWhereILike('state', `%${state}%`),
    );
  }
  if (city) {
    addFilter(
      q => q.andWhereILike('j.city', `%${city}%`),
      q => q.andWhereILike('city', `%${city}%`),
    );
  }

  // ── Exact enum filters ───────────────────────────────────────
  if (jobType) {
    addFilter(
      q => q.andWhere('j.job_type', jobType),
      q => q.andWhere({ job_type: jobType }),
    );
  }
  if (workMode) {
    addFilter(
      q => q.andWhere('j.work_mode', workMode),
      q => q.andWhere({ work_mode: workMode }),
    );
  }
  if (shiftType) {
    addFilter(
      q => q.andWhere('j.shift_type', shiftType),
      q => q.andWhere({ shift_type: shiftType }),
    );
  }
  if (education) {
    addFilter(
      q => q.andWhere('j.education', education),
      q => q.andWhere({ education }),
    );
  }

  // ── Salary visibility ────────────────────────────────────────
  if (salaryHidden !== undefined) {
    addFilter(
      q => q.andWhere('j.salary_hidden', salaryHidden),
      q => q.andWhere({ salary_hidden: salaryHidden }),
    );
  }

  // ── Experience range ─────────────────────────────────────────
  if (expMin != null) {
    addFilter(
      q => q.andWhere(function () {
        this.whereNull('j.exp_min').orWhere('j.exp_min', '>=', expMin);
      }),
      q => q.andWhere(function () {
        this.whereNull('exp_min').orWhere('exp_min', '>=', expMin);
      }),
    );
  }
  if (expMax != null) {
    addFilter(
      q => q.andWhere(function () {
        this.whereNull('j.exp_max').orWhere('j.exp_max', '<=', expMax);
      }),
      q => q.andWhere(function () {
        this.whereNull('exp_max').orWhere('exp_max', '<=', expMax);
      }),
    );
  }

  // ── Salary range ─────────────────────────────────────────────
  if (salaryMin != null) {
    addFilter(
      q => q.andWhere(function () {
        this.whereNull('j.salary_min').orWhere('j.salary_min', '>=', salaryMin);
      }),
      q => q.andWhere(function () {
        this.whereNull('salary_min').orWhere('salary_min', '>=', salaryMin);
      }),
    );
  }
  if (salaryMax != null) {
    addFilter(
      q => q.andWhere(function () {
        this.whereNull('j.salary_max').orWhere('j.salary_max', '<=', salaryMax);
      }),
      q => q.andWhere(function () {
        this.whereNull('salary_max').orWhere('salary_max', '<=', salaryMax);
      }),
    );
  }

  // ── Posted within N days ─────────────────────────────────────
  if (postedWithin) {
    addFilter(
      q => q.andWhereRaw(`j.created_at >= NOW() - INTERVAL '${Number(postedWithin)} days'`),
      q => q.andWhereRaw(`created_at >= NOW() - INTERVAL '${Number(postedWithin)} days'`),
    );
  }

  // ── Explicit date range ───────────────────────────────────────
  if (dateFrom) {
    addFilter(
      q => q.andWhere('j.created_at', '>=', dateFrom),
      q => q.andWhere('created_at', '>=', dateFrom),
    );
  }
  if (dateTo) {
    const toEnd = `${dateTo}T23:59:59.999Z`;
    addFilter(
      q => q.andWhere('j.created_at', '<=', toEnd),
      q => q.andWhere('created_at', '<=', toEnd),
    );
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

  const countQuery = db('jobs').where({ status: 'PENDING' });

  if (search) {
    const term = `%${search}%`;
    query.andWhere(function () { this.whereILike('j.title', term).orWhereILike('j.company_name', term); });
    countQuery.andWhere(function () { this.whereILike('title', term).orWhereILike('company_name', term); });
  }
  if (country) {
    query.andWhereILike('j.country', `%${country}%`);
    countQuery.andWhereILike('country', `%${country}%`);
  }
  if (dateFrom) {
    query.andWhere('j.created_at', '>=', dateFrom);
    countQuery.andWhere('created_at', '>=', dateFrom);
  }
  if (dateTo) {
    const toEnd = `${dateTo}T23:59:59.999Z`;
    query.andWhere('j.created_at', '<=', toEnd);
    countQuery.andWhere('created_at', '<=', toEnd);
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
