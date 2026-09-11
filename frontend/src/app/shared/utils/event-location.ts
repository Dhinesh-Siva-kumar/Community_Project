/**
 * Shared Event location/mode/category display formatting — consolidates
 * what used to be byte-for-byte duplicated `formatEventAddress()` methods on
 * admin/events.component.ts and user/events.component.ts, and centralizes
 * the "Online events must never show a physical address" rule (previously
 * both list pages and the Event Details page called `formatEventAddress`
 * unconditionally, even for Online events) in one place instead of fixing
 * it separately in every component that displays a location.
 */

export interface EventLocationFields {
  eventMode?: string;
  visibilityType?: string;
  address?: string;
  location?: string;
  pincode?: string;
  country?: string;
}

/** "12 Main St, City Hall - 600001, India" — physical address only; callers
 * that need the Online-aware summary should use eventLocationSummary() below. */
export function formatEventAddress(evt: EventLocationFields): string {
  const parts: string[] = [];
  if (evt.address) parts.push(evt.address);
  const venuePincode = [evt.location, evt.pincode].filter(Boolean).join(' - ');
  if (venuePincode) parts.push(venuePincode);
  if (evt.country) parts.push(evt.country);
  return parts.join(', ');
}

/** Online events show "Online Event · Worldwide" / "Online Event · Country
 * Based" instead of a physical address (which Online events never have —
 * see events.service.ts's mode-based nulling). Offline/Hybrid events keep
 * showing their real address, unchanged. `translate` is whatever the
 * caller's TranslateService.instant (or the `translate` pipe's transform)
 * resolves to, so this stays a plain function usable from both component
 * code and templates without importing TranslateService here. */
export function eventLocationSummary(evt: EventLocationFields, translate: (key: string) => string): string {
  if (evt.eventMode === 'Online') {
    const scope = evt.visibilityType === 'WORLDWIDE'
      ? translate('user.events.visibility.worldwideLabel')
      : translate('user.events.visibility.countryLabel');
    return `${translate('user.events.onlineEvent')} · ${scope}`;
  }
  return formatEventAddress(evt);
}

/** "Online" / "Offline" / "Hybrid" · "Workshop / Training" — separated with
 * " · ", never concatenated raw. Used everywhere an event card/detail shows
 * mode and category together. Null/missing category never produces a
 * dangling separator. */
export function eventModeCategorySummary(evt: { eventMode?: string; eventCategory?: string }): string {
  return [evt.eventMode, evt.eventCategory].filter(Boolean).join(' · ');
}
