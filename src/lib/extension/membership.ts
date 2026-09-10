/**
 * Who a request acts as.
 *
 * Upstream `ProposalTenant` was a two-arm union — an organization or a solo
 * user — and resolving it meant an `organization_members` lookup plus an
 * `organizations` status check on every call. Every row here is owned by exactly
 * one user, so the union collapses to a single arm and the resolution
 * disappears: the caller already has the user id from `auth.getUser()`.
 *
 * The type is kept (rather than passing a bare string) because ~40 call sites
 * take a `ProposalTenant`, and because `tenant.userId` reads more clearly than
 * an untyped id at a call boundary.
 *
 * Also gone with the union: `listOrganizationsForUser`,
 * `userBelongsToOrganization`, and `resolveOrganizationIdForUser`. There is no
 * membership to check — RLS (`user_id = auth.uid()`) is the only authorization
 * boundary, and it is enforced by the database rather than by these helpers.
 */
export type ProposalTenant = { userId: string };

/** Trivial by construction — kept so call sites read as intent, not plumbing. */
export function proposalTenantForUser(userId: string): ProposalTenant {
  return { userId };
}
