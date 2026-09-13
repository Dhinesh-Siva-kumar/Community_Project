import { Knex } from 'knex';

/**
 * The Student Connect & Mentor module's core profile table.
 * verification_status also encodes the "unregistered" state implicitly —
 * a user simply has no row here until they submit the registration wizard
 * (STUDENT_CONNECT_SPEC.md §4's state machine), so the column itself only
 * ever holds 'pending' | 'verified'.
 *
 * All "enum-like" columns are plain strings validated by Zod at the DTO
 * layer, matching this repo's established convention (no native Postgres
 * enums anywhere else in these migrations) rather than a CHECK constraint.
 */
export async function up(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable('student_profiles')) return;

  await knex.schema.createTable('student_profiles', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('user_id').notNullable().unique()
      .references('id').inTable('users').onDelete('CASCADE');

    t.string('first_name', 100).notNullable();
    t.string('photo_url').nullable();

    t.integer('country_id').notNullable()
      .references('id').inTable('master_countries').onDelete('RESTRICT');
    t.integer('region_id').nullable()
      .references('id').inTable('master_states').onDelete('SET NULL');
    t.integer('city_id').nullable()
      .references('id').inTable('master_cities').onDelete('SET NULL');
    t.string('city_free_text', 150).nullable();

    t.integer('university_id').nullable()
      .references('id').inTable('master_universities').onDelete('SET NULL');
    t.string('university_free_text', 200).nullable();
    t.string('course', 150).notNullable();
    t.string('study_level', 30).notNullable();
    t.string('year_of_study', 30).notNullable();

    t.specificType('languages', 'text[]').notNullable().defaultTo('{}');
    t.text('short_intro').notNullable();

    t.integer('previous_country_id').nullable()
      .references('id').inTable('master_countries').onDelete('SET NULL');
    t.text('academic_background').nullable();
    t.specificType('areas_of_help', 'text[]').notNullable().defaultTo('{}');

    t.boolean('mentor_available').notNullable().defaultTo(false);
    t.string('mentoring_type', 20).notNullable().defaultTo('free_chat');
    t.decimal('consultation_price', 10, 2).nullable(); // Phase 2 placeholder, unused in Phase 1

    t.string('verification_status', 20).notNullable().defaultTo('pending');
    t.string('verification_method', 30).nullable();
    t.text('last_rejection_reason').nullable();

    t.boolean('is_active').notNullable().defaultTo(true);
    t.timestamps(true, true);

    t.index('verification_status');
    t.index('mentor_available');
    t.index('country_id');
  });

  await knex.raw(`CREATE INDEX student_profiles_languages_gin_idx ON student_profiles USING GIN (languages);`);
  await knex.raw(`CREATE INDEX student_profiles_areas_of_help_gin_idx ON student_profiles USING GIN (areas_of_help);`);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('student_profiles');
}
