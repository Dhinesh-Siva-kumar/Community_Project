/**
 * Structured opening hours — the shape stored in
 * `businesses.opening_hours_json`, plus the conversions that keep the two
 * legacy free-text columns (`opening_days`, `opening_hours`) in sync with it.
 *
 * Those legacy columns are still written on every create/update so the
 * list cards, the admin table and anything else reading them keeps working
 * unchanged; the JSON is the source of truth going forward.
 */

export const DAY_KEYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'] as const;
export type DayKey = (typeof DAY_KEYS)[number];

/** Canonical Mon→Sun full names — what the legacy `opening_days` CSV holds. */
export const DAY_NAMES: Record<DayKey, string> = {
  MON: 'Monday',
  TUE: 'Tuesday',
  WED: 'Wednesday',
  THU: 'Thursday',
  FRI: 'Friday',
  SAT: 'Saturday',
  SUN: 'Sunday',
};

export interface OpeningHoursDay {
  /** 24h `HH:mm`. */
  open: string;
  /** 24h `HH:mm`. May be earlier than `open` for an overnight range. */
  close: string;
  /**
   * Display-only flag. A 24-hour day still stores a real 00:00–23:59
   * range so the SQL open-check needs no special case.
   */
  is24h?: boolean;
}

export interface OpeningHoursJson {
  mode: 'SAME' | 'PER_DAY';
  days: Partial<Record<DayKey, OpeningHoursDay>>;
}

/** Selected days in canonical Mon→Sun order. */
export function selectedDayKeys(json: OpeningHoursJson): DayKey[] {
  return DAY_KEYS.filter((k) => json.days[k]);
}

/**
 * Legacy `opening_days` CSV — always emitted in canonical Mon→Sun order
 * because the Angular day pills prefix-match this string.
 */
export function formatLegacyDays(json: OpeningHoursJson): string {
  return selectedDayKeys(json).map((k) => DAY_NAMES[k]).join(',');
}

/**
 * Legacy `opening_hours` summary string.
 *
 * SAME mode reproduces the exact old shape ("9:00 AM – 5:00 PM") so
 * existing rows and newly saved ones are indistinguishable to any consumer
 * still reading this column. PER_DAY collapses to the widest span across
 * the selected days, since one string can't express more than that.
 */
export function formatLegacyHours(json: OpeningHoursJson): string {
  const days = selectedDayKeys(json).map((k) => json.days[k]!);
  if (days.length === 0) return '';

  // A full-day business would otherwise read as "12:00 AM – 11:59 PM", which
  // is technically right and useless to a reader.
  if (days.every((d) => d.is24h)) return 'Open 24 hours';

  const open = days.reduce((min, d) => (d.open < min ? d.open : min), days[0].open);
  const close = days.reduce((max, d) => (d.close > max ? d.close : max), days[0].close);
  return `${to12h(open)} – ${to12h(close)}`;
}

/** "09:00" → "9:00 AM" */
export function to12h(time24: string): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(time24.trim());
  if (!m) return '';
  const h = Number(m[1]);
  const period = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 || 12}:${m[2]} ${period}`;
}

/** "9:00 AM" → "09:00". Also accepts an already-24h "09:00". */
export function to24h(time: string): string | null {
  const t = time.trim().toUpperCase();

  const withPeriod = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/.exec(t);
  if (withPeriod) {
    let h = Number(withPeriod[1]);
    if (h > 12) return null;
    if (withPeriod[3] === 'PM' && h !== 12) h += 12;
    if (withPeriod[3] === 'AM' && h === 12) h = 0;
    return `${String(h).padStart(2, '0')}:${withPeriod[2]}`;
  }

  const bare = /^(\d{1,2}):(\d{2})$/.exec(t);
  if (bare) {
    const h = Number(bare[1]);
    const min = Number(bare[2]);
    if (h > 23 || min > 59) return null;
    return `${String(h).padStart(2, '0')}:${bare[2]}`;
  }

  return null;
}

/**
 * Best-effort reconstruction of the structured shape from the two legacy
 * columns, so editing a business created before this feature pre-fills the
 * hours editor instead of presenting an empty required field.
 *
 * Returns null when either side is unusable — the caller then shows an
 * empty editor rather than inventing times that were never entered.
 */
export function parseLegacyOpeningHours(
  openingDays: string | null | undefined,
  openingHours: string | null | undefined,
): OpeningHoursJson | null {
  const keys = parseLegacyDays(openingDays);
  if (keys.length === 0) return null;

  const range = parseLegacyHoursRange(openingHours);
  if (!range) return null;

  const days: Partial<Record<DayKey, OpeningHoursDay>> = {};
  for (const k of keys) days[k] = { ...range };

  // The legacy columns can only ever express one range shared by every
  // day, which is exactly what SAME mode means.
  return { mode: 'SAME', days };
}

/** "Monday,Wednesday" → ['MON','WED'], in canonical Mon→Sun order. */
export function parseLegacyDays(openingDays: string | null | undefined): DayKey[] {
  if (!openingDays) return [];
  const tokens = openingDays.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  return DAY_KEYS.filter((k) => {
    const name = DAY_NAMES[k].toLowerCase();
    // Tolerates both full names and the 3-letter abbreviations older
    // free-typed values sometimes used.
    return tokens.some((t) => t === name || (t.length >= 3 && name.startsWith(t)));
  });
}

/** "9:00 AM – 5:00 PM" / "24/7" → { open, close, is24h? } */
function parseLegacyHoursRange(openingHours: string | null | undefined): OpeningHoursDay | null {
  if (!openingHours) return null;
  const raw = openingHours.trim();

  if (/^(24\s*\/\s*7|24\s*hours?|open\s*24)/i.test(raw)) {
    return { open: '00:00', close: '23:59', is24h: true };
  }

  // Accepts en-dash, em-dash, hyphen or "to" as the separator, and either
  // 12h ("9:00 AM") or bare 24h ("09:00") on each side.
  const match = /(\d{1,2}:\d{2}\s*(?:[AP]M)?)\s*(?:[–—-]|to)\s*(\d{1,2}:\d{2}\s*(?:[AP]M)?)/i.exec(raw);
  if (!match) return null;

  const open = to24h(match[1]);
  const close = to24h(match[2]);
  if (!open || !close) return null;

  const is24h = open === '00:00' && (close === '23:59' || close === '23:30');
  return is24h ? { open: '00:00', close: '23:59', is24h: true } : { open, close };
}
