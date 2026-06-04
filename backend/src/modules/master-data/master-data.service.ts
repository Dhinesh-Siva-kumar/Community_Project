import db from '../../config/db';

export async function getCountries() {
  try {
    const rows = await db('country_master')
      .where({ is_active: true })
      .orderBy('country_name', 'asc')
      .select('country_id', 'country_name', 'country_code', 'country_flag');

    return {
      success: true,
      count: rows.length,
      data: (rows as Array<Record<string, unknown>>).map((r) => ({
        country_id: r['country_id'],
        country_name: r['country_name'],
        country_code: r['country_code'],
        country_flag: r['country_flag'],
      })),
    };
  } catch (err) {
    console.error('[MasterData] Error fetching countries:', err);
    throw new Error('Error fetching country data');
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
