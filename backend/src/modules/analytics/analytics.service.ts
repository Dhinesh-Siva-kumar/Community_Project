import db from '../../config/db';
import { AppError } from '../../middleware/errorHandler';
import type { AnalyticsOverviewQueryDtoType } from './analytics.dto';

type Granularity = AnalyticsOverviewQueryDtoType['granularity'];

const GRANULARITY_STEP: Record<Granularity, { unit: string; step: string }> = {
  daily:   { unit: 'day',   step: '1 day' },
  weekly:  { unit: 'week',  step: '7 days' },
  monthly: { unit: 'month', step: '1 month' },
  yearly:  { unit: 'year',  step: '1 year' },
};

const MAX_RANGE_DAYS = 1096; // ~3 years

interface Bucket { bucket: string; count: number }
interface Series { labels: string[]; data: number[] }

// Zero-fills every bucket in range via generate_series + LEFT JOIN, so
// gaps (no rows that period) come back as 0 instead of being omitted —
// and bucket boundaries are computed by Postgres itself (DATE_TRUNC),
// guaranteeing alignment with however the DB defines "week"/"month" starts.
async function bucketedSeries(
  table: string,
  granularity: Granularity,
  startDate: string,
  endDate: string,
  extraOn?: string,
): Promise<Bucket[]> {
  const { unit, step } = GRANULARITY_STEP[granularity];
  const onExtra = extraOn ? `AND ${extraOn}` : '';
  const result = await db.raw(
    `SELECT gs.bucket AS bucket, COUNT(t.id) AS count
     FROM generate_series(DATE_TRUNC(?, ?::timestamp), DATE_TRUNC(?, ?::timestamp), ?::interval) AS gs(bucket)
     LEFT JOIN ${table} t ON DATE_TRUNC(?, t.created_at) = gs.bucket ${onExtra}
     GROUP BY gs.bucket
     ORDER BY gs.bucket`,
    [unit, startDate, unit, endDate, step, unit],
  );
  return (result.rows as Array<{ bucket: string; count: string }>).map((r) => ({
    bucket: r.bucket,
    count: Number(r.count),
  }));
}

function toSeries(rows: Bucket[]): Series {
  return { labels: rows.map((r) => r.bucket), data: rows.map((r) => r.count) };
}

export async function getOverview(params: AnalyticsOverviewQueryDtoType) {
  const { granularity } = params;

  const toDate = params.to ? new Date(params.to + 'T00:00:00.000Z') : new Date();
  const fromDate = params.from
    ? new Date(params.from + 'T00:00:00.000Z')
    : new Date(new Date().setDate(new Date().getDate() - 29));

  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
    throw new AppError(400, 'Invalid date range', 'INVALID_DATE_RANGE');
  }
  if (fromDate > toDate) throw new AppError(400, '"from" date must be before "to" date', 'FROM_DATE_MUST_BEFORE');

  const rangeDays = Math.round((toDate.getTime() - fromDate.getTime()) / 86_400_000);
  if (rangeDays > MAX_RANGE_DAYS) {
    throw new AppError(400, `Date range cannot exceed ${MAX_RANGE_DAYS} days`, 'DATE_RANGE_TOO_LARGE');
  }

  const startDate = fromDate.toISOString();
  const endDate = toDate.toISOString().slice(0, 10) + 'T23:59:59.999Z';

  const [
    userGrowthRows,
    businessGrowthRows,
    jobPostedRows,
    postsRows,
    commentsRows,
    likesRows,
    [{ today }],
    [{ thisWeek }],
    [{ thisMonth }],
    countryRows,
    [{ active: jobsActive }],
    [{ total: jobsTotal }],
    [{ active: bizActive }],
    [{ verified: bizVerified }],
    [{ total: bizTotal }],
    [{ eligible }],
    [{ returned }],
  ] = await Promise.all([
    bucketedSeries('users', granularity, startDate, endDate),
    bucketedSeries('businesses', granularity, startDate, endDate),
    bucketedSeries('jobs', granularity, startDate, endDate),
    bucketedSeries('posts', granularity, startDate, endDate),
    bucketedSeries('comments', granularity, startDate, endDate),
    bucketedSeries('likes', granularity, startDate, endDate),
    db('users').where('last_active_at', '>=', db.raw("NOW() - INTERVAL '1 day'")).count({ today: '*' }),
    db('users').where('last_active_at', '>=', db.raw("NOW() - INTERVAL '7 days'")).count({ thisWeek: '*' }),
    db('users').where('last_active_at', '>=', db.raw("NOW() - INTERVAL '30 days'")).count({ thisMonth: '*' }),
    db('users').select('country').count({ count: '*' }).whereNotNull('country').groupBy('country').orderBy('count', 'desc'),
    db('jobs').where({ is_active: true }).count({ active: '*' }),
    db('jobs').count({ total: '*' }),
    db('businesses').where({ is_active: true }).count({ active: '*' }),
    db('businesses').where({ status: 'APPROVED' }).count({ verified: '*' }),
    db('businesses').count({ total: '*' }),
    // Retention cohort: users who registered more than 30 days ago.
    db('users').where('created_at', '<=', db.raw("NOW() - INTERVAL '30 days'")).count({ eligible: '*' }),
    // ...of that cohort, how many have been active in the last 30 days.
    db('users')
      .where('created_at', '<=', db.raw("NOW() - INTERVAL '30 days'"))
      .andWhere('last_active_at', '>=', db.raw("NOW() - INTERVAL '30 days'"))
      .count({ returned: '*' }),
  ]);

  const retentionEligible = Number(eligible);
  const retentionReturned = Number(returned);
  const retentionRate = retentionEligible > 0
    ? Math.round((retentionReturned / retentionEligible) * 1000) / 10
    : 0;

  return {
    granularity,
    range: { from: fromDate.toISOString().slice(0, 10), to: toDate.toISOString().slice(0, 10) },

    userGrowth: toSeries(userGrowthRows),

    activeUsers: {
      today: Number(today),
      thisWeek: Number(thisWeek),
      thisMonth: Number(thisMonth),
    },

    countryDistribution: (countryRows as Array<{ country: string; count: string }>).map((r) => ({
      country: r.country,
      count: Number(r.count),
    })),

    jobActivity: {
      posted: toSeries(jobPostedRows),
      active: Number(jobsActive),
      inactive: Number(jobsTotal) - Number(jobsActive),
    },

    businessGrowth: {
      registered: toSeries(businessGrowthRows),
      verified: Number(bizVerified),
      active: Number(bizActive),
      total: Number(bizTotal),
    },

    communityEngagement: {
      posts: toSeries(postsRows),
      comments: toSeries(commentsRows),
      reactions: toSeries(likesRows),
    },

    retentionRate: {
      rate: retentionRate,
      eligible: retentionEligible,
      returned: retentionReturned,
    },
  };
}
