import db from '../../config/db';

/**
 * Derive a flag emoji from a 2-letter ISO 3166-1 alpha-2 code.
 * Regional Indicator Symbol Letter A = U+1F1E6 = 127462.
 * Each subsequent letter is +1, so charCode('A') = 65 → offset = 127462 - 65 = 127397.
 */
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
        // Fallback: if flag_emoji is NULL in the DB, derive it from the iso2 code.
        flag_emoji: (r['flag_emoji'] as string | null) ?? isoToFlagEmoji(r['iso2'] as string),
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
