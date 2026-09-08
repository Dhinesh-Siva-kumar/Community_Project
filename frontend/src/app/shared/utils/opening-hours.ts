import type { OpeningDayKey, OpeningHoursDay, OpeningHoursJson } from '../../core/models';

/**
 * Client-side mirror of the backend's `opening-hours.util.ts`.
 *
 * Kept in step with it deliberately: the editor needs to reconstruct
 * structured hours from the two legacy free-text columns when editing an
 * older business, and the display component needs the same 12-hour
 * formatting the API writes into `openingHours`.
 */

export const DAY_KEYS: readonly OpeningDayKey[] = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

/** Canonical Mon→Sun full names — what the legacy `openingDays` CSV holds. */
export const DAY_NAMES: Record<OpeningDayKey, string> = {
  MON: 'Monday',
  TUE: 'Tuesday',
  WED: 'Wednesday',
  THU: 'Thursday',
  FRI: 'Friday',
  SAT: 'Saturday',
  SUN: 'Sunday',
};

/** i18n keys for the full day names. */
export const DAY_LABEL_KEYS: Record<OpeningDayKey, string> = {
  MON: 'components.businessForm.day.monday',
  TUE: 'components.businessForm.day.tuesday',
  WED: 'components.businessForm.day.wednesday',
  THU: 'components.businessForm.day.thursday',
  FRI: 'components.businessForm.day.friday',
  SAT: 'components.businessForm.day.saturday',
  SUN: 'components.businessForm.day.sunday',
};

/**
 * i18n keys for the short forms used on the day pills. Each abbreviation is
 * its own key rather than a 3-char slice — slicing a Tamil word would cut it
 * mid-grapheme.
 */
export const DAY_SHORT_KEYS: Record<OpeningDayKey, string> = {
  MON: 'components.calendar.weekday.mon',
  TUE: 'components.calendar.weekday.tue',
  WED: 'components.calendar.weekday.wed',
  THU: 'components.calendar.weekday.thu',
  FRI: 'components.calendar.weekday.fri',
  SAT: 'components.calendar.weekday.sat',
  SUN: 'components.calendar.weekday.sun',
};

/** Selected days in canonical Mon→Sun order. */
export function selectedDayKeys(json: OpeningHoursJson | null | undefined): OpeningDayKey[] {
  if (!json) return [];
  return DAY_KEYS.filter((k) => json.days[k]);
}

/** Legacy `openingDays` CSV, always in canonical Mon→Sun order. */
export function deriveLegacyDays(json: OpeningHoursJson | null | undefined): string {
  return selectedDayKeys(json).map((k) => DAY_NAMES[k]).join(',');
}

/** "09:00" → "9:00 AM" */
export function to12h(time24: string): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec((time24 ?? '').trim());
  if (!m) return '';
  const h = Number(m[1]);
  return `${h % 12 || 12}:${m[2]} ${h >= 12 ? 'PM' : 'AM'}`;
}

