import type { Knex } from 'knex';
import { getViewerScope, type ViewerScope } from './business-visibility.service';

// ---------------------------------------------------------------------------
// Shared non-admin visibility restriction for events — mirrors
// business-visibility.service.ts exactly (`getViewerScope` is fully
// generic — it only reads `users.country`/`country_id` — so it's reused
// directly rather than duplicated, same as job-visibility.service.ts). A
// regular user should only ever see events that are WORLDWIDE, or
// COUNTRY-scoped to their own country, or ones they own themselves (so a
// user who relocates never loses sight of their own submission).
//
// This is deliberately independent of the `country` list filter: visibility
// answers "what am I allowed to see", the filter answers "what do I want to
// see".
// ---------------------------------------------------------------------------

export { getViewerScope, type ViewerScope };

export function applyEventVisibilityRestriction(
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
      // Events created before country_id existed only have the free-text
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
