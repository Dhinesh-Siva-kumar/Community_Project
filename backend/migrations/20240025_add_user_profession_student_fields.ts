import { Knex } from 'knex';

/**
 * Adds a Professional/Student status to users plus student-only fields
 * (institution, course, graduation year), alongside the existing
 * occupation/company professional fields.
 */
export async function up(knex: Knex): Promise<void> {
  const [hasOccupationType, hasInstitution, hasCourse, hasGraduationYear] = await Promise.all([
    knex.schema.hasColumn('users', 'occupation_type'),
    knex.schema.hasColumn('users', 'institution'),
    knex.schema.hasColumn('users', 'course'),
    knex.schema.hasColumn('users', 'graduation_year'),
  ]);
  if (hasOccupationType && hasInstitution && hasCourse && hasGraduationYear) return;

  await knex.schema.alterTable('users', (t) => {
    if (!hasOccupationType) t.string('occupation_type', 20).nullable();
    if (!hasInstitution) t.string('institution', 150).nullable();
    if (!hasCourse) t.string('course', 150).nullable();
    if (!hasGraduationYear) t.integer('graduation_year').nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  const [hasOccupationType, hasInstitution, hasCourse, hasGraduationYear] = await Promise.all([
    knex.schema.hasColumn('users', 'occupation_type'),
    knex.schema.hasColumn('users', 'institution'),
    knex.schema.hasColumn('users', 'course'),
    knex.schema.hasColumn('users', 'graduation_year'),
  ]);
  if (!hasOccupationType && !hasInstitution && !hasCourse && !hasGraduationYear) return;

  await knex.schema.alterTable('users', (t) => {
    if (hasOccupationType) t.dropColumn('occupation_type');
    if (hasInstitution) t.dropColumn('institution');
    if (hasCourse) t.dropColumn('course');
    if (hasGraduationYear) t.dropColumn('graduation_year');
  });
}
