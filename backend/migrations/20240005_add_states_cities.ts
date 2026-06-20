import { Knex } from 'knex';

// ──────────────────────────────────────────────────────────────
// Migration: Add master_states and master_cities tables
// Seeds key states for India, United Kingdom, UAE, USA, and Europe
// ──────────────────────────────────────────────────────────────

export async function up(knex: Knex): Promise<void> {
  // ── master_states ─────────────────────────────────────────────
  if (!(await knex.schema.hasTable('master_states'))) {
    await knex.schema.createTable('master_states', (t) => {
      t.increments('id').primary();
      t.string('name', 100).notNullable();
      t.integer('country_id').notNullable()
        .references('id').inTable('master_countries').onDelete('CASCADE');
      t.index('country_id');
    });
  }

  // ── master_cities ─────────────────────────────────────────────
  if (!(await knex.schema.hasTable('master_cities'))) {
    await knex.schema.createTable('master_cities', (t) => {
      t.increments('id').primary();
      t.string('name', 100).notNullable();
      t.integer('state_id').notNullable()
        .references('id').inTable('master_states').onDelete('CASCADE');
      t.index('state_id');
    });
  }

  // ── Seed country IDs ──────────────────────────────────────────
  const countries = await knex('master_countries')
    .whereIn('iso2', ['IN', 'GB', 'AE', 'US', 'SG', 'DE', 'FR', 'AU', 'CA'])
    .select('id', 'iso2');

  const byIso: Record<string, number> = {};
  (countries as Array<{ id: number; iso2: string }>).forEach(c => {
    byIso[c.iso2] = c.id;
  });

  // ── Seed data ─────────────────────────────────────────────────
  const stateSeeds: Array<{ name: string; iso2: string }> = [
    // India
    { name: 'Andhra Pradesh',    iso2: 'IN' },
    { name: 'Assam',             iso2: 'IN' },
    { name: 'Bihar',             iso2: 'IN' },
    { name: 'Delhi',             iso2: 'IN' },
    { name: 'Goa',               iso2: 'IN' },
    { name: 'Gujarat',           iso2: 'IN' },
    { name: 'Haryana',           iso2: 'IN' },
    { name: 'Karnataka',         iso2: 'IN' },
    { name: 'Kerala',            iso2: 'IN' },
    { name: 'Madhya Pradesh',    iso2: 'IN' },
    { name: 'Maharashtra',       iso2: 'IN' },
    { name: 'Punjab',            iso2: 'IN' },
    { name: 'Rajasthan',         iso2: 'IN' },
    { name: 'Tamil Nadu',        iso2: 'IN' },
    { name: 'Telangana',         iso2: 'IN' },
    { name: 'Uttar Pradesh',     iso2: 'IN' },
    { name: 'West Bengal',       iso2: 'IN' },
    // United Kingdom
    { name: 'England',           iso2: 'GB' },
    { name: 'Scotland',          iso2: 'GB' },
    { name: 'Wales',             iso2: 'GB' },
    { name: 'Northern Ireland',  iso2: 'GB' },
    // UAE
    { name: 'Abu Dhabi',         iso2: 'AE' },
    { name: 'Dubai',             iso2: 'AE' },
    { name: 'Sharjah',           iso2: 'AE' },
    { name: 'Ajman',             iso2: 'AE' },
    { name: 'Fujairah',          iso2: 'AE' },
    { name: 'Ras Al Khaimah',    iso2: 'AE' },
    { name: 'Umm Al Quwain',     iso2: 'AE' },
    // USA
    { name: 'California',        iso2: 'US' },
    { name: 'Texas',             iso2: 'US' },
    { name: 'New York',          iso2: 'US' },
    { name: 'Florida',           iso2: 'US' },
    { name: 'Illinois',          iso2: 'US' },
    { name: 'Washington',        iso2: 'US' },
    { name: 'New Jersey',        iso2: 'US' },
    // Singapore (city-state — one entry)
    { name: 'Central Region',    iso2: 'SG' },
    { name: 'North Region',      iso2: 'SG' },
    { name: 'East Region',       iso2: 'SG' },
    // Germany
    { name: 'Bavaria',           iso2: 'DE' },
    { name: 'Berlin',            iso2: 'DE' },
    { name: 'Hamburg',           iso2: 'DE' },
    // France
    { name: 'Île-de-France',     iso2: 'FR' },
    { name: 'Provence',          iso2: 'FR' },
    // Australia
    { name: 'New South Wales',   iso2: 'AU' },
    { name: 'Victoria',          iso2: 'AU' },
    { name: 'Queensland',        iso2: 'AU' },
    // Canada
    { name: 'Ontario',           iso2: 'CA' },
    { name: 'British Columbia',  iso2: 'CA' },
    { name: 'Quebec',            iso2: 'CA' },
  ];

  // Only seed for countries that exist in DB
  const stateRows = stateSeeds
    .filter(s => byIso[s.iso2] != null)
    .map(s => ({ name: s.name, country_id: byIso[s.iso2] }));

  if (stateRows.length > 0) {
    await knex('master_states').insert(stateRows);
  }

  // ── Load inserted state IDs for city seeding ──────────────────
  const insertedStates = await knex('master_states').select('id', 'name', 'country_id');
  const stateByName: Record<string, number> = {};
  (insertedStates as Array<{ id: number; name: string; country_id: number }>).forEach(s => {
    stateByName[s.name] = s.id;
  });

  const citySeeds: Array<{ name: string; state: string }> = [
    // Tamil Nadu
    { name: 'Chennai',       state: 'Tamil Nadu' },
    { name: 'Coimbatore',    state: 'Tamil Nadu' },
    { name: 'Madurai',       state: 'Tamil Nadu' },
    { name: 'Tiruchirappalli', state: 'Tamil Nadu' },
    { name: 'Salem',         state: 'Tamil Nadu' },
    { name: 'Tirunelveli',   state: 'Tamil Nadu' },
    { name: 'Erode',         state: 'Tamil Nadu' },
    { name: 'Vellore',       state: 'Tamil Nadu' },
    // Maharashtra
    { name: 'Mumbai',        state: 'Maharashtra' },
    { name: 'Pune',          state: 'Maharashtra' },
    { name: 'Nagpur',        state: 'Maharashtra' },
    { name: 'Nashik',        state: 'Maharashtra' },
    // Karnataka
    { name: 'Bengaluru',     state: 'Karnataka' },
    { name: 'Mysuru',        state: 'Karnataka' },
    { name: 'Mangaluru',     state: 'Karnataka' },
    { name: 'Hubballi',      state: 'Karnataka' },
    // Telangana
    { name: 'Hyderabad',     state: 'Telangana' },
    { name: 'Warangal',      state: 'Telangana' },
    // Delhi
    { name: 'New Delhi',     state: 'Delhi' },
    { name: 'Noida',         state: 'Delhi' },
    { name: 'Gurugram',      state: 'Haryana' },
    // Gujarat
    { name: 'Ahmedabad',     state: 'Gujarat' },
    { name: 'Surat',         state: 'Gujarat' },
    { name: 'Vadodara',      state: 'Gujarat' },
    // West Bengal
    { name: 'Kolkata',       state: 'West Bengal' },
    // Kerala
    { name: 'Thiruvananthapuram', state: 'Kerala' },
    { name: 'Kochi',         state: 'Kerala' },
    { name: 'Kozhikode',     state: 'Kerala' },
    // Uttar Pradesh
    { name: 'Lucknow',       state: 'Uttar Pradesh' },
    { name: 'Kanpur',        state: 'Uttar Pradesh' },
    { name: 'Agra',          state: 'Uttar Pradesh' },
    // UK — England
    { name: 'London',        state: 'England' },
    { name: 'Manchester',    state: 'England' },
    { name: 'Birmingham',    state: 'England' },
    { name: 'Leeds',         state: 'England' },
    { name: 'Liverpool',     state: 'England' },
    { name: 'Bristol',       state: 'England' },
    { name: 'Sheffield',     state: 'England' },
    { name: 'Leicester',     state: 'England' },
    // UK — Scotland
    { name: 'Edinburgh',     state: 'Scotland' },
    { name: 'Glasgow',       state: 'Scotland' },
    // UAE
    { name: 'Abu Dhabi City',state: 'Abu Dhabi' },
    { name: 'Al Ain',        state: 'Abu Dhabi' },
    { name: 'Dubai City',    state: 'Dubai' },
    { name: 'Sharjah City',  state: 'Sharjah' },
    // USA
    { name: 'Los Angeles',   state: 'California' },
    { name: 'San Francisco', state: 'California' },
    { name: 'San Jose',      state: 'California' },
    { name: 'Houston',       state: 'Texas' },
    { name: 'Dallas',        state: 'Texas' },
    { name: 'New York City', state: 'New York' },
    { name: 'Miami',         state: 'Florida' },
    { name: 'Chicago',       state: 'Illinois' },
    { name: 'Seattle',       state: 'Washington' },
    // Singapore
    { name: 'Singapore',     state: 'Central Region' },
    // Australia
    { name: 'Sydney',        state: 'New South Wales' },
    { name: 'Melbourne',     state: 'Victoria' },
    { name: 'Brisbane',      state: 'Queensland' },
    // Canada
    { name: 'Toronto',       state: 'Ontario' },
    { name: 'Vancouver',     state: 'British Columbia' },
    { name: 'Montreal',      state: 'Quebec' },
  ];

  const cityRows = citySeeds
    .filter(c => stateByName[c.state] != null)
    .map(c => ({ name: c.name, state_id: stateByName[c.state] }));

  if (cityRows.length > 0) {
    await knex('master_cities').insert(cityRows);
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('master_cities');
  await knex.schema.dropTableIfExists('master_states');
}
