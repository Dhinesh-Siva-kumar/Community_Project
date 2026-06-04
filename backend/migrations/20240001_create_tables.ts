import { Knex } from 'knex';

/**
 * Full schema migration — reproduces the Prisma schema exactly as Knex DDL.
 * Tables: users, communities, community_members, posts, comments, likes,
 *         business_categories, businesses, events, jobs,
 *         country_master, interest_master, notifications,
 *         otp_tokens, audit_logs
 */
export async function up(knex: Knex): Promise<void> {
  // ------------------------------------------------------------------
  // ENUMS (PostgreSQL native)
  // ------------------------------------------------------------------
  await knex.raw(`
    DO $$ BEGIN
      CREATE TYPE user_role AS ENUM ('ADMIN', 'USER');
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;
  `);

  await knex.raw(`
    DO $$ BEGIN
      CREATE TYPE post_type AS ENUM ('GENERAL', 'HELP', 'EMERGENCY');
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;
  `);

  await knex.raw(`
    DO $$ BEGIN
      CREATE TYPE post_status AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;
  `);

  await knex.raw(`
    DO $$ BEGIN
      CREATE TYPE notification_type AS ENUM (
        'POST_APPROVED', 'POST_REJECTED', 'NEW_COMMENT', 'NEW_LIKE',
        'COMMUNITY_POST', 'USER_BLOCKED', 'USER_UNBLOCKED', 'TRUST_GRANTED',
        'EVENT_CREATED', 'JOB_POSTED'
      );
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;
  `);

  // ------------------------------------------------------------------
  // users
  // ------------------------------------------------------------------
  if (!(await knex.schema.hasTable('users'))) {
    await knex.schema.createTable('users', (t) => {
      t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      t.string('email').unique().nullable();
      t.string('password').notNullable();
      t.string('user_name').unique().notNullable();
      t.string('display_name').notNullable();
      t.string('phone_no').nullable();
      t.string('avatar').nullable();
      t.specificType('role', 'user_role').notNullable().defaultTo('USER');
      t.integer('role_level').notNullable().defaultTo(1);
      t.integer('country_id').nullable();
      t.string('country').notNullable().defaultTo('United Kingdom');
      t.string('location').nullable();
      t.string('pincode').nullable();
      t.specificType('interests', 'text[]').notNullable().defaultTo('{}');
      t.string('professional_category').nullable();
      t.text('bio').nullable();
      t.boolean('is_trusted').notNullable().defaultTo(false);
      t.boolean('is_blocked').notNullable().defaultTo(false);
      t.boolean('is_active').notNullable().defaultTo(true);
      t.integer('profile_completion').notNullable().defaultTo(0);
      t.text('refresh_token').nullable();
      t.timestamps(true, true);
    });
  }

  // ------------------------------------------------------------------
  // communities
  // ------------------------------------------------------------------
  if (!(await knex.schema.hasTable('communities'))) {
    await knex.schema.createTable('communities', (t) => {
      t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      t.string('name').unique().notNullable();
      t.text('description').nullable();
      t.string('image').nullable();
      t.string('location').nullable();
      t.string('pincode').nullable();
      t.boolean('is_active').notNullable().defaultTo(true);
      t.uuid('created_by_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
      t.timestamps(true, true);
    });
  }

  // ------------------------------------------------------------------
  // community_members
  // ------------------------------------------------------------------
  if (!(await knex.schema.hasTable('community_members'))) {
    await knex.schema.createTable('community_members', (t) => {
      t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      t.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
      t.uuid('community_id').notNullable().references('id').inTable('communities').onDelete('CASCADE');
      t.timestamp('joined_at').defaultTo(knex.fn.now());
      t.unique(['user_id', 'community_id']);
    });
  }

  // ------------------------------------------------------------------
  // posts
  // ------------------------------------------------------------------
  if (!(await knex.schema.hasTable('posts'))) {
    await knex.schema.createTable('posts', (t) => {
      t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      t.text('content').notNullable();
      t.specificType('images', 'text[]').notNullable().defaultTo('{}');
      t.specificType('type', 'post_type').notNullable().defaultTo('GENERAL');
      t.specificType('status', 'post_status').notNullable().defaultTo('PENDING');
      t.uuid('community_id').notNullable().references('id').inTable('communities').onDelete('CASCADE');
      t.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
      t.timestamps(true, true);
    });
  }

  // ------------------------------------------------------------------
  // comments
  // ------------------------------------------------------------------
  if (!(await knex.schema.hasTable('comments'))) {
    await knex.schema.createTable('comments', (t) => {
      t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      t.text('content').notNullable();
      t.uuid('post_id').notNullable().references('id').inTable('posts').onDelete('CASCADE');
      t.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
      t.timestamps(true, true);
    });
  }

  // ------------------------------------------------------------------
  // likes
  // ------------------------------------------------------------------
  if (!(await knex.schema.hasTable('likes'))) {
    await knex.schema.createTable('likes', (t) => {
      t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      t.uuid('post_id').notNullable().references('id').inTable('posts').onDelete('CASCADE');
      t.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
      t.timestamp('created_at').defaultTo(knex.fn.now());
      t.unique(['post_id', 'user_id']);
    });
  }

  // ------------------------------------------------------------------
  // business_categories
  // ------------------------------------------------------------------
  if (!(await knex.schema.hasTable('business_categories'))) {
    await knex.schema.createTable('business_categories', (t) => {
      t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      t.string('name').unique().notNullable();
      t.string('icon').nullable();
      t.timestamp('created_at').defaultTo(knex.fn.now());
    });
  }

  // ------------------------------------------------------------------
  // businesses
  // ------------------------------------------------------------------
  if (!(await knex.schema.hasTable('businesses'))) {
    await knex.schema.createTable('businesses', (t) => {
      t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      t.string('name').notNullable();
      t.text('description').nullable();
      t.specificType('images', 'text[]').notNullable().defaultTo('{}');
      t.string('address').nullable();
      t.string('pincode').nullable();
      t.string('country').notNullable().defaultTo('United Kingdom');
      t.string('location').nullable();
      t.float('latitude').nullable();
      t.float('longitude').nullable();
      t.string('phone').nullable();
      t.string('email').nullable();
      t.string('website').nullable();
      t.string('opening_hours').nullable();
      t.uuid('category_id').notNullable().references('id').inTable('business_categories');
      t.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
      t.boolean('is_active').notNullable().defaultTo(true);
      t.timestamps(true, true);
    });
  }

  // ------------------------------------------------------------------
  // events
  // ------------------------------------------------------------------
  if (!(await knex.schema.hasTable('events'))) {
    await knex.schema.createTable('events', (t) => {
      t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      t.string('title').notNullable();
      t.text('description').nullable();
      t.specificType('images', 'text[]').notNullable().defaultTo('{}');
      t.timestamp('event_date').notNullable();
      t.string('event_time').nullable();
      t.string('address').nullable();
      t.string('pincode').nullable();
      t.string('location').nullable();
      t.string('country').notNullable().defaultTo('United Kingdom');
      t.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
      t.boolean('is_active').notNullable().defaultTo(true);
      t.timestamps(true, true);
    });
  }

  // ------------------------------------------------------------------
  // jobs
  // ------------------------------------------------------------------
  if (!(await knex.schema.hasTable('jobs'))) {
    await knex.schema.createTable('jobs', (t) => {
      t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      t.string('title').notNullable();
      t.text('specification').nullable();
      t.text('description').nullable();
      t.specificType('images', 'text[]').notNullable().defaultTo('{}');
      t.string('location').nullable();
      t.string('pincode').nullable();
      t.string('country').notNullable().defaultTo('United Kingdom');
      t.string('contact_info').nullable();
      t.string('salary').nullable();
      t.string('job_type').nullable();
      t.string('timing').nullable();
      t.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
      t.boolean('is_active').notNullable().defaultTo(true);
      t.timestamps(true, true);
    });
  }

  // ------------------------------------------------------------------
  // country_master
  // ------------------------------------------------------------------
  if (!(await knex.schema.hasTable('country_master'))) {
    await knex.schema.createTable('country_master', (t) => {
      t.increments('country_id').primary();
      t.string('country_name').unique().notNullable();
      t.string('country_code').nullable();
      t.string('country_flag').nullable();
      t.boolean('is_active').notNullable().defaultTo(true);
    });
  }

  // ------------------------------------------------------------------
  // interest_master
  // ------------------------------------------------------------------
  if (!(await knex.schema.hasTable('interest_master'))) {
    await knex.schema.createTable('interest_master', (t) => {
      t.increments('interest_id').primary();
      t.string('interest_name').unique().notNullable();
      t.boolean('is_active').notNullable().defaultTo(true);
    });
  }

  // ------------------------------------------------------------------
  // notifications
  // ------------------------------------------------------------------
  if (!(await knex.schema.hasTable('notifications'))) {
    await knex.schema.createTable('notifications', (t) => {
      t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      t.specificType('type', 'notification_type').notNullable();
      t.text('message').notNullable();
      t.boolean('is_read').notNullable().defaultTo(false);
      t.string('related_entity_id').nullable();
      t.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
      t.timestamp('created_at').defaultTo(knex.fn.now());
    });
  }

  // ------------------------------------------------------------------
  // otp_tokens (DB-backed OTP audit log)
  // ------------------------------------------------------------------
  if (!(await knex.schema.hasTable('otp_tokens'))) {
    await knex.schema.createTable('otp_tokens', (t) => {
      t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      t.uuid('user_id').nullable().references('id').inTable('users').onDelete('CASCADE');
      t.string('phone').notNullable();
      t.string('otp_hash').notNullable();
      t.integer('attempts').notNullable().defaultTo(0);
      t.timestamp('expires_at').notNullable();
      t.timestamp('created_at').defaultTo(knex.fn.now());
    });
  }

  // ------------------------------------------------------------------
  // audit_logs
  // ------------------------------------------------------------------
  if (!(await knex.schema.hasTable('audit_logs'))) {
    await knex.schema.createTable('audit_logs', (t) => {
      t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      t.uuid('user_id').nullable();
      t.string('action').notNullable();
      t.string('resource').nullable();
      t.string('resource_id').nullable();
      t.text('metadata').nullable();
      t.string('ip_address').nullable();
      t.timestamp('created_at').defaultTo(knex.fn.now());
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('audit_logs');
  await knex.schema.dropTableIfExists('otp_tokens');
  await knex.schema.dropTableIfExists('notifications');
  await knex.schema.dropTableIfExists('interest_master');
  await knex.schema.dropTableIfExists('country_master');
  await knex.schema.dropTableIfExists('jobs');
  await knex.schema.dropTableIfExists('events');
  await knex.schema.dropTableIfExists('businesses');
  await knex.schema.dropTableIfExists('business_categories');
  await knex.schema.dropTableIfExists('likes');
  await knex.schema.dropTableIfExists('comments');
  await knex.schema.dropTableIfExists('posts');
  await knex.schema.dropTableIfExists('community_members');
  await knex.schema.dropTableIfExists('communities');
  await knex.schema.dropTableIfExists('users');

  await knex.raw('DROP TYPE IF EXISTS notification_type');
  await knex.raw('DROP TYPE IF EXISTS post_status');
  await knex.raw('DROP TYPE IF EXISTS post_type');
  await knex.raw('DROP TYPE IF EXISTS user_role');
}
