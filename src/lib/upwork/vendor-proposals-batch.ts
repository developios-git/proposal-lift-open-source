/**
 * Vendor proposal fetching: query construction, response parsing, and merging.
 *
 * Upwork's `VendorProposalFilter.status_eq` is a non-null single enum, so there
 * is no way to ask for every status in one filter. We instead alias the same
 * `vendorProposals` field once per status into a single document, which costs
 * one HTTP request and one quota unit instead of eight.
 *
 * `vendorProposals` returns `VendorProposalsConnection!`, so an error in any one
 * alias propagates up to `data` (there is no nullable parent below it) and the
 * whole batch comes back null. That is why the caller keeps the per-status path
 * as a fallback rather than trying to salvage a partial response.
 *
 * This module is deliberately free of imports from the network layer so it can
 * be unit-tested without pulling in Supabase or the quota tables. See
 * `select-vendor-organizations.ts` for the same convention.
 */

/** `VendorProposalFilter.status_eq` — Upwork requires a non-null status; query each and merge. */
export const VENDOR_PROPOSAL_STATUS_FILTER_INPUTS = [
  "Pending",
  "Accepted",
  "Offered",
  "Activated",
  "Hired",
  "Declined",
  "Withdrawn",
  "Archived",
] as const;

export type VendorProposalStatusFilterInput =
  (typeof VENDOR_PROPOSAL_STATUS_FILTER_INPUTS)[number];

export interface UpworkDateTimeObject {
  rawValue: string;
  displayValue: string;
}

export interface VendorProposalAuditDetails {
  createdDateTime: UpworkDateTimeObject;
  modifiedDateTime: UpworkDateTimeObject | null;
}

export interface VendorProposalJobPosting {
  id: string | number;
  content: { title: string } | null;
  clientCompanyPublic: {
    city: string | null;
    country: { name: string | null } | null;
  } | null;
}

export interface VendorProposalGraphqlNode {
  id: string | number;
  status: { status: string } | null;
  auditDetails: VendorProposalAuditDetails;
  marketplaceJobPosting: VendorProposalJobPosting | null;
}

export interface VendorProposalEdge {
  cursor: string;
  node: VendorProposalGraphqlNode;
}

export interface VendorProposalsConnection {
  totalCount: number;
  edges: VendorProposalEdge[];
  pageInfo: {
    hasNextPage: boolean;
    endCursor: string | null;
  };
}

export interface VendorProposalsGraphqlResponse {
  data: {
    vendorProposals: VendorProposalsConnection;
  };
  errors?: { message: string }[];
}

/** Aliased batch response: one connection per status, keyed by the alias. */
export interface VendorProposalsBatchGraphqlResponse {
  data: Record<string, VendorProposalsConnection | null> | null;
  errors?: { message: string; path?: (string | number)[] }[];
}

export interface UpworkVendorProposalActivityItem {
  vendorProposalId: string;
  jobPostingId: string | null;
  jobTitle: string;
  clientLabel: string;
  /**
   * The country on its own, kept separate from `clientLabel` because the label
   * is pre-joined ("Hinsdale, United States") and the flag lookup needs the
   * country alone. `null` when Upwork gave only a city, which renders as plain
   * text with no flag.
   */
  clientCountry: string | null;
  status: string;
  activityAt: string;
  submittedAt: string;
}

// ---------- Query construction ----------

/**
 * GraphQL aliases must be valid names, so a status maps to its lowercased form.
 * Every status in the list is alphabetic, so no further escaping is needed.
 */
export function aliasForStatus(status: VendorProposalStatusFilterInput): string {
  return status.toLowerCase();
}

const VENDOR_PROPOSAL_CONNECTION_FRAGMENT = `
fragment VendorProposalsBatchConnection on VendorProposalsConnection {
  totalCount
  edges {
    cursor
    node {
      id
      status {
        status
      }
      auditDetails {
        createdDateTime {
          rawValue
          displayValue
        }
        modifiedDateTime {
          rawValue
          displayValue
        }
      }
      marketplaceJobPosting {
        id
        content {
          title
        }
        clientCompanyPublic {
          city
          country {
            name
          }
        }
      }
    }
  }
  pageInfo {
    hasNextPage
    endCursor
  }
}
`;

/**
 * Builds the aliased document — one `vendorProposals` call per status.
 *
 * `organizationId_eq` is written into the document or omitted entirely rather
 * than passed as a nullable variable, because an explicit `null` is not
 * guaranteed to mean the same thing to Upwork as an absent field.
 */
function buildQuery(scoped: boolean): string {
  const orgVariable = scoped ? ", $org: ID!" : "";
  const orgFilter = scoped ? ", organizationId_eq: $org" : "";

  const aliases = VENDOR_PROPOSAL_STATUS_FILTER_INPUTS.map(
    (status) => `  ${aliasForStatus(status)}: vendorProposals(
    filter: { status_eq: ${status}${orgFilter} }
    sortAttribute: { field: MODIFIEDDATETIME, sortOrder: DESC }
    pagination: { first: $first }
  ) {
    ...VendorProposalsBatchConnection
  }`,
  ).join("\n");

  return `query VendorProposalsBatch($first: Int!${orgVariable}) {
${aliases}
}
${VENDOR_PROPOSAL_CONNECTION_FRAGMENT}`;
}

const SCOPED_BATCH_QUERY = buildQuery(true);
const UNSCOPED_BATCH_QUERY = buildQuery(false);

/** Cached per variant — the document only depends on whether an org is scoped. */
export function buildVendorProposalsBatchQuery(scoped: boolean): string {
  return scoped ? SCOPED_BATCH_QUERY : UNSCOPED_BATCH_QUERY;
}

