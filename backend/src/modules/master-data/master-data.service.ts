import db from '../../config/db';

function isoToFlagEmoji(iso2: string): string {
  return [...iso2.toUpperCase()]
    .map((c) => String.fromCodePoint(127397 + c.charCodeAt(0)))
    .join('');
}

export async function getCountries() {
  try {
    const rows = await db('master_countries')
      .orderBy('name', 'asc')
      .select('id', 'name', 'iso2', 'dial_code', 'flag_emoji');

    return {
      success: true,
      count: rows.length,
      data: (rows as Array<Record<string, unknown>>).map((r) => ({
        id: r['id'],
        name: r['name'],
        iso2: r['iso2'],
        dial_code: r['dial_code'],
        flag_emoji: (r['flag_emoji'] as string | null) ?? isoToFlagEmoji(r['iso2'] as string),
      })),
    };
  } catch (err) {
    console.error('[MasterData] Error fetching countries:', err);
    throw new Error('Error fetching country data');
  }
}

export async function getStates(countryId: number) {
  try {
    const rows = await db('master_states')
      .where({ country_id: countryId })
      .orderBy('name', 'asc')
      .select('id', 'name', 'country_id');

    return {
      success: true,
      count: rows.length,
      data: (rows as Array<Record<string, unknown>>).map((r) => ({
        id: r['id'],
        name: r['name'],
        countryId: r['country_id'],
      })),
    };
  } catch (err) {
    console.error('[MasterData] Error fetching states:', err);
    throw new Error('Error fetching state data');
  }
}

export async function getCities(stateId: number) {
  try {
    const rows = await db('master_cities')
      .where({ state_id: stateId })
      .orderBy('name', 'asc')
      .select('id', 'name', 'state_id');

    return {
      success: true,
      count: rows.length,
      data: (rows as Array<Record<string, unknown>>).map((r) => ({
        id: r['id'],
        name: r['name'],
        stateId: r['state_id'],
      })),
    };
  } catch (err) {
    console.error('[MasterData] Error fetching cities:', err);
    throw new Error('Error fetching city data');
  }
}

export async function getInterests() {
  try {
    const rows = await db('interest_master')
      .where({ is_active: true })
      .orderBy('interest_name', 'asc')
      .select('interest_id', 'interest_name');

    return {
      success: true,
      count: rows.length,
      data: (rows as Array<Record<string, unknown>>).map((r) => ({
        interest_id: r['interest_id'],
        interest_name: r['interest_name'],
      })),
    };
  } catch (err) {
    console.error('[MasterData] Error fetching interests:', err);
    throw new Error('Error fetching interest data');
  }
}
