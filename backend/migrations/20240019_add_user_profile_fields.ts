import { Knex } from 'knex';

/**
 * Adds a small set of optional professional/social fields to users, for
 * profile pages beyond the existing single professional_category dropdown.
 */
export async function up(knex: Knex): Promise<void> {
  const [hasOccupation, hasCompany, hasWebsite, hasLinkedin] = await Promise.all([
    knex.schema.hasColumn('users', 'occupation'),
    knex.schema.hasColumn('users', 'company'),
    knex.schema.hasColumn('users', 'website'),
    knex.schema.hasColumn('users', 'linkedin_url'),
  ]);
  if (hasOccupation && hasCompany && hasWebsite && hasLinkedin) return;

  await knex.schema.alterTable('users', (t) => {
    if (!hasOccupation) t.string('occupation').nullable();
    if (!hasCompany) t.string('company').nullable();
    if (!hasWebsite) t.string('website').nullable();
    if (!hasLinkedin) t.string('linkedin_url').nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  const [hasOccupation, hasCompany, hasWebsite, hasLinkedin] = await Promise.all([
    knex.schema.hasColumn('users', 'occupation'),
    knex.schema.hasColumn('users', 'company'),
    knex.schema.hasColumn('users', 'website'),
    knex.schema.hasColumn('users', 'linkedin_url'),
  ]);
  if (!hasOccupation && !hasCompany && !hasWebsite && !hasLinkedin) return;

  await knex.schema.alterTable('users', (t) => {
    if (hasOccupation) t.dropColumn('occupation');
    if (hasCompany) t.dropColumn('company');
    if (hasWebsite) t.dropColumn('website');
    if (hasLinkedin) t.dropColumn('linkedin_url');
  });
}
