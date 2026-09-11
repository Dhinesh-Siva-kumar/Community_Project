/**
 * Event categories themselves are now DB-managed (`event_categories` table,
 * via `EventService.getCategories()`) rather than a hardcoded list here —
 * see EventCategory in core/models. This file now only keeps the decorative
 * card-background gradient used by the user Events page when a card has no
 * image; there's no DB equivalent for that (purely visual), so it stays a
 * small local map, with a deterministic fallback for any category name not
 * in the curated list below (so new/admin-added categories still render
 * *some* gradient instead of none).
 */

/** Card media background gradient class when an event has no image — user Events page only. */
export const EVENT_CATEGORY_GRADIENT: Record<string, string> = {
  Festival: 'g-fest', 'Festival / Celebration': 'g-fest', Exhibition: 'g-fest',
  Workshop: 'g-work', 'Workshop / Training': 'g-work', Conference: 'g-work', Webinar: 'g-work', Seminar: 'g-work',
  Concert: 'g-conc', 'Music / Concert': 'g-conc',
  Sports: 'g-sport', 'Sports / Fitness': 'g-sport',
  Meetup: 'g-meet', 'Community Meetup': 'g-meet', 'Networking / Meetup': 'g-meet', Social: 'g-meet', 'Social Gathering': 'g-meet',
  Other: 'g-meet',
};

/** Every gradient class actually defined in events.component.scss — the fallback pool. */
const GRADIENT_FALLBACKS = ['g-fest', 'g-work', 'g-conc', 'g-sport', 'g-meet'] as const;

function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

/** Curated gradient for the well-known names above; otherwise a stable, deterministic pick from the same pool so every category still gets a gradient. */
export function eventCategoryGradient(name?: string): string {
  if (!name) return 'g-meet';
  return EVENT_CATEGORY_GRADIENT[name] ?? GRADIENT_FALLBACKS[hashCode(name) % GRADIENT_FALLBACKS.length];
}
