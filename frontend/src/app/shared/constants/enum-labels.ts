// ─────────────────────────────────────────────────────────────
// DISPLAY LABELS FOR STORED ENUM VALUES
//
// Values like 'Full-time', 'Remote' or 'PENDING' are part of the API
// contract — they are what gets persisted and filtered on, so they must stay
// exactly as they are. These maps give each one a catalog key so the *display*
// can follow the language toggle while the stored value never changes.
//
// Use via `| enumLabel:'<group>'` in templates, or `enumLabelKey()` in
// TypeScript (filter chips, option arrays).
// ─────────────────────────────────────────────────────────────

export type EnumGroup =
  | 'jobType'
  | 'workMode'
  | 'shiftType'
  | 'salaryType'
  | 'education'
  | 'eventMode'
  | 'approvalStatus'
  | 'activeStatus'
  | 'role';

const P = 'enums.';

export const ENUM_LABELS: Record<EnumGroup, Record<string, string>> = {
  jobType: {
    'Full-time':  P + 'jobType.fullTime',
    'Part-time':  P + 'jobType.partTime',
    'Contract':   P + 'jobType.contract',
    'Freelance':  P + 'jobType.freelance',
    'Internship': P + 'jobType.internship',
    'Temporary':  P + 'jobType.temporary',
  },
  workMode: {
    'Remote':  P + 'workMode.remote',
    'Hybrid':  P + 'workMode.hybrid',
    'On-site': P + 'workMode.onSite',
  },
  shiftType: {
    'Day':        P + 'shiftType.day',
    'Night':      P + 'shiftType.night',
    'Rotational': P + 'shiftType.rotational',
    'Flexible':   P + 'shiftType.flexible',
  },
  salaryType: {
    'Fixed':   P + 'salaryType.fixed',
    'Hourly':  P + 'salaryType.hourly',
    'Monthly': P + 'salaryType.monthly',
    'Annual':  P + 'salaryType.annual',
  },
  education: {
    'None':       P + 'education.none',
    '8th':        P + 'education.8th',
    '10th':       P + 'education.10th',
    '12th':       P + 'education.12th',
    'Diploma':    P + 'education.diploma',
    'ITI':        P + 'education.iti',
    'Any':        P + 'education.any',
    "Bachelor's": P + 'education.bachelors',
    "Master's":   P + 'education.masters',
    'PhD':        P + 'education.phd',
  },
  eventMode: {
    'Offline': P + 'eventMode.offline',
    'Online':  P + 'eventMode.online',
    'Hybrid':  P + 'eventMode.hybrid',
  },
  approvalStatus: {
    'PENDING':  P + 'approvalStatus.pending',
    'APPROVED': P + 'approvalStatus.approved',
    'REJECTED': P + 'approvalStatus.rejected',
  },
  activeStatus: {
    'active':   P + 'activeStatus.active',
    'inactive': P + 'activeStatus.inactive',
    'true':     P + 'activeStatus.active',
    'false':    P + 'activeStatus.inactive',
  },
  role: {
    'ADMIN': P + 'role.admin',
    'USER':  P + 'role.user',
  },
};

/**
 * Catalog key for a stored value, or the value itself when it is not a known
 * member of the group — unknown values then render as-is rather than
 * disappearing.
 */
export function enumLabelKey(group: EnumGroup, value: string | null | undefined): string {
  if (value === null || value === undefined || value === '') return '';
  return ENUM_LABELS[group][value] ?? String(value);
}

/** Options for a select, with stored values and translatable label keys. */
export function enumSelectOptions(group: EnumGroup, values?: readonly string[]) {
  const source = values ?? Object.keys(ENUM_LABELS[group]);
  return source.map((value) => ({ value, label: enumLabelKey(group, value) }));
}
