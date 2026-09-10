/**
 * Single source of truth for event categories — was previously duplicated as
 * `EVENT_TYPES` in event-form-modal.component.ts plus two copies of
 * `CATEGORY_ICON` (event-detail-modal, user events page) and one
 * `CATEGORY_GRADIENT` map (user events page). Used by the Add/Edit Event
 * form, the Category filter on both listing pages, and the Event Details page.
 */
export const EVENT_CATEGORIES = [
  'Workshop', 'Meetup', 'Webinar', 'Festival', 'Conference',
  'Exhibition', 'Concert', 'Sports', 'Social', 'Other',
] as const;

export type EventCategory = typeof EVENT_CATEGORIES[number];

export const EVENT_CATEGORY_ICON: Record<string, string> = {
  Festival: 'bi-stars', Exhibition: 'bi-stars',
  Workshop: 'bi-laptop', Conference: 'bi-laptop', Webinar: 'bi-laptop',
  Concert: 'bi-mic-fill',
  Sports: 'bi-trophy-fill',
  Meetup: 'bi-people-fill', Social: 'bi-people-fill',
  Other: 'bi-calendar-event',
};

/** Card media background gradient class when an event has no image — user Events page only. */
export const EVENT_CATEGORY_GRADIENT: Record<string, string> = {
  Festival: 'g-fest', Exhibition: 'g-fest',
  Workshop: 'g-work', Conference: 'g-work', Webinar: 'g-work',
  Concert: 'g-conc',
  Sports: 'g-sport',
  Meetup: 'g-meet', Social: 'g-meet',
  Other: 'g-meet',
};
