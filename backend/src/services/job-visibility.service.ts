import type { Knex } from 'knex';
import { getViewerScope, type ViewerScope } from './business-visibility.service';

// ---------------------------------------------------------------------------
// Shared non-admin visibility restriction for jobs — mirrors
// business-visibility.service.ts exactly (`getViewerScope` is fully
// generic — it only reads `users.country`/`country_id` — so it's reused
// directly rather than duplicated). A regular user should only ever see
// jobs that are WORLDWIDE, or COUNTRY-scoped to their own country, or ones
// they posted themselves (so a user who relocates never loses sight of
// their own posting).
//
// This is deliberately independent of the `country`/`countryIds` list
// filters: visibility answers "what am I allowed to see", the filters
// answer "what do I want to see".
// ---------------------------------------------------------------------------

export { getViewerScope, type ViewerScope };

export function applyJobVisibilityRestriction(
  qb: Knex.QueryBuilder,
  prefix: string,
  viewerId: string,
  scope: ViewerScope,
): void {
  qb.andWhere(function (this: Knex.QueryBuilder) {
    this.where(`${prefix}visibility_type`, 'WORLDWIDE')
      .orWhere(`${prefix}user_id`, viewerId);

    if (scope.countryId) {
      this.orWhere(function (this: Knex.QueryBuilder) {
        this.where(`${prefix}visibility_type`, 'COUNTRY')
          .andWhere(`${prefix}country_id`, scope.countryId);
      });
    }

    if (scope.countryName) {
      // Jobs created before country_id existed only have the free-text
      // country column. The whereNull keeps this branch mutually exclusive
      // with the id branch above, so a row whose id and name disagree can
      // never leak in through the weaker name match.
      this.orWhere(function (this: Knex.QueryBuilder) {
        this.where(`${prefix}visibility_type`, 'COUNTRY')
          .whereNull(`${prefix}country_id`)
          .andWhereRaw(`LOWER(${prefix}country) = LOWER(?)`, [scope.countryName]);
      });
    }
  });
}
