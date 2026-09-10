/**
 * Picks the agency organizations out of the Upwork company selector.
 *
 * An agency is `Business` AND `Vendor`. BOTH are required, as measured against
 * a real account:
 *   - a freelancer's own org is `SoleProprietor` + `Vendor`
 *   - a company's client-side org is `Business` + `Client`
 *   - the agency is `Business` + `Vendor`
 *
 * `typeTitle` would say "Agency" outright but is scope-blocked on real tokens,
 * so it must never be requested: a denied field aborts the entire query.
 *
 * This is a pre-filter on cheap selector data. `organization.flag.agency` is
 * the authoritative confirmation and is returned by `fetchUpworkAgencyStaff`.
 */

export type UpworkCompanySelectorItemForSelection = {
  title: string;
  organizationId: string;
  organizationType?: string | null;
  organizationLegacyType?: string | null;
};

export type UpworkAgencyOrganization = {
  organizationId: string;
  title: string;
};

const normalize = (value: string | null | undefined): string =>
  (value ?? "").trim().toLowerCase();

export function selectAgencyOrganizations(
  items: UpworkCompanySelectorItemForSelection[],
): UpworkAgencyOrganization[] {
  return items
    .filter(
      (item) =>
        normalize(item.organizationType) === "business" &&
        normalize(item.organizationLegacyType) === "vendor",
    )
    .map((item) => ({
      organizationId: String(item.organizationId),
      title: item.title?.trim() || "Agency",
    }));
}
