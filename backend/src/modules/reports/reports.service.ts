import db from '../../config/db';
import { AppError } from '../../middleware/errorHandler';
import { CreateReportDtoType } from './reports.dto';

export async function createReport(reporterId: string, dto: CreateReportDtoType) {
  if (dto.targetType === 'POST') {
    const post = await db('posts').where({ id: dto.targetId }).first();
    if (!post) throw new AppError(404, 'Post not found');
  }

  const [report] = await db('reports')
    .insert({
      reporter_id: reporterId,
      target_type: dto.targetType,
      target_id: dto.targetId,
      reason: dto.reason ?? null,
    })
    .returning('*');

  return report;
}

export async function countPending() {
  const [{ total }] = await db('reports').where({ status: 'PENDING' }).count({ total: '*' });
  return { count: Number(total) };
}
