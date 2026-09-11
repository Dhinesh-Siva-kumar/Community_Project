/**
 * Shared Event date/time display formatting — consolidates what used to be
 * near-identical `to12h`/`formatEventTime` private methods duplicated across
 * event-form-modal.component.ts, admin/events.component.ts,
 * user/events.component.ts and event-detail.component.ts.
 */

/** "09:11" -> "9:11 AM" */
export function to12h(time24: string): string {
  const [h, m] = time24.split(':').map(Number);
  if (isNaN(h) || isNaN(m)) return time24;
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

/** "9:11 AM" or "9:11 AM – 11:12 AM" — start (and optional end) time only,
 * no timezone appended (display the timezone as its own separate field
 * where one is needed, rather than folding it into this string). */
export function formatEventTimeRange(eventTime?: string | null, eventEndTime?: string | null): string {
  if (!eventTime) return '';
  let text = to12h(eventTime);
  if (eventEndTime) text += ' – ' + to12h(eventEndTime);
  return text;
}

/** "Thu · 24 Sep · 6:00 AM" — the compact single-line card summary: short
 * weekday, day + short month, and start time, each separated by " · "
 * (never concatenated raw). Any missing part (e.g. no start time yet) is
 * simply omitted rather than leaving a dangling separator. Used consistently
 * for Online, Offline, and Hybrid cards alike — this doesn't depend on mode.
 *
 * Reads the calendar date via UTC components rather than the browser's
 * local time: event_date is stored as the intended calendar date at UTC
 * midnight (see events.service.ts), so extracting it through the viewer's
 * local timezone could otherwise shift the displayed day by one for anyone
 * in a negative UTC-offset zone, even though nothing about the event's own
 * date actually changed.
 */
export function eventCardDateTimeLabel(evt: { eventDate: string; eventTime?: string | null }): string {
  const d = new Date(evt.eventDate);
  if (isNaN(d.getTime())) return '';
  const weekday = new Intl.DateTimeFormat(undefined, { weekday: 'short', timeZone: 'UTC' }).format(d);
  const dayMonth = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(d);
  const time = evt.eventTime ? to12h(evt.eventTime) : '';
  return [weekday, dayMonth, time].filter(Boolean).join(' · ');
}
