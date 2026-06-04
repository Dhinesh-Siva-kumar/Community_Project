import db from '../../config/db';
import { AppError } from '../../middleware/errorHandler';
import type { CreateJobDtoType, UpdateJobDtoType, ListJobsQueryDtoType } from './jobs.dto';

export async function create(data: CreateJobDtoType, userId: string) {
  const [job] = await db('jobs')
    .insert({
      title: data.title,
      specification: data.specification ?? null,
      description: data.description ?? null,
      images: data.images ?? [],
      location: data.location ?? null,
      pincode: data.pincode ?? null,
      country: data.country ?? 'United Kingdom',
      contact_info: data.contactInfo ?? null,
      salary: data.salary ?? null,
      job_type: data.jobType ?? null,
      timing: data.timing ?? null,
      user_id: userId,
    })
    .returning('*');

  const user = await db('users').where({ id: userId }).select('id', 'user_name', 'display_name', 'avatar').first();
  return { ...(job as Record<string, unknown>), user };
}

export async function findAll(params: ListJobsQueryDtoType) {
  const { pincode, page, limit, search } = params;
  const offset = (page - 1) * limit;

  const query = db('jobs as j')
    .join('users as u', 'j.user_id', 'u.id')
    .where('j.is_active', true)
    .select('j.*', 'u.id as uid', 'u.user_name', 'u.display_name', 'u.avatar');

  const countQuery = db('jobs').where({ is_active: true });

  if (pincode) { query.andWhere('j.pincode', pincode); countQuery.andWhere({ pincode }); }
  if (search) {
    query.andWhere(function () {
      this.whereILike('j.title', `%${search}%`)
        .orWhereILike('j.description', `%${search}%`)
        .orWhereILike('j.specification', `%${search}%`);
    });
    countQuery.andWhere(function () {
      this.whereILike('title', `%${search}%`)
        .orWhereILike('description', `%${search}%`)
        .orWhereILike('specification', `%${search}%`);
    });
  }

  const [jobs, [{ total }]] = await Promise.all([
    query.orderBy('j.created_at', 'desc').limit(limit).offset(offset),
    countQuery.count({ total: '*' }),
  ]);

  const data = (jobs as Array<Record<string, unknown>>).map((j) => ({
    ...j,
    user: { id: j['uid'], userName: j['user_name'], displayName: j['display_name'], avatar: j['avatar'] },
  }));

  return { data, total: Number(total), page, limit, totalPages: Math.ceil(Number(total) / limit) };
}

export async function findOne(id: string) {
  const job = await db('jobs as j')
    .join('users as u', 'j.user_id', 'u.id')
    .where('j.id', id)
    .select('j.*', 'u.id as uid', 'u.user_name', 'u.display_name', 'u.email as user_email', 'u.avatar')
    .first();

  if (!job) throw new AppError(404, 'Job not found');

  const jb = job as Record<string, unknown>;
  return {
    ...jb,
    user: { id: jb['uid'], userName: jb['user_name'], displayName: jb['display_name'], email: jb['user_email'], avatar: jb['avatar'] },
  };
}

export async function update(id: string, data: UpdateJobDtoType, userId: string) {
  const job = await db('jobs').where({ id }).first() as Record<string, unknown> | undefined;
  if (!job) throw new AppError(404, 'Job not found');

  if (job['user_id'] !== userId) {
    const user = await db('users').where({ id: userId }).first() as Record<string, unknown> | undefined;
    if (!user || user['role'] !== 'ADMIN') throw new AppError(403, 'You can only update your own jobs');
  }

  const updateData: Record<string, unknown> = {};
  if (data.title !== undefined) updateData['title'] = data.title;
  if (data.specification !== undefined) updateData['specification'] = data.specification;
  if (data.description !== undefined) updateData['description'] = data.description;
  if (data.images !== undefined) updateData['images'] = data.images;
  if (data.location !== undefined) updateData['location'] = data.location;
  if (data.pincode !== undefined) updateData['pincode'] = data.pincode;
  if (data.country !== undefined) updateData['country'] = data.country;
  if (data.contactInfo !== undefined) updateData['contact_info'] = data.contactInfo;
  if (data.salary !== undefined) updateData['salary'] = data.salary;
  if (data.jobType !== undefined) updateData['job_type'] = data.jobType;
  if (data.timing !== undefined) updateData['timing'] = data.timing;

  await db('jobs').where({ id }).update(updateData);
  return findOne(id);
}

export async function deleteJob(id: string, userId: string) {
  const job = await db('jobs').where({ id }).first() as Record<string, unknown> | undefined;
  if (!job) throw new AppError(404, 'Job not found');

  if (job['user_id'] !== userId) {
    const user = await db('users').where({ id: userId }).first() as Record<string, unknown> | undefined;
    if (!user || user['role'] !== 'ADMIN') throw new AppError(403, 'You can only delete your own jobs');
  }

  await db('jobs').where({ id }).delete();
  return { message: 'Job deleted successfully' };
}