// ---------- Response parsing ----------

/**
 * Thrown when the batch yielded nothing usable — `data` was null (the expected
 * shape when any alias errors, given the non-null connection type) or every
 * alias was missing. The caller falls back to the per-status path.
 */
export class VendorProposalsBatchUnavailableError extends Error {
  readonly detail: string;

  constructor(detail: string) {
    super(`Batched vendorProposals query returned no usable data: ${detail}`);
    this.name = "VendorProposalsBatchUnavailableError";
    this.detail = detail;
  }
}

export interface ParsedVendorProposalsBatch {
  /** Edges per status that came back, in status-list order. */
  edgeGroups: VendorProposalEdge[][];
  /** Statuses whose alias was missing or null — surfaced so nothing is dropped silently. */
  failedStatuses: VendorProposalStatusFilterInput[];
}

export function parseVendorProposalsBatch(
  response: VendorProposalsBatchGraphqlResponse,
): ParsedVendorProposalsBatch {
  const data = response.data;

  if (!data) {
    const messages = (response.errors ?? [])
      .map((e) => e.message)
      .filter(Boolean)
      .join("; ");
    throw new VendorProposalsBatchUnavailableError(
      messages || "data was null with no error message",
    );
  }

  const edgeGroups: VendorProposalEdge[][] = [];
  const failedStatuses: VendorProposalStatusFilterInput[] = [];

  for (const status of VENDOR_PROPOSAL_STATUS_FILTER_INPUTS) {
    const connection = data[aliasForStatus(status)];
    if (!connection || !Array.isArray(connection.edges)) {
      failedStatuses.push(status);
      continue;
    }
    edgeGroups.push(connection.edges);
  }

  if (edgeGroups.length === 0) {
    throw new VendorProposalsBatchUnavailableError(
      "every status alias was missing from the response",
    );
  }

  return { edgeGroups, failedStatuses };
}

// ---------- Node mapping ----------

/**
 * Upwork DateTime is an object (rawValue / displayValue). Best-effort ISO string
 * for sorting; falls back to null if unparsable.
 */
export function upworkDateTimeToIso(
  dt: UpworkDateTimeObject | null | undefined,
): string | null {
  if (!dt) return null;
  const raw = dt.rawValue?.trim() ?? "";
  if (raw) {
    if (/^\d{10}$/.test(raw)) {
      const d = new Date(Number(raw) * 1000);
      if (!Number.isNaN(d.getTime())) return d.toISOString();
    }
    if (/^\d{13}$/.test(raw)) {
      const d = new Date(Number(raw));
      if (!Number.isNaN(d.getTime())) return d.toISOString();
    }
    const parsed = Date.parse(raw);
    if (!Number.isNaN(parsed)) return new Date(parsed).toISOString();
  }
  return null;
}

function activityAtFromProposalAudit(
  audit: VendorProposalAuditDetails,
  /** API returns proposals sorted by MODIFIEDDATETIME DESC; used when timestamps are not parseable. */
  orderIndex: number,
): string {
  const fromModified = upworkDateTimeToIso(audit.modifiedDateTime ?? undefined);
  if (fromModified) return fromModified;
  const fromCreated = upworkDateTimeToIso(audit.createdDateTime);
  if (fromCreated) return fromCreated;
  return new Date(Date.now() - orderIndex * 90_000).toISOString();
}

function clientLabelFromPosting(posting: {
  clientCompanyPublic: {
    city: string | null;
    country: { name: string | null } | null;
  } | null;
}): string {
  const pub = posting.clientCompanyPublic;
  if (!pub) return "Client";
  const parts = [pub.city, pub.country?.name].filter(Boolean);
  if (parts.length === 0) return "Client";
  return parts.join(", ");
}

function clientCountryFromPosting(posting: {
  clientCompanyPublic: {
    country: { name: string | null } | null;
  } | null;
}): string | null {
  return posting.clientCompanyPublic?.country?.name?.trim() || null;
}

export function mapVendorProposalNode(
  node: VendorProposalGraphqlNode,
  orderIndex: number,
): UpworkVendorProposalActivityItem {
  const posting = node.marketplaceJobPosting;
  const title = posting?.content?.title?.trim() || "Job posting";
  const at = activityAtFromProposalAudit(node.auditDetails, orderIndex);

  return {
    vendorProposalId: String(node.id),
    jobPostingId: posting ? String(posting.id) : null,
    jobTitle: title,
    clientLabel: posting ? clientLabelFromPosting(posting) : "Client",
    clientCountry: posting ? clientCountryFromPosting(posting) : null,
    status: node.status?.status ?? "Unknown",
    activityAt: at,
    submittedAt: upworkDateTimeToIso(node.auditDetails.createdDateTime) ?? at,
  };
}

// ---------- Merging ----------

/**
 * One proposal can appear under several status buckets, so the copy with the
 * later `activityAt` wins — that is the most current view of its status.
 *
 * Shared by the batched path and the per-status fallback so the two can never
 * disagree about how results are deduped.
 */
export function mergeVendorProposalEdgeGroups(
  edgeGroups: VendorProposalEdge[][],
): Map<string, UpworkVendorProposalActivityItem> {
  const bestById = new Map<string, UpworkVendorProposalActivityItem>();

  for (const edges of edgeGroups) {
    for (let ei = 0; ei < edges.length; ei++) {
      const item = mapVendorProposalNode(edges[ei].node, ei);
      const prev = bestById.get(item.vendorProposalId);
      if (
        !prev ||
        new Date(item.activityAt).getTime() >
          new Date(prev.activityAt).getTime()
      ) {
        bestById.set(item.vendorProposalId, item);
      }
    }
  }

  return bestById;
}
