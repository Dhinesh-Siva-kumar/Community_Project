import { Knex } from 'knex';

/**
 * Curates business_categories for the Tamil diaspora business directory:
 *
 *  - Adds `is_active` so a category that's irrelevant but already used by a
 *    real business (e.g. "Bar") can be *deprioritised* — hidden from the
 *    Add/Edit Business category picker — without deleting the row and
 *    breaking that business's `category_id` foreign key.
 *  - Deletes categories that are both irrelevant/junk AND unreferenced by
 *    any business (guarded by a NOT EXISTS check regardless of what this
 *    project's own dev DB showed, so the migration is safe to run against
 *    any environment's data): "Pub" (same nightlife category as Bar), and
 *    three non-seeded rows that were clearly test/typo artifacts —
 *    "Coofee Shop", "Resturent", "New Test Category".
 *  - Renames near-duplicate categories to the requested Tamil-diaspora
 *    wording instead of inserting a second, overlapping category (a rename
 *    keeps the same id, so it's safe regardless of whether a business
 *    already uses it).
 *  - Inserts the remaining requested categories that have no existing
 *    equivalent at all.
 */

const RENAMES: Array<{ from: string; to: string; description: string }> = [
  { from: 'Real Estate',   to: 'Estate Agent / Property', description: 'Estate agents and property services' },
  { from: 'Travel Agency', to: 'Travel Agent',             description: 'Travel agents and tour operators' },
  { from: 'Insurance',     to: 'Insurance Services',       description: 'Insurance services and brokers' },
  { from: 'Salon',         to: 'Beauty Salon / Barber',    description: 'Hair, beauty salons and barbers' },
  { from: 'Clinic',        to: 'Healthcare / GP',          description: 'GP surgeries and healthcare clinics' },
];

const DEACTIVATE = ['Bar'];

// Unreferenced junk/irrelevant rows — deleted only if no business still
// points at them (see the NOT EXISTS guard below).
const DELETE_IF_UNUSED = ['Pub', 'Coofee Shop', 'Resturent', 'New Test Category'];

const NEW_CATEGORIES = [
  { name: 'Tamil Restaurant',            icon: 'bi-fork-knife',        description: 'Tamil cuisine restaurants and takeaways' },
  { name: 'Tamil Grocery',               icon: 'bi-basket',            description: 'Tamil and South Asian grocery stores' },
  { name: 'Catering Services',           icon: 'bi-egg-fried',         description: 'Event and occasion catering services' },
  { name: 'Software & IT Services',      icon: 'bi-code-slash',        description: 'Software development and IT support services' },
  { name: 'Immigration / Legal Services',icon: 'bi-passport',          description: 'Immigration and visa advisory services' },
  { name: 'Accountant / Tax Advisor',    icon: 'bi-calculator',        description: 'Accounting, bookkeeping and tax advisory services' },
  { name: 'Driving Instructor',          icon: 'bi-car-front-fill',    description: 'Driving lessons and instructors' },
  { name: 'Money Transfer',              icon: 'bi-cash-coin',         description: 'Money transfer and remittance services' },
  { name: 'Childcare / Nursery',         icon: 'bi-balloon',           description: 'Childcare, nurseries and creches' },
  { name: 'Translation Services',        icon: 'bi-translate',         description: 'Document and interpreting translation services' },
  { name: 'Courier Services',            icon: 'bi-box-seam',          description: 'Courier, parcel and delivery services' },
  { name: 'Tutoring / Education',        icon: 'bi-mortarboard',       description: 'Private tutoring and supplementary education' },
  { name: 'Cleaning Services',           icon: 'bi-bucket',            description: 'Domestic and commercial cleaning services' },
  { name: 'Mortgage Advisor',            icon: 'bi-house-check',       description: 'Mortgage and home-loan advisory services' },
  { name: 'Solicitor / Legal Services',  icon: 'bi-briefcase',         description: 'Solicitors and general legal services' },
];

export async function up(knex: Knex): Promise<void> {
  const hasIsActive = await knex.schema.hasColumn('business_categories', 'is_active');
  if (!hasIsActive) {
    await knex.schema.alterTable('business_categories', (t) => {
      t.boolean('is_active').notNullable().defaultTo(true);
    });
  }

  // Rename near-duplicates onto the requested wording — guarded so this
  // never collides with a category of the target name that already exists,
  // and never fails if the source category was already renamed/removed.
  for (const r of RENAMES) {
    const source = await knex('business_categories').where({ name: r.from }).first('id');
    if (!source) continue;
    const clash = await knex('business_categories').where({ name: r.to }).first('id');
    if (clash) continue;
    await knex('business_categories').where({ id: (source as { id: string }).id })
      .update({ name: r.to, description: r.description });
  }

  // Deprioritise — keep the row (existing businesses stay intact) but hide
  // it from new selection.
  await knex('business_categories').whereIn('name', DEACTIVATE).update({ is_active: false });

  // Delete only if truly unreferenced.
  await knex.raw(
    `DELETE FROM business_categories bc
     WHERE bc.name = ANY(?)
       AND NOT EXISTS (SELECT 1 FROM businesses b WHERE b.category_id = bc.id)`,
    [DELETE_IF_UNUSED],
  );

  for (const cat of NEW_CATEGORIES) {
    await knex('business_categories').insert({ ...cat, is_active: true }).onConflict('name').ignore();
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex('business_categories').whereIn('name', NEW_CATEGORIES.map((c) => c.name))
    .whereNotExists(
      knex('businesses').select(1).whereRaw('businesses.category_id = business_categories.id'),
    )
    .delete();

  await knex('business_categories').where({ name: 'Bar' }).update({ is_active: true });

  for (const r of RENAMES) {
    const renamed = await knex('business_categories').where({ name: r.to }).first('id');
    if (!renamed) continue;
    const clash = await knex('business_categories').where({ name: r.from }).first('id');
    if (clash) continue;
    await knex('business_categories').where({ id: (renamed as { id: string }).id }).update({ name: r.from });
  }

  const hasIsActive = await knex.schema.hasColumn('business_categories', 'is_active');
  if (hasIsActive) {
    await knex.schema.alterTable('business_categories', (t) => {
      t.dropColumn('is_active');
    });
  }
}
