import {
  fetchUpworkAgencyStaff,
  fetchUpworkCompanySelector,
  fetchUpworkSelfTalentProfile,
  fetchUpworkTalentProfilesByPersonIds,
} from "@/lib/upwork/client";
import { selectAgencyOrganizations } from "@/lib/upwork/select-agency-organizations";
import type { UpworkQuotaContext } from "@/lib/upwork/quota";
import type {
  UpworkAgencyStaffMember,
  UpworkTalentProfile,
} from "@/lib/upwork/agency-member-types";

export type UpworkPersonaCandidate = {
  member: UpworkAgencyStaffMember;
  /** Null when Upwork returned no talent profile for this person. */
  profile: UpworkTalentProfile | null;
};

export type UpworkPersonaCandidateSource = {
  /**
   * `agency` = a roster, `self` = just the connected user, `none` = nothing
   * importable (e.g. a client-only Upwork account).
   */
  reason: "agency" | "self" | "none";
  organization: { organizationId: string; title: string } | null;
  /** An agency exists but Upwork refused its roster with view_staff denied. */
  agencyPermissionDenied: boolean;
  agencyName: string | null;
  /** Upwork's staff totalCount, which counts ROWS, not people. */
  totalCount: number;
  /** Raw staff rows on this page, before deduping. */
  rowCount: number;
  candidates: UpworkPersonaCandidate[];
};

/**
 * Resolves who can be imported from Upwork, shared by the preview (GET) and the
 * bulk import (POST) so the two can never disagree about the roster.
 *
 * Costs up to 3 Upwork API calls on the agency path and 2 on the solo path, all
 * quota-tracked through `opts.quotaContext`.
 *
 * The fallback to the connected user is keyed on "no members obtained", NOT on
 * "no agency found": an agency member without the `view_staff` Upwork account
 * permission has an agency but cannot list it.
 */
export async function resolveUpworkPersonaCandidates(
  accessToken: string,
  opts: {
    quotaContext: UpworkQuotaContext;
    /** An UPWORK organization id (an agency), not this app's tenancy. */
    organizationId?: string;
  },
): Promise<UpworkPersonaCandidateSource> {
  const { quotaContext, organizationId } = opts;

  const selectorItems = await fetchUpworkCompanySelector(accessToken, {
    quotaContext,
  });
  const agencies = selectAgencyOrganizations(selectorItems);

  const agency = organizationId
    ? agencies.find((a) => a.organizationId === organizationId)
    : agencies[0];

  const roster = agency
    ? await fetchUpworkAgencyStaff(accessToken, agency.organizationId, {
        quotaContext,
      })
    : null;

  const agencyPermissionDenied = roster?.permissionDenied === true;
  const agencyName = agency?.title ?? null;

  if (agency && roster && roster.members.length > 0) {
    const profiles = await fetchUpworkTalentProfilesByPersonIds(
      accessToken,
      roster.members.map((m) => m.personId),
      { quotaContext, tenantId: agency.organizationId },
    );

    return {
      reason: "agency",
      organization: agency,
      agencyPermissionDenied: false,
      agencyName,
      totalCount: roster.totalCount,
      rowCount: roster.rowCount,
      candidates: roster.members.map((member) => ({
        member,
        profile: profiles.get(member.personId) ?? null,
      })),
    };
  }

  const self = await fetchUpworkSelfTalentProfile(accessToken, {
    quotaContext,
  });

  if (!self) {
    return {
      reason: "none",
      organization: null,
      agencyPermissionDenied,
      agencyName,
      totalCount: 0,
      rowCount: 0,
      candidates: [],
    };
  }

  return {
    reason: "self",
    organization: null,
    agencyPermissionDenied,
    agencyName,
    totalCount: 1,
    rowCount: 1,
    candidates: [{ member: self.member, profile: self.profile }],
  };
}
