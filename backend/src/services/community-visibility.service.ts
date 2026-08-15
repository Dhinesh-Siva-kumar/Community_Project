import db from '../config/db';

// ---------------------------------------------------------------------------
// Shared non-admin visibility restriction — a regular user should only ever
// see communities (and, by extension, community posts) that are global, or
// private and scoped to their own country, or ones they've already joined
// (so relocating, or a private community someone joined narrowing its scope,
// never silently hides something they're already a member of). Used by both
// communities.service.ts (the browse list + header counts) and
// posts.service.ts ("Popular posts" and the general feed), so a post from a
// community a user isn't allowed to see never surfaces anywhere either.
// ---------------------------------------------------------------------------

export async function getUserCountry(userId: string): Promise<string | null> {
  const row = await db('users').where({ id: userId }).select('country').first() as { country: string | null } | undefined;
  return row?.country ?? null;
}

export function applyNonAdminVisibilityRestriction(
  qb: { andWhere: (cb: (qb: any) => void) => any },
  prefix: string,
  userId: string,
  userCountry: string | null,
): void {
  qb.andWhere(function (this: any) {
    this.where(`${prefix}is_global`, true)
      .orWhereIn(`${prefix}id`, db('community_members').select('community_id').where('user_id', userId));
    if (userCountry) {
      this.orWhere(function (this: any) {
        this.where(`${prefix}is_private`, true).andWhere(`${prefix}country`, userCountry);
      });
    }
  });
}
