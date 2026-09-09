import type { Knex } from 'knex';
import db from '../config/db';

// ---------------------------------------------------------------------------
// Shared non-admin visibility restriction for businesses — mirrors
// community-visibility.service.ts. A regular user should only ever see
// businesses that are WORLDWIDE, or COUNTRY-scoped to their own country, or
// ones they own themselves (so a user who relocates never loses sight of
// their own listing).
//
// This is deliberately independent of the `country` / `countryIds` list
// filters: visibility answers "what am I allowed to see", the filters answer
// "what do I want to see". Picking another country in the filter therefore
// surfaces that country's WORLDWIDE businesses but not its country-scoped
// ones — which is what COUNTRY scoping means.
// ---------------------------------------------------------------------------

export interface ViewerScope {
  countryId: number | null;
  countryName: string | null;
}

export async function getViewerScope(userId: string): Promise<ViewerScope> {
  const row = await db('users').where({ id: userId }).first('country_id', 'country') as
    { country_id: number | null; country: string | null } | undefined;
  return { countryId: row?.country_id ?? null, countryName: row?.country ?? null };
}

export function applyBusinessVisibilityRestriction(
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
      // Businesses created before country_id existed only have the free-text
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
