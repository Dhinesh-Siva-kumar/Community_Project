import 'dotenv/config';
import db from '../src/config/db';
import { parseLegacyOpeningHours } from '../src/modules/business/opening-hours.util';

/**
 * Best-effort backfill of businesses.opening_hours_json from the two legacy
 * free-text columns (opening_days + opening_hours).
 *
 * Run with: npm run backfill:business-hours
 *
 * Never destructive: the SELECT and the UPDATE are both guarded with
 * `WHERE opening_hours_json IS NULL`, so a value already set — by a prior
 * run or by someone editing the business through the new hours editor — is
 * never overwritten. Rows whose free text can't be parsed are left NULL and
 * simply fall back to legacy display; safe to re-run any time.
 */

interface BusinessRow {
  id: string;
  opening_days: string | null;
  opening_hours: string | null;
}

async function main(): Promise<void> {
  const businesses: BusinessRow[] = await db('businesses')
    .whereNull('opening_hours_json')
    .whereNotNull('opening_days')
    .select('id', 'opening_days', 'opening_hours');

  let filled = 0;
  let unparsable = 0;

  for (const biz of businesses) {
    const json = parseLegacyOpeningHours(biz.opening_days, biz.opening_hours);
    if (!json) {
      unparsable++;
      continue;
    }

    await db('businesses')
      .where({ id: biz.id })
      .whereNull('opening_hours_json') // never clobber a value already set
      .update({ opening_hours_json: JSON.stringify(json) });
    filled++;
  }

  console.log(
    `Processed ${businesses.length} businesses without structured hours: ` +
    `${filled} backfilled, ${unparsable} left as-is (free text not parsable).`
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Business opening-hours backfill failed:', err);
    process.exit(1);
  });
