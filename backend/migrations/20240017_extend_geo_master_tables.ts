import { Knex } from 'knex';

/**
 * Extends the master_countries / master_states / master_cities tables
 * (previously a small hand-seeded 9-country dataset) to support a real
 * worldwide, country-aware address hierarchy imported from an external
 * dataset (see scripts/import-geo-data.ts).
 *
 * master_states becomes the generic, self-referential administrative
 * division table — `type`/`level`/`parent_id` let it represent a state,
 * a province, a district, a county, an emirate, etc. at any depth, for
 * any country, without per-country tables. `source_id`/`source_parent_id`
 * are import-only bookkeeping (never exposed to the app) that make the
 * import script idempotent and let it resolve parent/child links.
 *
 * All changes are additive — no existing column is dropped/renamed, and
 * no existing row is re-keyed.
 */
export async function up(knex: Knex): Promise<void> {
  // ── master_countries ──────────────────────────────────────────
  // Knex's alterTable callback runs synchronously to collect column
  // definitions, so each hasColumn() guard must be awaited *before*
  // calling alterTable, not inside its callback.
  if (!(await knex.schema.hasColumn('master_countries', 'iso3'))) {
    await knex.schema.alterTable('master_countries', (t) => { t.string('iso3', 3).nullable(); });
  }
  if (!(await knex.schema.hasColumn('master_countries', 'capital'))) {
    await knex.schema.alterTable('master_countries', (t) => { t.string('capital', 100).nullable(); });
  }
  if (!(await knex.schema.hasColumn('master_countries', 'region'))) {
    await knex.schema.alterTable('master_countries', (t) => { t.string('region', 50).nullable(); });
  }
  if (!(await knex.schema.hasColumn('master_countries', 'subregion'))) {
    await knex.schema.alterTable('master_countries', (t) => { t.string('subregion', 50).nullable(); });
  }
  if (!(await knex.schema.hasColumn('master_countries', 'postal_code_format'))) {
    await knex.schema.alterTable('master_countries', (t) => { t.string('postal_code_format', 100).nullable(); });
  }
  if (!(await knex.schema.hasColumn('master_countries', 'postal_code_regex'))) {
    await knex.schema.alterTable('master_countries', (t) => { t.string('postal_code_regex', 500).nullable(); });
  }
  if (!(await knex.schema.hasColumn('master_countries', 'latitude'))) {
    await knex.schema.alterTable('master_countries', (t) => {
      t.float('latitude').nullable();
      t.float('longitude').nullable();
    });
  }

  // ── master_states → generic administrative-division table ──────
  if (!(await knex.schema.hasColumn('master_states', 'iso2'))) {
    await knex.schema.alterTable('master_states', (t) => {
      t.string('iso2', 10).nullable();
    });
  }
  if (!(await knex.schema.hasColumn('master_states', 'type'))) {
    await knex.schema.alterTable('master_states', (t) => {
      t.string('type', 50).nullable();
      t.index('type');
    });
  }
  if (!(await knex.schema.hasColumn('master_states', 'level'))) {
    await knex.schema.alterTable('master_states', (t) => {
      t.integer('level').nullable();
    });
  }
  if (!(await knex.schema.hasColumn('master_states', 'parent_id'))) {
    await knex.schema.alterTable('master_states', (t) => {
      t.integer('parent_id').nullable()
        .references('id').inTable('master_states').onDelete('CASCADE');
      t.index('parent_id');
    });
  }
  if (!(await knex.schema.hasColumn('master_states', 'latitude'))) {
    await knex.schema.alterTable('master_states', (t) => {
      t.float('latitude').nullable();
      t.float('longitude').nullable();
    });
  }
  if (!(await knex.schema.hasColumn('master_states', 'source_id'))) {
    await knex.schema.alterTable('master_states', (t) => {
      // Original numeric id from the imported dataset — import-idempotency
      // key only; never used as our primary key or exposed via the API.
      t.integer('source_id').nullable().unique();
    });
  }
  if (!(await knex.schema.hasColumn('master_states', 'source_parent_id'))) {
    await knex.schema.alterTable('master_states', (t) => {
      // The imported dataset's own parent id — used only by the import
      // script's second pass to resolve `parent_id` above.
      t.integer('source_parent_id').nullable();
    });
  }

  // ── master_cities ────────────────────────────────────────────
  if (!(await knex.schema.hasColumn('master_cities', 'country_id'))) {
    await knex.schema.alterTable('master_cities', (t) => {
      t.integer('country_id').nullable()
        .references('id').inTable('master_countries').onDelete('CASCADE');
      t.index('country_id');
    });
  }
  if (!(await knex.schema.hasColumn('master_cities', 'latitude'))) {
    await knex.schema.alterTable('master_cities', (t) => {
      t.float('latitude').nullable();
      t.float('longitude').nullable();
    });
  }
  if (!(await knex.schema.hasColumn('master_cities', 'type'))) {
    await knex.schema.alterTable('master_cities', (t) => {
      t.string('type', 30).nullable();
    });
  }
  if (!(await knex.schema.hasColumn('master_cities', 'source_id'))) {
    await knex.schema.alterTable('master_cities', (t) => {
      t.integer('source_id').nullable().unique();
    });
  }

  // state_id must become nullable — countries with no state-level division
  // (confirmed real for 14/250 countries in the source dataset) attach
  // their cities directly to the country instead.
  await knex.raw('ALTER TABLE master_cities ALTER COLUMN state_id DROP NOT NULL');

  // country_id is populated by the import script for every row; enforce
  // NOT NULL only after that backfill has had a chance to run — deferred
  // to a follow-up migration if ever needed. Left nullable here so this
  // migration doesn't fail against a database that hasn't been imported
  // into yet.
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn('master_cities', 'source_id')) {
    await knex.schema.alterTable('master_cities', (t) => t.dropColumn('source_id'));
  }
  if (await knex.schema.hasColumn('master_cities', 'type')) {
    await knex.schema.alterTable('master_cities', (t) => t.dropColumn('type'));
  }
  if (await knex.schema.hasColumn('master_cities', 'latitude')) {
    await knex.schema.alterTable('master_cities', (t) => {
      t.dropColumn('latitude');
      t.dropColumn('longitude');
    });
  }
  if (await knex.schema.hasColumn('master_cities', 'country_id')) {
    await knex.schema.alterTable('master_cities', (t) => t.dropColumn('country_id'));
  }
  await knex.raw('ALTER TABLE master_cities ALTER COLUMN state_id SET NOT NULL');

  if (await knex.schema.hasColumn('master_states', 'source_parent_id')) {
    await knex.schema.alterTable('master_states', (t) => t.dropColumn('source_parent_id'));
  }
  if (await knex.schema.hasColumn('master_states', 'source_id')) {
    await knex.schema.alterTable('master_states', (t) => t.dropColumn('source_id'));
  }
  if (await knex.schema.hasColumn('master_states', 'latitude')) {
    await knex.schema.alterTable('master_states', (t) => {
      t.dropColumn('latitude');
      t.dropColumn('longitude');
    });
  }
  if (await knex.schema.hasColumn('master_states', 'parent_id')) {
    await knex.schema.alterTable('master_states', (t) => t.dropColumn('parent_id'));
  }
  if (await knex.schema.hasColumn('master_states', 'level')) {
    await knex.schema.alterTable('master_states', (t) => t.dropColumn('level'));
  }
  if (await knex.schema.hasColumn('master_states', 'type')) {
    await knex.schema.alterTable('master_states', (t) => t.dropColumn('type'));
  }
  if (await knex.schema.hasColumn('master_states', 'iso2')) {
    await knex.schema.alterTable('master_states', (t) => t.dropColumn('iso2'));
  }

  await knex.schema.alterTable('master_countries', (t) => {
    t.dropColumn('longitude');
    t.dropColumn('latitude');
    t.dropColumn('postal_code_regex');
    t.dropColumn('postal_code_format');
    t.dropColumn('subregion');
    t.dropColumn('region');
    t.dropColumn('capital');
    t.dropColumn('iso3');
  });
}
