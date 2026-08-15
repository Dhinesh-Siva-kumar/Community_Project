import 'dotenv/config';
import db from '../src/config/db';
import { geocodeAddress } from '../src/services/geocoding.service';

/**
 * Best-effort backfill of businesses.latitude/longitude by geocoding the
 * existing free-text address/city/state/country columns via Google's
 * Geocoding API (requires GOOGLE_MAPS_GEOCODING_API_KEY to be set).
 *
 * Run with: npm run backfill:business-latlng
 *
 * Never destructive: every UPDATE is guarded with `WHERE latitude IS NULL`
 * so it never overwrites a value already set (including one from a prior
 * run or a since-added map picker). Safe to re-run any time — rows that
 * failed to geocode last time (e.g. incomplete address) will simply be
 * retried.
 */

interface BusinessRow {
  id: string;
  address: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  pincode: string | null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  const businesses: BusinessRow[] = await db('businesses')
    .where((qb) => qb.whereNull('latitude').orWhereNull('longitude'))
    .select('id', 'address', 'city', 'state', 'country', 'pincode');

  let geocoded = 0;
  let skippedNoAddress = 0;
  let failed = 0;

  for (const biz of businesses) {
    if (!biz.address && !biz.city && !biz.state && !biz.country) {
      skippedNoAddress++;
      continue;
    }

    const result = await geocodeAddress({
      address: biz.address, city: biz.city, state: biz.state, country: biz.country, pincode: biz.pincode,
    });

    if (result) {
      await db('businesses')
        .where({ id: biz.id })
        .whereNull('latitude') // never clobber a value already set
        .update({ latitude: result.latitude, longitude: result.longitude });
      geocoded++;
    } else {
      failed++;
    }

    // Stay well under Google's default rate limits on a bulk run.
    await sleep(200);
  }

  console.log(
    `Processed ${businesses.length} businesses without coordinates: ` +
    `${geocoded} geocoded, ${failed} failed, ${skippedNoAddress} skipped (no address).`
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Business lat/lng backfill failed:', err);
    process.exit(1);
  });
