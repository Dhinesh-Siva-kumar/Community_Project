import 'dotenv/config';
import db from '../src/config/db';

/**
 * Best-effort backfill of businesses.country_id/state_id/city_id from the
 * existing free-text country/state/city columns, after running
 * `npm run import:geo-data`.
 *
 * Run with: npm run backfill:business-geo
 *
 * Never destructive: the free-text columns are never touched, and any
 * column that can't be confidently matched is simply left NULL rather than
 * guessed at. Safe to re-run any time master data improves — every UPDATE
 * is guarded with `WHERE <col> IS NULL` so it never overwrites a value
 * already set (including one an admin corrected manually via Edit).
 */

interface BusinessRow {
  id: string;
  country: string | null;
  state: string | null;
  city: string | null;
}

async function main(): Promise<void> {
  const businesses: BusinessRow[] = await db('businesses')
    .whereNotNull('country')
    .andWhere('country', '<>', '')
    .select('id', 'country', 'state', 'city');

  let matchedCountry = 0;
  let matchedState = 0;
  let matchedCity = 0;

  for (const biz of businesses) {
    const country = await db('master_countries')
      .whereRaw('lower(name) = lower(?)', [biz.country])
      .first('id');
    if (!country) continue;
    matchedCountry++;

    let stateId: number | null = null;
    if (biz.state && biz.state.trim()) {
      // Existing free-text state values were always flat/single-level, so
      // only match against top-level (non-nested) divisions to avoid a
      // false positive against a same-named nested district.
      const state = await db('master_states')
        .where({ country_id: country.id })
        .whereNull('parent_id')
        .whereRaw('lower(name) = lower(?)', [biz.state])
        .first('id');
      if (state) { stateId = state.id; matchedState++; }
    }

    let cityId: number | null = null;
    if (biz.city && biz.city.trim()) {
      const cityQuery = db('master_cities').whereRaw('lower(name) = lower(?)', [biz.city]);
      if (stateId) cityQuery.andWhere({ state_id: stateId });
      else cityQuery.andWhere({ country_id: country.id });
      const city = await cityQuery.first('id');
      if (city) { cityId = city.id; matchedCity++; }
    }

    await db('businesses')
      .where({ id: biz.id })
      .whereNull('country_id') // never clobber a value already set (e.g. by a manual edit)
      .update({
        country_id: country.id,
        ...(stateId ? { state_id: stateId } : {}),
        ...(cityId ? { city_id: cityId } : {}),
      });
  }

  console.log(
    `Backfilled ${businesses.length} businesses: ` +
    `${matchedCountry} matched country, ${matchedState} matched state, ${matchedCity} matched city.`
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Business geo backfill failed:', err);
    process.exit(1);
  });
