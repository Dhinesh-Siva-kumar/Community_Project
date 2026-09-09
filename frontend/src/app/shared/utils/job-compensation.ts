import type { Job } from '../../core/models';
import { getCurrencySymbol } from '../constants/currencies';

/**
 * One-line compensation string for a job card, detail view, or the admin
 * approval preview — the single place this formatting logic lives, so the
 * three consumers can never drift out of sync the way duplicated
 * `getSalaryDisplay()` copies in the user/admin pages used to.
 *
 * Returns `''` when there is nothing to show (no legacy string, no
 * structured min/max) — callers gate the whole salary row/chip on a
 * truthy result, so an empty compensation stays invisible rather than
 * rendering a confusing "Not specified" chip.
 */
export function formatCompensation(
  job: Pick<Job, 'salaryHidden' | 'salaryType' | 'salaryMin' | 'salaryMax' | 'salaryCurrency' | 'salary'>,
  t: (key: string, params?: Record<string, unknown>) => string,
): string {
  if (job.salaryHidden) return t('jobs.value.notDisclosed');
  if (job.salaryType === 'Negotiable') return t('jobs.value.negotiable');

  const sym = getCurrencySymbol(job.salaryCurrency);
  const period = job.salaryType ? ` / ${job.salaryType}` : '';
  const { salaryMin: min, salaryMax: max } = job;

  if (min != null && max != null) {
    // min === max is a single fixed figure, not a meaningful range — an
    // en-dash to itself would read as a typo, not a salary.
    return min === max
      ? `${sym}${min.toLocaleString()}${period}`
      : `${sym}${min.toLocaleString()} – ${sym}${max.toLocaleString()}${period}`;
  }
  if (min != null) return t('jobs.value.salaryFrom', { amount: `${sym}${min.toLocaleString()}${period}` });
  if (max != null) return t('jobs.value.salaryUpTo', { amount: `${sym}${max.toLocaleString()}${period}` });

  return job.salary ?? '';
}