/** "9:00 AM" → "09:00". Also accepts an already-24h "09:00". */
export function to24h(time: string): string | null {
  const t = (time ?? '').trim().toUpperCase();

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

/** "9:00 AM – 5:00 PM" for one day's range. */
export function formatDayRange(day: OpeningHoursDay): string {
  return `${to12h(day.open)} – ${to12h(day.close)}`;
}

/**
 * Ultra-compact single-line form for a day-of-week mini grid, e.g. "9-1" for
 * 9:00 AM–1:00 PM — hour only, no minutes or AM/PM, matching how little
 * space a 7-column day strip has. "24h" for a full day.
 */
export function shortDayRange(day: OpeningHoursDay): string {
  if (day.is24h) return '24h';
  const h12 = (time: string): number => {
    const h = Number(time.split(':')[0]);
    return h % 12 || 12;
  };
  return `${h12(day.open)}-${h12(day.close)}`;
}

/** The legacy free-text shape a full-day business ends up with. */
const LEGACY_24H = /^\s*12:00\s*AM\s*[–—-]\s*11:(59|30)\s*PM\s*$/i;

/**
 * One-line opening-hours summary for a business card.
 *
 * Returns either a translation key (fixed phrases like "Open 24 hours" and
 * "Varies by day") or literal text (an actual time range) — never both — so
 * the caller can translate exactly what needs translating.
 *
 * `detail` is the full per-day breakdown, for a tooltip: a card has room for
 * one line, but a business whose hours vary shouldn't hide them entirely.
 */
export interface OpeningHoursSummary {
  key: string | null;
  text: string;
  detail: string;
}

export function openingHoursSummary(
  json: OpeningHoursJson | null | undefined,
  legacyHours: string | null | undefined,
  dayLabel: (key: OpeningDayKey) => string = (k) => DAY_NAMES[k],
): OpeningHoursSummary | null {
  const keys = selectedDayKeys(json);

  if (!keys.length) {
    // Un-migrated business: the raw legacy string is all there is. Still
    // catch the one shape that reads badly — a full day stored as a range.
    if (!legacyHours) return null;
    return LEGACY_24H.test(legacyHours)
      ? { key: 'components.openingHours.open24h', text: '', detail: '' }
      : { key: null, text: legacyHours, detail: legacyHours };
  }

  const days = keys.map((k) => json!.days[k]!);
  const detail = keys
    .map((k) => `${dayLabel(k)}: ${days[keys.indexOf(k)].is24h ? '24h' : formatDayRange(json!.days[k]!)}`)
    .join('\n');

  if (days.every((d) => d.is24h)) {
    return { key: 'components.openingHours.open24h', text: '', detail };
  }

  // Uniform hours (always true in SAME mode, and in PER_DAY when every day
  // happens to match) collapse to the single range they share.
  const first = days[0];
  const uniform = days.every((d) => d.open === first.open && d.close === first.close);
  return uniform
    ? { key: null, text: formatDayRange(first), detail }
    : { key: 'components.openingHours.variesByDay', text: '', detail };
}

/**
 * Best-effort reconstruction of structured hours from the two legacy
 * free-text fields, so editing a business created before this feature
 * pre-fills the editor instead of showing an empty required field.
 *
 * Returns null when either side is unusable — the caller then shows an empty
 * editor rather than inventing times that were never entered.
 */
export function parseLegacyOpeningHours(
  openingDays: string | null | undefined,
  openingHours: string | null | undefined,
): OpeningHoursJson | null {
  const keys = parseLegacyDays(openingDays);
  if (keys.length === 0) return null;

  const range = parseLegacyHoursRange(openingHours);
  if (!range) return null;

  const days: Partial<Record<OpeningDayKey, OpeningHoursDay>> = {};
  for (const k of keys) days[k] = { ...range };

  // The legacy fields can only express one range shared by every day —
  // which is exactly what SAME mode means.
  return { mode: 'SAME', days };
}

/** "Monday,Wednesday" → ['MON','WED'], in canonical Mon→Sun order. */
export function parseLegacyDays(openingDays: string | null | undefined): OpeningDayKey[] {
  if (!openingDays) return [];
  const tokens = openingDays.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  return DAY_KEYS.filter((k) => {
    const name = DAY_NAMES[k].toLowerCase();
    // Tolerates full names and the 3-letter abbreviations older free-typed
    // values sometimes used.
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

  // Accepts en-dash, em-dash, hyphen or "to" as the separator, with either
  // 12h ("9:00 AM") or bare 24h ("09:00") on each side.
  const match = /(\d{1,2}:\d{2}\s*(?:[AP]M)?)\s*(?:[–—-]|to)\s*(\d{1,2}:\d{2}\s*(?:[AP]M)?)/i.exec(raw);
  if (!match) return null;

  const open = to24h(match[1]);
  const close = to24h(match[2]);
  if (!open || !close) return null;

  const is24h = open === '00:00' && (close === '23:59' || close === '23:30');
  return is24h ? { open: '00:00', close: '23:59', is24h: true } : { open, close };
}

// ── "Open now", evaluated against the viewer's own clock ─────────────
//
// Businesses carry no timezone, so there is no honest server-side "now".
// Both the client-side badge and the server-side filter use the day and
// HH:mm the *viewer's device* reports, and the UI says so.

/** JS `getDay()` is 0=Sunday; the day keys run Mon→Sun. */
export function currentDayKey(now: Date = new Date()): OpeningDayKey {
  return DAY_KEYS[(now.getDay() + 6) % 7];
}

export function currentHHmm(now: Date = new Date()): string {
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

/** Mirrors the `business_is_open_at` SQL function, overnight ranges included. */
export function isOpenNow(json: OpeningHoursJson | null | undefined, now: Date = new Date()): boolean {
  if (!json) return false;
  const day = json.days[currentDayKey(now)];
  if (!day) return false;

  const t = currentHHmm(now);
  // Zero-padded HH:mm sorts lexicographically in chronological order.
  return day.open <= day.close
    ? t >= day.open && t <= day.close
    : t >= day.open || t <= day.close;
}
