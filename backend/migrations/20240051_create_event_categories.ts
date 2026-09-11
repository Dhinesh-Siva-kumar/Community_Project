import { Knex } from 'knex';

/**
 * Event categories move from a hardcoded frontend array to an
 * admin-manageable DB table — same shape as `business_categories`
 * (id/name/icon/description/is_active/display_order/timestamps + a
 * (display_order, name) index), just created in one shot instead of across
 * several incremental migrations like that table's history.
 *
 * Seeds the requested 35-category list here (not only in
 * backend/seeds/01_seed.ts — kept in sync with that file, see the comment
 * there) so the app is never left with zero selectable categories: seeding
 * is a separate manual step (`npm run seed`) that a given environment may
 * never run, but this migration always does (`npm run migrate`).
 *
 * `events.event_category` stays a plain string column (no FK) — nothing in
 * this feature needs relational joins on it, and converting it would force
 * touching every findAll/findOne/findRelated/sort/filter call site plus
 * every frontend read-site that treats it as a string today. New/changed
 * event categories are instead validated server-side (events.service.ts)
 * against this table by exact name match.
 *
 * The live DB has real events using 5 old category strings that aren't in
 * the new list (Concert, Meetup, Sports, Webinar, Workshop) — these are
 * preserved as inactive "legacy" rows rather than renamed/merged into the
 * new list, so those events keep displaying exactly what they already show,
 * while the rows stay hidden from the create/edit picker for new events.
 */

const CANONICAL_CATEGORIES: Array<{ name: string; icon: string }> = [
  { name: 'Entertainment',              icon: 'bi-emoji-laughing' },
  { name: 'Music / Concert',            icon: 'bi-mic-fill' },
  { name: 'Cinema / Film',              icon: 'bi-film' },
  { name: 'Dance',                      icon: 'bi-music-note-beamed' },
  { name: 'Arts & Culture',             icon: 'bi-palette-fill' },
  { name: 'Tamil Cultural Events',      icon: 'bi-flag-fill' },
  { name: 'Festival / Celebration',     icon: 'bi-stars' },
  { name: 'Community Event',            icon: 'bi-people-fill' },
  { name: 'Community Meetup',           icon: 'bi-people' },
  { name: 'Social Gathering',           icon: 'bi-cup-hot-fill' },
  { name: 'Business Networking',        icon: 'bi-briefcase-fill' },
  { name: 'Business / Entrepreneurship',icon: 'bi-graph-up-arrow' },
  { name: 'Education',                  icon: 'bi-mortarboard-fill' },
  { name: 'Workshop / Training',        icon: 'bi-laptop' },
  { name: 'Seminar / Knowledge Sharing',icon: 'bi-easel-fill' },
  { name: 'Conference',                 icon: 'bi-mic' },
  { name: 'Sports / Fitness',           icon: 'bi-trophy-fill' },
  { name: 'Family & Kids',              icon: 'bi-balloon-fill' },
  { name: 'Women',                      icon: 'bi-gender-female' },
  { name: 'Parents & Family',           icon: 'bi-house-heart-fill' },
  { name: 'Religious / Spiritual',      icon: 'bi-moon-stars-fill' },
  { name: 'Charity / Fundraising',      icon: 'bi-heart-fill' },
  { name: 'Health & Wellbeing',         icon: 'bi-heart-pulse-fill' },
  { name: 'Book Launch / Literature',   icon: 'bi-book-fill' },
  { name: 'Exhibition',                 icon: 'bi-image-fill' },
  { name: 'Food / Cooking',             icon: 'bi-egg-fried' },
  { name: 'Shopping / Fair',            icon: 'bi-bag-fill' },
  { name: 'Picnic / Outdoor',           icon: 'bi-tree-fill' },
  { name: 'Networking / Meetup',        icon: 'bi-diagram-3-fill' },
  { name: 'Travel',                     icon: 'bi-airplane-fill' },
  { name: 'Housing / Property',         icon: 'bi-house-fill' },
  { name: 'Awareness / Campaign',       icon: 'bi-megaphone-fill' },
  { name: 'Awards / Recognition',       icon: 'bi-award-fill' },
  { name: 'Public Talk / Guest Speaker',icon: 'bi-chat-square-quote-fill' },
  { name: 'Other',                      icon: 'bi-calendar-event' },
];

// Old category strings real events currently use, none matching the list
// above — kept selectable-by-lookup but not offered for new events.
const LEGACY_CATEGORIES: Array<{ name: string; icon: string }> = [
  { name: 'Concert',  icon: 'bi-mic-fill' },
  { name: 'Meetup',   icon: 'bi-people-fill' },
  { name: 'Sports',   icon: 'bi-trophy-fill' },
  { name: 'Webinar',  icon: 'bi-laptop' },
  { name: 'Workshop', icon: 'bi-laptop' },
];

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable('event_categories'))) {
    await knex.schema.createTable('event_categories', (t) => {
      t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      t.string('name').notNullable().unique();
      t.string('icon').nullable();
      t.string('description', 300).nullable();
      t.boolean('is_active').notNullable().defaultTo(true);
      t.integer('display_order').notNullable().defaultTo(0);
      t.timestamps(true, true);
    });
  }

  await knex.raw(`
    CREATE INDEX IF NOT EXISTS event_categories_display_order_idx
      ON event_categories (display_order, name);
  `);

  await knex('event_categories')
    .insert(CANONICAL_CATEGORIES.map((c, i) => ({ ...c, display_order: (i + 1) * 10 })))
    .onConflict('name')
    .ignore();

  await knex('event_categories')
    .insert(LEGACY_CATEGORIES.map((c, i) => ({
      ...c,
      is_active: false,
      display_order: 9000 + i,
      description: 'Legacy category retained for existing events; not offered for new events.',
    })))
    .onConflict('name')
    .ignore();
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP INDEX IF EXISTS event_categories_display_order_idx;`);
  await knex.schema.dropTableIfExists('event_categories');
}
