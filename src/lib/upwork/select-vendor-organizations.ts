/**
 * Picks the organizations the connected Upwork account can SEND PROPOSALS from.
 *
 * Upwork OAuth authenticates a PERSON, not an organization: the org is chosen
 * per request via `X-Upwork-API-TenantId`, and nothing in the token or in
 * `companySelector` marks one as "the one they connected with". So we never try
 * to detect a connected account. We narrow to what the person can act as on the
 * vendor side and let the caller decide from the count.
 *
 * Measured shapes on a real account:
 *   - the person's own freelancer profile: `SoleProprietor` + `Vendor`
 *   - an agency they belong to:            `Business`       + `Vendor`
 *   - a client-side org:                   `Business`       + `Client`
 *
 * The dashboard chart is driven by the vendor-side `vendorProposals` query, so
 * a client org could only ever produce an empty result.
 *
 * This is deliberately looser than `selectAgencyOrganizations`, which requires
 * `Business` AND `Vendor` because personas come from an agency roster. A solo
 * freelancer has no agency and must still get their own org here, so the test
 * is `Vendor` alone.
 *
 * `typeTitle` would name the kind outright but is scope-blocked on real tokens,
 * and a denied field aborts the whole query, so it must never be requested.
 */

export type UpworkVendorOrganizationKind = "personal" | "agency" | "unknown";

export type UpworkCompanySelectorItemForVendorSelection = {
  title: string;
  organizationId: string;
  organizationType?: string | null;
  organizationLegacyType?: string | null;
};

export type UpworkVendorOrganization = {
  organizationId: string;
  title: string;
  kind: UpworkVendorOrganizationKind;
};

/**
 * What `fetchVendorProposalsForActivity` needs to scope a request: the tenant
 * header and the `organizationId_eq` filter. Declared here to keep this module
 * free of imports from the network layer.
 */
export type UpworkVendorTenantSelection = {
  tenantId?: string;
  organizationIdEq?: string;
};

const normalize = (value: string | null | undefined): string =>
  (value ?? "").trim().toLowerCase();

function kindOf(
  organizationType: string | null | undefined,
): UpworkVendorOrganizationKind {
  switch (normalize(organizationType)) {
    case "soleproprietor":
      return "personal";
    case "business":
      return "agency";
    default:
      return "unknown";
  }
}

export function selectVendorOrganizations(
  items: UpworkCompanySelectorItemForVendorSelection[],
): UpworkVendorOrganization[] {
  return items
    .filter((item) => normalize(item.organizationLegacyType) === "vendor")
    .map((item) => ({
      organizationId: String(item.organizationId),
      title: item.title?.trim() || "Organization",
      kind: kindOf(item.organizationType),
    }));
}

/**
 * Resolves the dashboard `context` query param against the vendor orgs.
 *
 * An empty, legacy `personal`, or unknown value falls back to the first vendor
 * org. An account with NO vendor org gets no tenant at all, rather than
 * whatever `companySelector` happened to return first, which could be a client
 * org that has no vendor proposals.
 */
export function pickDashboardVendorContext(
  vendorOrganizations: UpworkVendorOrganization[],
  contextParam: string | null,
): UpworkVendorTenantSelection {
  const first = vendorOrganizations[0];
  const raw = (contextParam ?? "").trim();

  const match =
    raw === "" || raw.toLowerCase() === "personal"
      ? first
      : (vendorOrganizations.find((org) => org.organizationId === raw) ?? first);

  if (!match) return {};

  return {
    tenantId: match.organizationId,
    organizationIdEq: match.organizationId,
  };
}
