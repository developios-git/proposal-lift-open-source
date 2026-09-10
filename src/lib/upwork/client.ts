// Upwork OAuth2 + GraphQL API Client
//
// OAuth client id/secret/redirect always come from the calling user's own
// Upwork app, resolved by `resolve-oauth-credentials`. There is no platform app
// and no shared-app fallback.
//
// NOTE ON NAMING: "organization" throughout this file means an *Upwork*
// organization — the entities returned by `companySelector` and addressed via
// the `X-Upwork-API-TenantId` header (a freelancer's own profile, or an agency
// they belong to). It has nothing to do with this app's tenancy, which is a
// single user per row. Do not strip these.

import {
  checkAndIncrementUpworkQuota,
  midnightUtcResetAt,
  UpworkQuotaExceededError,
} from "@/lib/upwork/quota";
import type { UpworkQuotaContext } from "@/lib/upwork/quota";
import type {
  UpworkAgencyStaffMember,
  UpworkTalentProfile,
} from "@/lib/upwork/agency-member-types";
import {
  buildVendorProposalsBatchQuery,
  mapVendorProposalNode,
  mergeVendorProposalEdgeGroups,
  parseVendorProposalsBatch,
  VENDOR_PROPOSAL_STATUS_FILTER_INPUTS,
  VendorProposalsBatchUnavailableError,
} from "@/lib/upwork/vendor-proposals-batch";
import type {
  UpworkDateTimeObject,
  UpworkVendorProposalActivityItem,
  VendorProposalEdge,
  VendorProposalsBatchGraphqlResponse,
  VendorProposalsGraphqlResponse,
} from "@/lib/upwork/vendor-proposals-batch";

export type { UpworkVendorProposalActivityItem };

const UPWORK_AUTH_URL =
  "https://www.upwork.com/ab/account-security/oauth2/authorize";
const UPWORK_TOKEN_URL = "https://www.upwork.com/api/v3/oauth2/token";
const UPWORK_GRAPHQL_URL = "https://api.upwork.com/graphql";

// ---------- Types ----------

export interface UpworkTokens {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  expires_at?: string; // ISO date when token expires
}

export interface UpworkJobAmount {
  value: number | null;
  currency: string | null;
}

export interface UpworkJobSkill {
  name: string;
  prettyName: string;
}

export interface UpworkJobClient {
  totalSpent: { value: number | null; currency: string | null } | null;
  totalHires: number | null;
  totalPostedJobs: number | null;
  totalReviews: number | null;
  /** Average feedback score the client has received. Upwork's name for the star rating. */
  totalFeedback: number | null;
  /** Marked "deprecated legacy field" in Upwork's schema — may be null for some clients. */
  memberSinceDateTime: string | null;
  /** Title of the client's most recent contract — what they last hired someone for. Nullable. */
  lastContractTitle: string | null;
  /**
   * No client name is available. Upwork marks `companyName` on this type
   * "Not supported anymore" and it always returns null, and the job-detail
   * `clientCompanyPublic` object carries no name field at all. City + country
   * is the closest identity signal the marketplace API exposes.
   */
  verificationStatus: string | null;
  /**
   * When true the client has hidden their spend, so `totalSpent` comes back
   * null for a reason. Client Rank reports that as unknown rather than scoring
   * it as zero.
   */
  hasFinancialPrivacy: boolean | null;
  location: {
    country: string | null;
    /** Upwork returns a city on most postings — sharpens the bare country signal. */
    city: string | null;
  } | null;
}

export interface UpworkJob {
  id: string;
  ciphertext: string | null;
  title: string;
  description: string;
  createdDateTime: string;
  duration: string | null;
  durationLabel: string | null;
  engagement: string | null;
  amount: UpworkJobAmount | null;
  skills: UpworkJobSkill[];
  experienceLevel: string | null;
  category: string | null;
  subcategory: string | null;
  /** Number of freelancers who have applied so far. */
  totalApplicants: number | null;
  /** Set only when the client has re-posted/renewed the listing. */
  renewedDateTime: string | null;
  /** Countries the client prefers freelancers from. Empty/null means no preference. */
  preferredFreelancerLocation: string[] | null;
  preferredFreelancerLocationMandatory: boolean | null;
  /**
   * Upwork's own "current user already applied" flag. Scoped to the OAuth
   * account that made the request, so when that account is an Upwork agency it
   * means "someone on this Upwork account applied", not "you personally".
   */
  applied: boolean | null;
  client: UpworkJobClient | null;
}

interface UpworkJobEdge {
  node: UpworkJob;
}

interface MarketplaceJobPostingsResponse {
  data: {
    marketplaceJobPostingsSearch: {
      totalCount: number;
      edges: UpworkJobEdge[];
      pageInfo: {
        hasNextPage: boolean;
        endCursor: string | null;
      };
    };
  };
  errors?: { message: string }[];
}

// ---------- OAuth2 Helpers ----------

export type UpworkOAuthClientConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

/**
 * Build the Upwork OAuth2 authorization URL.
 * The `state` parameter is used for CSRF protection.
 */
export function getUpworkAuthUrl(
  state: string,
  oauth: Pick<UpworkOAuthClientConfig, "clientId" | "redirectUri">,
): string {
  const params = new URLSearchParams({
    client_id: oauth.clientId,
    redirect_uri: oauth.redirectUri,
    response_type: "code",
    state,
  });

  return `${UPWORK_AUTH_URL}?${params.toString()}`;
}

/**
 * Exchange an authorization code for access + refresh tokens.
 */
export async function exchangeCodeForTokens(
  code: string,
  oauth: UpworkOAuthClientConfig,
): Promise<UpworkTokens> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: oauth.clientId,
    client_secret: oauth.clientSecret,
    redirect_uri: oauth.redirectUri,
  });

  const response = await fetch(UPWORK_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Upwork token exchange failed (${response.status}): ${errorText}`,
    );
  }

  const data = await response.json();

  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    token_type: data.token_type,
    expires_in: data.expires_in,
    expires_at: new Date(Date.now() + data.expires_in * 1000).toISOString(),
  };
}

/**
 * Refresh an expired access token using the refresh token.
 * Refresh tokens have a 2-week rolling TTL.
 */
export async function refreshUpworkTokens(
  refreshToken: string,
  oauth: Pick<UpworkOAuthClientConfig, "clientId" | "clientSecret">,
): Promise<UpworkTokens> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: oauth.clientId,
    client_secret: oauth.clientSecret,
  });

  const response = await fetch(UPWORK_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Upwork token refresh failed (${response.status}): ${errorText}`,
    );
  }

  const data = await response.json();

  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    token_type: data.token_type,
    expires_in: data.expires_in,
    expires_at: new Date(Date.now() + data.expires_in * 1000).toISOString(),
  };
}

// ---------- GraphQL ----------

const SEARCH_JOBS_QUERY = `
query(
  $marketPlaceJobFilter: MarketplaceJobPostingsSearchFilter,
  $searchType: MarketplaceJobPostingSearchType,
  $sortAttributes: [MarketplaceJobPostingSearchSortAttribute]
) {
  marketplaceJobPostingsSearch(
    marketPlaceJobFilter: $marketPlaceJobFilter,
    searchType: $searchType,
    sortAttributes: $sortAttributes
  ) {
    totalCount
    edges
    {
      node {
        id
        title
        createdDateTime
        description
        duration
        durationLabel
        engagement
       ciphertext
        amount {
            rawValue
          currency
        }
        skills {
          name
          prettyName
        }
          hourlyBudgetMin{
          rawValue
          currency
          displayValue
          }
          hourlyBudgetMax{
          rawValue
          currency
          displayValue
          }
        
        experienceLevel
        category
        subcategory
        totalApplicants
        renewedDateTime
        preferredFreelancerLocation
        preferredFreelancerLocationMandatory
        applied
        client {
          totalSpent {
              rawValue
            currency
          }
          totalHires
          totalPostedJobs
          totalReviews
          totalFeedback
          memberSinceDateTime
          lastContractTitle
          verificationStatus
          hasFinancialPrivacy
          location {
            country
            city
          }
        }
      }
    }
    pageInfo {
      hasNextPage
      endCursor
    }
  }
}
`;

// ---------- Schema Introspection ----------

/** Unwraps LIST/NON_NULL to get the leaf type's name and kind */
// function resolveLeafType(t: IntrospectionFieldType): {
//   name: string | null;
//   kind: string;
// } {
//   if (t.kind === "LIST" || t.kind === "NON_NULL") {
//     return t.ofType
//       ? resolveLeafType(t.ofType)
//       : { name: t.name, kind: t.kind };
//   }
//   return { name: t.name, kind: t.kind };
// }

// const INTROSPECTION_QUERY = `
//   query IntrospectType($typeName: String!) {
//     __type(name: $typeName) {
//       name
//       kind
//       fields {
//         name
//         type {
//           name
//           kind
//           ofType {
//             name
//             kind
//             ofType {
//               name
//               kind
//               ofType {
//                 name
//                 kind
//               }
//             }
//           }
//         }
//       }
//     }
//   }
// `;

// interface IntrospectionFieldType {
//   name: string | null;
//   kind: string;
//   ofType?: IntrospectionFieldType | null;
// }

// interface IntrospectionField {
//   name: string;
//   type: IntrospectionFieldType;
// }

// interface IntrospectionResponse {
//   data: {
//     __type: {
//       name: string;
//       kind: string;
//       fields: IntrospectionField[] | null;
//     } | null;
//   };
//   errors?: { message: string }[];
// }

// export interface SchemaFieldInfo {
//   name: string;
//   typeName: string | null;
//   kind: string;
//   fields?: SchemaFieldInfo[] | null;
// }

// /**
//  * Inspect the Upwork GraphQL schema to discover fields on a type.
//  * Recursively fetches nested object/interface fields.
//  *
//  * @param accessToken - Valid Upwork OAuth2 access token
//  * @param typeName - GraphQL type name to inspect (e.g. "MarketplaceJobPosting", "MarketplaceJobPostingSearchResult")
//  * @param options.recursive - When true, fetches nested object fields (default: true)
//  * @returns Array of field info with nested fields for object types, or null if type doesn't exist
//  */
// export async function inspectUpworkSchemaType(
//   accessToken: string,
//   typeName: string,
//   options?: { recursive?: boolean },
// ): Promise<SchemaFieldInfo[] | null> {
//   const recursive = options?.recursive !== false;
//   return inspectUpworkSchemaTypeRecursive(
//     accessToken,
//     typeName,
//     recursive ? new Set<string>() : undefined,
//   );
// }

// async function inspectUpworkSchemaTypeRecursive(
//   accessToken: string,
//   typeName: string,
//   seen?: Set<string>,
// ): Promise<SchemaFieldInfo[] | null> {
//   if (seen?.has(typeName)) {
//     return []; // cycle detected
//   }
//   seen?.add(typeName);

//   const result = await upworkGraphQL<IntrospectionResponse>(
//     accessToken,
//     INTROSPECTION_QUERY,
//     { typeName },
//   );

//   const type = result.data.__type;
//   if (!type || !type.fields) {
//     return null;
//   }

//   const fields: SchemaFieldInfo[] = [];

//   for (const f of type.fields) {
//     const leaf = resolveLeafType(f.type);
//     const info: SchemaFieldInfo = {
//       name: f.name,
//       typeName: leaf.name,
//       kind: leaf.kind,
//     };

//     if (
//       (leaf.kind === "OBJECT" || leaf.kind === "INTERFACE") &&
//       leaf.name &&
//       seen
//     ) {
//       const nested = await inspectUpworkSchemaTypeRecursive(
//         accessToken,
//         leaf.name,
//         seen,
//       );
//       if (nested) {
//         info.fields = nested;
//       }
//     }

//     fields.push(info);
//   }

//   return fields;
// }

export type UpworkGraphqlRequestOptions = {
  /** Upwork organization context (X-Upwork-API-TenantId). Use for agency/org API calls. */
  tenantId?: string;
  /** When provided, daily Upwork API quota is checked and incremented before the call. */
  quotaContext?: UpworkQuotaContext;
};

/**
 * Make an authenticated GraphQL request to the Upwork API.
 *
 * Upstream also accepted `sharedBudget`, which charged the call against a
 * platform-wide daily budget for the shared Upwork app. Every call here is made
 * with the user's own app against their own quota.
 */
async function upworkGraphQL<T>(
  accessToken: string,
  query: string,
  variables: Record<string, unknown>,
  options?: UpworkGraphqlRequestOptions,
): Promise<T> {
  if (options?.quotaContext) {
    const result = await checkAndIncrementUpworkQuota(options.quotaContext);
    if (!result.allowed) {
      throw new UpworkQuotaExceededError(
        result.used,
        result.limit,
        midnightUtcResetAt(),
      );
    }
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${accessToken}`,
  };
  if (options?.tenantId) {
    headers["X-Upwork-API-TenantId"] = options.tenantId;
  }

  const response = await fetch(UPWORK_GRAPHQL_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({ query, variables }),
  });

  const text = await response.text();

  if (!response.ok) {
    let detail = text.slice(0, 500);
    try {
      const errJson = JSON.parse(text) as {
        errors?: { message: string }[];
        message?: string;
      };
      if (errJson.errors?.[0]?.message) {
        detail = errJson.errors[0].message;
      } else if (errJson.message) {
        detail = errJson.message;
      }
    } catch {
      /* use slice */
    }
    console.error("Upwork GraphQL HTTP error:", response.status, detail);
    throw new Error(
      `Upwork GraphQL request failed (${response.status}): ${detail}`,
    );
  }

  const result = JSON.parse(text) as {
    data?: unknown;
    errors?: { message: string }[];
  };

  if (Array.isArray(result.errors) && result.errors.length > 0) {
    if (result.data == null) {
      const messages = result.errors.map((e) => e.message).join("; ");
      throw new Error(`Upwork GraphQL errors: ${messages}`);
    }
    // Partial success — some nodes failed but data is still present. Log and continue.
    console.warn(
      "Upwork GraphQL partial errors (skipping affected nodes):",
      result.errors.map((e) => e.message).join("; "),
    );
  }

  return result as T;
}

/** Pagination metadata returned by job fetch functions */
export interface UpworkJobsPageResult {
  jobs: UpworkJob[];
  totalCount: number;
  hasNextPage: boolean;
  endCursor: string | null;
}

/**
 * Search Upwork job postings using the marketplace GraphQL API.
 *
 * @param accessToken - Valid Upwork OAuth2 access token
 * @param searchTerms - Space-separated search keywords
 * @param limit - Max number of results (API may cap this)
 * @param after - Cursor for pagination (omit or pass "0" for first page)
 * @returns Object with jobs array, totalCount, hasNextPage, and endCursor
 */
export async function searchUpworkJobs(
  accessToken: string,
  searchTerms: string,
  limit: number = 50,
  after?: string | null,
  options?: UpworkGraphqlRequestOptions,
): Promise<UpworkJobsPageResult> {
  const variables = {
    marketPlaceJobFilter: {
      titleExpression_eq: searchTerms,
      pagination_eq: { first: Math.min(limit, 100), after: after ?? "0" },
    },
    searchType: "USER_JOBS_SEARCH" as const,
    sortAttributes: [{ field: "RECENCY" }],
  };

  const result = await upworkGraphQL<MarketplaceJobPostingsResponse>(
    accessToken,
    SEARCH_JOBS_QUERY,
    variables,
    options,
  );

  const postings = result.data.marketplaceJobPostingsSearch;
  const edges: UpworkJobEdge[] = postings.edges ?? [];
  const jobs = edges
    .reduce<UpworkJob[]>((acc, edge) => {
      try {
        if (edge?.node != null) acc.push(edge.node);
      } catch {
        // skip malformed edge
      }
      return acc;
    }, [])
    .slice(0, limit);
  const { hasNextPage, endCursor } = postings.pageInfo;

  return {
    jobs,
    totalCount: postings.totalCount,
    hasNextPage,
    endCursor,
  };
}

/**
 * Fetch Upwork jobs using mapped FilterCriteria.
 *
 * @param accessToken - Valid Upwork OAuth2 access token
 * @param filterCriteria - Object conforming to MarketplaceJobPostingsSearchFilter
 * @param limit - Max number of results (default 50)
 * @param after - Cursor for pagination (omit or pass "0" for first page)
 * @returns Object with jobs array, totalCount, hasNextPage, and endCursor
 */
export async function fetchUpworkJobsWithFilter(
  accessToken: string,
  filterCriteria: Record<string, unknown>,
  limit: number = 50,
  after?: string | null,
  options?: UpworkGraphqlRequestOptions,
): Promise<UpworkJobsPageResult> {
  const marketPlaceJobFilter: Record<string, unknown> = {
    ...filterCriteria,
    pagination_eq: { first: Math.min(limit, 100), after: after ?? "0" },
  };

  const variables = {
    marketPlaceJobFilter,
    searchType: "USER_JOBS_SEARCH" as const,
    sortAttributes: [{ field: "RECENCY" }],
  };

  const result = await upworkGraphQL<MarketplaceJobPostingsResponse>(
    accessToken,
    SEARCH_JOBS_QUERY,
    variables,
    options,
  );

  const postings = result.data.marketplaceJobPostingsSearch;
  const edges: UpworkJobEdge[] = postings.edges ?? [];
  const jobs = edges
    .reduce<UpworkJob[]>((acc, edge) => {
      try {
        if (edge?.node != null) acc.push(edge.node);
      } catch {
        // skip malformed edge
      }
      return acc;
    }, [])
    .slice(0, limit);
  const { hasNextPage, endCursor } = postings.pageInfo;

  return {
    jobs,
    totalCount: postings.totalCount,
    hasNextPage,
    endCursor,
  };
}

// ---------- Current user identity ----------

const CURRENT_USER_IDENTITY_QUERY = `
query CurrentUpworkUserIdentity {
  user {
    ciphertext
    name
  }
}
`;

interface CurrentUserIdentityResponse {
  data: {
    user: {
      ciphertext: string | null;
      name: string | null;
    } | null;
  };
  errors?: { message: string }[];
}

export interface UpworkUserIdentity {
  ciphertext: string;
  /** `https://www.upwork.com/freelancers/~<ciphertext>` */
  profileUrl: string;
  name: string | null;
}

/**
 * Fetch the connected Upwork account's public freelancer profile identity
 * (ciphertext) so we can link to `https://www.upwork.com/freelancers/~<ciphertext>`.
 * Returns null on any error or when the account has no ciphertext (e.g. client-only
 * accounts) — callers should treat this as best-effort.
 */
export async function fetchUpworkUserIdentity(
  accessToken: string,
  options?: UpworkGraphqlRequestOptions,
): Promise<UpworkUserIdentity | null> {
  try {
    const result = await upworkGraphQL<CurrentUserIdentityResponse>(
      accessToken,
      CURRENT_USER_IDENTITY_QUERY,
      {},
      options,
    );
    // Upwork's `ciphertext` field is sometimes returned with a leading `~`
    // already included — strip it so we don't double it up when building the URL.
    const ciphertext = result.data.user?.ciphertext?.trim().replace(/^~+/, "");
    if (!ciphertext) return null;

    return {
      ciphertext,
      profileUrl: `https://www.upwork.com/freelancers/~${ciphertext}`,
      name: result.data.user?.name ?? null,
    };
  } catch (err) {
    console.warn("[upwork] fetchUpworkUserIdentity failed:", err);
    return null;
  }
}

// ---------- Upwork tenant (company selector) ----------

/**
 * Do NOT add `typeTitle`. It is scope-blocked on real tokens, and Upwork aborts
 * the ENTIRE query when a requested field is denied, which would break every
 * caller of this query including the job feed's tenant resolution.
 * `organizationType` and `organizationLegacyType` were both verified allowed.
 */
const COMPANY_SELECTOR_QUERY = `
query CompanySelectorForTenant {
  companySelector {
    items {
      title
      organizationId
      organizationType
      organizationLegacyType
    }
  }
}
`;

interface CompanySelectorResponse {
  data: {
    companySelector: {
      items: Array<{
        title: string;
        organizationId: string | number;
        organizationType?: string | null;
        organizationLegacyType?: string | null;
      }>;
    };
  };
  errors?: { message: string }[];
}

/**
 * Lists Upwork organizations the authenticated user can act as (no tenant header).
 *
 * Prefer `resolveVendorOrganizations` over calling this directly: it serves the
 * same list from the 7h cache and only reaches Upwork on a miss.
 */
export async function fetchUpworkCompanySelector(
  accessToken: string,
  options?: UpworkGraphqlRequestOptions,
): Promise<
  Array<{
    title: string;
    organizationId: string;
    organizationType: string | null;
    organizationLegacyType: string | null;
  }>
> {
  const result = await upworkGraphQL<CompanySelectorResponse>(
    accessToken,
    COMPANY_SELECTOR_QUERY,
    {},
    options,
  );

  return (result.data.companySelector.items ?? []).map((row) => ({
    title: row.title ?? "",
    organizationId: String(row.organizationId),
    organizationType: row.organizationType ?? null,
    organizationLegacyType: row.organizationLegacyType ?? null,
  }));
}

// ---------- Vendor proposals (freelancer / agency) ----------

const VENDOR_PROPOSALS_QUERY = `
query VendorProposalsForActivity(
  $filter: VendorProposalFilter!
  $sortAttribute: VendorProposalSortAttribute!
  $pagination: Pagination!
) {
  vendorProposals(
    filter: $filter
    sortAttribute: $sortAttribute
    pagination: $pagination
  ) {
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
}
`;

const VENDOR_PROPOSAL_BY_ID_QUERY = `
query VendorProposalById($id: ID!) {
  vendorProposal(id: $id) {
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
    proposalCoverLetter
    marketplaceJobPosting {
      id
      content {
        title
        description
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
`;

interface VendorProposalByIdResponse {
  data: {
    vendorProposal: {
      id: string | number;
      status: { status: string } | null;
      proposalCoverLetter: string | null;
      auditDetails: {
        createdDateTime: UpworkDateTimeObject;
        modifiedDateTime: UpworkDateTimeObject | null;
      };
      marketplaceJobPosting: {
        id: string | number;
        content: { title: string; description: string } | null;
        clientCompanyPublic: {
          city: string | null;
          country: { name: string | null } | null;
        } | null;
      } | null;
    } | null;
  };
  errors?: { message: string }[];
}

export interface UpworkVendorProposalDetail extends UpworkVendorProposalActivityItem {
  coverLetter: string | null;
  description: string | null;
}

/** Enable with `DEBUG_UPWORK_VENDOR_PROPOSALS=1` in production; on by default in development. */
const DEBUG_UPWORK_VENDOR_PROPOSALS =
  process.env.DEBUG_UPWORK_VENDOR_PROPOSALS === "1" ||
  process.env.NODE_ENV === "development";

async function fetchVendorProposalsEdgesForStatus(
  accessToken: string,
  filter: Record<string, unknown>,
  first: number,
  tenantId?: string,
  options?: UpworkGraphqlRequestOptions,
): Promise<VendorProposalEdge[]> {
  const variables = {
    filter,
    sortAttribute: {
      field: "MODIFIEDDATETIME",
      sortOrder: "DESC",
    },
    pagination: { first },
  };

  const mergedOptions: UpworkGraphqlRequestOptions = {
    ...(tenantId ? { tenantId } : {}),
    ...(options?.quotaContext ? { quotaContext: options.quotaContext } : {}),
  };

  const result = await upworkGraphQL<VendorProposalsGraphqlResponse>(
    accessToken,
    VENDOR_PROPOSALS_QUERY,
    variables,
    Object.keys(mergedOptions).length > 0 ? mergedOptions : undefined,
  );

  if (DEBUG_UPWORK_VENDOR_PROPOSALS) {
    const conn = result.data.vendorProposals;
    console.log("[upwork vendorProposals] response", {
      filter: variables.filter,
      sortAttribute: variables.sortAttribute,
      pagination: variables.pagination,
      totalCount: conn.totalCount,
      edgeCount: conn.edges.length,
      pageInfo: conn.pageInfo,
      edgesSample: conn.edges.slice(0, 3).map((e) => ({
        id: e.node.id,
        status: e.node.status?.status,
        jobTitle: e.node.marketplaceJobPosting?.content?.title ?? null,
        audit: {
          created: e.node.auditDetails?.createdDateTime,
          modified: e.node.auditDetails?.modifiedDateTime ?? null,
        },
      })),
    });
  }

  return result.data.vendorProposals.edges;
}

function mergeSettledVendorProposalEdges(
  settled: PromiseSettledResult<VendorProposalEdge[]>[],
): Map<string, UpworkVendorProposalActivityItem> {
  const edgeGroups: VendorProposalEdge[][] = [];

  for (let si = 0; si < settled.length; si++) {
    const result = settled[si];
    if (result.status === "rejected") {
      console.warn(
        `vendorProposals(${VENDOR_PROPOSAL_STATUS_FILTER_INPUTS[si]}):`,
        result.reason,
      );
      continue;
    }
    edgeGroups.push(result.value);
  }

  return mergeVendorProposalEdgeGroups(edgeGroups);
}

const VENDOR_PROPOSALS_LOG_PREFIX = "[upwork vendorProposals]";

/**
 * Always logged, not gated behind DEBUG_UPWORK_VENDOR_PROPOSALS, so which path
 * ran is verifiable in any environment. One line per fetch pass. Note that a
 * single dashboard load can produce two passes: the scoped one, then the
 * unscoped retry when the scoped query comes back empty.
 */
function logVendorProposalsPath(
  path: "BATCHED" | "PER_STATUS_FALLBACK",
  detail: Record<string, unknown>,
) {
  console.log(`${VENDOR_PROPOSALS_LOG_PREFIX} path=${path}`, detail);
}

/**
 * One aliased request covering every status — 1 quota unit instead of 8.
 * Throws `VendorProposalsBatchUnavailableError` when the response has no usable
 * data, which is the expected shape when any single alias errors.
 */
async function fetchVendorProposalsBatched(
  accessToken: string,
  pageFirst: number,
  organizationIdEq: string | undefined,
  tenantId: string | undefined,
  options?: UpworkGraphqlRequestOptions,
): Promise<Map<string, UpworkVendorProposalActivityItem>> {
  const scoped = Boolean(organizationIdEq);
  const variables: Record<string, unknown> = { first: pageFirst };
  if (organizationIdEq) {
    variables.org = organizationIdEq;
  }

  const mergedOptions: UpworkGraphqlRequestOptions = {
    ...(tenantId ? { tenantId } : {}),
    ...(options?.quotaContext ? { quotaContext: options.quotaContext } : {}),
  };

  const result = await upworkGraphQL<VendorProposalsBatchGraphqlResponse>(
    accessToken,
    buildVendorProposalsBatchQuery(scoped),
    variables,
    Object.keys(mergedOptions).length > 0 ? mergedOptions : undefined,
  );

  const { edgeGroups, failedStatuses } = parseVendorProposalsBatch(result);

  if (failedStatuses.length > 0) {
    // Partial data is possible but not expected — never drop statuses silently.
    console.warn(
      `${VENDOR_PROPOSALS_LOG_PREFIX} batch missing statuses (results are incomplete):`,
      failedStatuses.join(", "),
    );
  }

  const merged = mergeVendorProposalEdgeGroups(edgeGroups);

  logVendorProposalsPath("BATCHED", {
    upworkApiCalls: 1,
    statusesInOneCall: edgeGroups.length,
    perStatusRequestsSent: 0,
    note: "aliased query worked, the 8 separate per-status requests were NOT sent",
    scoped,
    uniqueProposals: merged.size,
    ...(failedStatuses.length > 0 ? { failedStatuses } : {}),
  });

  if (DEBUG_UPWORK_VENDOR_PROPOSALS) {
    console.log(`${VENDOR_PROPOSALS_LOG_PREFIX} batched response`, {
      scoped,
      pageFirst,
      groupCount: edgeGroups.length,
      edgeCounts: edgeGroups.map((g) => g.length),
      failedStatuses,
    });
  }

  return merged;
}

/** Per-status fallback: 8 calls, tolerant of any single status failing. */
async function fetchVendorProposalsPerStatus(
  accessToken: string,
  pageFirst: number,
  organizationIdEq: string | undefined,
  tenantId: string | undefined,
  options?: UpworkGraphqlRequestOptions,
): Promise<Map<string, UpworkVendorProposalActivityItem>> {
  const baseFilter: Record<string, unknown> = {};
  if (organizationIdEq) {
    baseFilter.organizationId_eq = organizationIdEq;
  }

  const settled = await Promise.allSettled(
    VENDOR_PROPOSAL_STATUS_FILTER_INPUTS.map((status_eq) =>
      fetchVendorProposalsEdgesForStatus(
        accessToken,
        { ...baseFilter, status_eq },
        pageFirst,
        tenantId,
        options,
      ),
    ),
  );

  const merged = mergeSettledVendorProposalEdges(settled);

  logVendorProposalsPath("PER_STATUS_FALLBACK", {
    upworkApiCalls: VENDOR_PROPOSAL_STATUS_FILTER_INPUTS.length,
    perStatusRequestsSent: VENDOR_PROPOSAL_STATUS_FILTER_INPUTS.length,
    succeeded: settled.filter((r) => r.status === "fulfilled").length,
    rejected: settled.filter((r) => r.status === "rejected").length,
    note: "aliased batch was unusable, one separate request per status was sent",
    scoped: Boolean(organizationIdEq),
    uniqueProposals: merged.size,
  });

  return merged;
}

/**
 * Batched first, per-status as a safety net.
 *
 * Quota errors are rethrown rather than retried: the fallback would fire 8 more
 * calls that are guaranteed to fail the same way.
 */
async function fetchVendorProposalsMergedForScope(
  accessToken: string,
  pageFirst: number,
  organizationIdEq: string | undefined,
  tenantId: string | undefined,
  options?: UpworkGraphqlRequestOptions,
): Promise<Map<string, UpworkVendorProposalActivityItem>> {
  try {
    return await fetchVendorProposalsBatched(
      accessToken,
      pageFirst,
      organizationIdEq,
      tenantId,
      options,
    );
  } catch (e) {
    // A quota failure is not a "batch query is unavailable" signal, so it must
    // propagate rather than trigger the per-status fallback — which would spend
    // several more calls against a quota that is already exhausted.
    if (e instanceof UpworkQuotaExceededError) {
      throw e;
    }

    const detail =
      e instanceof VendorProposalsBatchUnavailableError
        ? e.detail
        : e instanceof Error
          ? e.message
          : String(e);
    console.warn(
      `${VENDOR_PROPOSALS_LOG_PREFIX} batch FAILED, falling back to per-status queries. Reason:`,
      detail,
    );

    return fetchVendorProposalsPerStatus(
      accessToken,
      pageFirst,
      organizationIdEq,
      tenantId,
      options,
    );
  }
}

/**
 * Recent vendor (freelancer) proposals from Upwork for dashboard activity.
 * Requires "Client Proposals - Read And Write Access" on the API key.
 *
 * `organizationIdEq` / `tenantId` must be Upwork `organizationId` values from
 * `companySelector`, not application database IDs.
 *
 * Upwork's filter requires `status_eq`, so every filterable status is aliased
 * into one request and the results merged. If that request fails, falls back to
 * one call per status (see `fetchVendorProposalsMergedForScope`).
 *
 * If scoped queries (org + header) return no rows, retries **without**
 * `organizationId_eq` and without `X-Upwork-API-TenantId` so the API uses the
 * account default context (common when apps belong to personal FL vs agency org).
 */
export async function fetchVendorProposalsForActivity(
  accessToken: string,
  options: {
    organizationIdEq?: string;
    tenantId?: string;
    limit?: number;
    quotaContext?: UpworkGraphqlRequestOptions["quotaContext"];
  } = {},
): Promise<UpworkVendorProposalActivityItem[]> {
  const limit = Math.min(Math.max(options.limit ?? 8, 1), 40);
  const pageFirst = Math.min(40, Math.max(limit, 5));
  const gqlOptions: UpworkGraphqlRequestOptions | undefined =
    options.quotaContext ? { quotaContext: options.quotaContext } : undefined;

  let bestById = await fetchVendorProposalsMergedForScope(
    accessToken,
    pageFirst,
    options.organizationIdEq,
    options.tenantId,
    gqlOptions,
  );

  const usedScope =
    Boolean(options.organizationIdEq) || Boolean(options.tenantId);

  if (bestById.size === 0 && usedScope) {
    if (DEBUG_UPWORK_VENDOR_PROPOSALS) {
      console.log(
        "[upwork vendorProposals] scoped query empty — retrying without organizationId_eq / tenant header",
      );
    }
    bestById = await fetchVendorProposalsMergedForScope(
      accessToken,
      pageFirst,
      undefined,
      undefined,
      gqlOptions,
    );
  }

  if (DEBUG_UPWORK_VENDOR_PROPOSALS) {
    console.log("[upwork vendorProposals] merged", {
      uniqueCount: bestById.size,
      requestedLimit: limit,
      returning: Math.min(bestById.size, limit),
    });
  }

  return Array.from(bestById.values())
    .sort(
      (a, b) =>
        new Date(b.activityAt).getTime() - new Date(a.activityAt).getTime(),
    )
    .slice(0, limit);
}

/**
 * Single vendor proposal by Upwork id (detail view / refresh one row).
 *
 * Takes the full `UpworkGraphqlRequestOptions` rather than just `tenantId` so
 * callers can pass a `quotaContext`. Without one the call reaches Upwork even
 * when the caller's daily budget is already spent, and never lands in the
 * usage counter.
 */
export async function fetchVendorProposalById(
  accessToken: string,
  vendorProposalId: string,
  options: UpworkGraphqlRequestOptions = {},
): Promise<UpworkVendorProposalDetail | null> {
  const result = await upworkGraphQL<VendorProposalByIdResponse>(
    accessToken,
    VENDOR_PROPOSAL_BY_ID_QUERY,
    { id: vendorProposalId },
    options,
  );

  const vp = result.data.vendorProposal;
  if (!vp) return null;

  const posting = vp.marketplaceJobPosting;
  const base = mapVendorProposalNode(
    {
      id: vp.id,
      status: vp.status,
      auditDetails: vp.auditDetails,
      marketplaceJobPosting: posting,
    },
    0,
  );

  return {
    ...base,
    coverLetter: vp.proposalCoverLetter ?? null,
    description: posting?.content?.description ?? null,
  };
}

// ---------- Portfolio items ----------

export interface UpworkPortfolioItem {
  id: string;
  title: string;
  description: string | null;
  skills: string[];
}

const PORTFOLIO_ITEMS_QUERY = `
query GetMyPortfolio {
  user {
    talentProfile {
      projectList {
        totalProjects
        projects {
          id
          title
          description
          tags {
            skill {
              preferredLabel
            }
          }
        }
      }
    }
  }
}
`;

/**
 * Fetch the authenticated freelancer's Upwork portfolio projects.
 * Uses the no-arg `user` query → talentProfile → projectList.
 * Returns [] on any GraphQL error (graceful degradation).
 */
export async function fetchUpworkPortfolioItems(
  accessToken: string,
  options?: UpworkGraphqlRequestOptions,
): Promise<UpworkPortfolioItem[]> {
  interface PortfolioResponse {
    data: {
      user?: {
        talentProfile?: {
          projectList?: {
            totalProjects?: number;
            projects?: Array<{
              id?: string;
              title?: string;
              description?: string | null;
              tags?: Array<{
                skill?: { preferredLabel?: string | null } | null;
              } | null>;
            }>;
          };
        };
      };
    };
    errors?: { message: string }[];
  }

  let result: PortfolioResponse;
  try {
    result = await upworkGraphQL<PortfolioResponse>(
      accessToken,
      PORTFOLIO_ITEMS_QUERY,
      {},
      options,
    );
    console.log(
      "[upwork] fetchUpworkPortfolioItems",
      result.data?.user?.talentProfile?.projectList?.projects,
    );
  } catch (err) {
    console.warn("[upwork] fetchUpworkPortfolioItems failed:", err);
    return [];
  }

  const rawItems =
    result.data?.user?.talentProfile?.projectList?.projects ?? [];

  return rawItems
    .map((item) => ({
      id: String(item.id ?? ""),
      title: String(item.title ?? "").trim(),
      description: item.description?.trim() || null,
      skills: (item.tags ?? [])
        .map((t) => t?.skill?.preferredLabel)
        .filter((s): s is string => Boolean(s))
        .filter((s, i, arr) => arr.indexOf(s) === i),
    }))
    .filter((item) => item.title.length > 0)
    .slice(0, 50);
}

// ---------- Agency members ----------

/**
 * Requests ONLY fields verified allowed on a real token. `StaffUser.firstName`,
 * `.lastName`, and `.email` are scope-blocked, and one denied field aborts the
 * whole query with a null `data`, so they must never be added here.
 */
const AGENCY_STAFF_QUERY = `
query AgencyStaffRoster {
  organization {
    id
    name
    flag {
      agency
      individual
    }
    staffs {
      totalCount
      edges {
        node {
          id
          activationStatus
          user {
            id
            name
            photoUrl
            publicUrl
          }
        }
      }
    }
  }
}
`;

interface AgencyStaffResponse {
  data?: {
    organization?: {
      id?: string | number | null;
      name?: string | null;
      flag?: { agency?: boolean | null; individual?: boolean | null } | null;
      staffs?: {
        totalCount?: number | null;
        edges?: Array<{
          node?: {
            id?: string | number | null;
            activationStatus?: number | null;
            user?: {
              id?: string | number | null;
              name?: string | null;
              photoUrl?: string | null;
              publicUrl?: string | null;
            } | null;
          } | null;
        } | null> | null;
      } | null;
    } | null;
  };
  errors?: { message: string }[];
}

export type UpworkAgencyRoster = {
  organizationId: string | null;
  organizationName: string | null;
  /** Upwork's own `organization.flag.agency`. Authoritative when present. */
  isAgency: boolean;
  /** Upwork's `staffs.totalCount`, which counts staff ROWS across all pages. */
  totalCount: number;
  /**
   * Raw staff rows returned on this page, BEFORE deduping by person. Compare
   * against `totalCount` to detect real pagination truncation: comparing
   * against `members.length` would report truncation whenever one person holds
   * two staff rows, which is normal.
   */
  rowCount: number;
  /**
   * Upwork refused the roster with `Access to actions:[view_staff] is denied`.
   *
   * This is an Upwork ACCOUNT permission, not an OAuth scope, and regular
   * agency members do not have it: only owners and admins can read the roster.
   * Measured on a real agency where the owner got all 7 members and a member
   * got a 403 on the same org.
   *
   * Callers must treat this as "cannot list the roster", NOT as "the agency is
   * empty", and fall back to importing just the connected user.
   */
  permissionDenied: boolean;
  members: UpworkAgencyStaffMember[];
};

/**
 * Fetch an Upwork organization's staff roster.
 *
 * `organizationId` is an Upwork `companySelector` organizationId, never a
 * Supabase UUID. It is sent as `X-Upwork-API-TenantId`, which is what makes
 * `organization` resolve to the agency instead of the user's default org.
 *
 * Upwork caps `staffs` at 100 entries per page and this function does not
 * paginate, so an agency with more than 100 members is truncated. `totalCount`
 * is returned unmodified so callers can tell the user when that happened.
 *
 * Members are DEDUPED by `personId`. One person legitimately holds several staff
 * rows: on the tested agency the owner appeared twice, once with `staffType: 3`
 * (Ownership) and once with `staffType: 2` (Invitation), both carrying the same
 * `user.id`. Without deduping, the picker lists them twice and the second
 * import violates the `upwork_person_id` unique index.
 */
export async function fetchUpworkAgencyStaff(
  accessToken: string,
  organizationId: string,
  options?: UpworkGraphqlRequestOptions,
): Promise<UpworkAgencyRoster> {
  const result = await upworkGraphQL<AgencyStaffResponse>(
    accessToken,
    AGENCY_STAFF_QUERY,
    {},
    { ...options, tenantId: organizationId },
  );

  const org = result.data?.organization ?? null;
  const edges = org?.staffs?.edges ?? [];

  const byPersonId = new Map<string, UpworkAgencyStaffMember>();
  for (const edge of edges) {
    const user = edge?.node?.user;
    const personId = user?.id != null ? String(user.id) : "";
    if (!personId || byPersonId.has(personId)) continue;

    byPersonId.set(personId, {
      personId,
      // firstName / lastName / email are scope-blocked on StaffUser and are
      // deliberately NOT requested. They stay null and the talent profile
      // supplies the name instead.
      firstName: null,
      lastName: null,
      name: user?.name ?? null,
      photoUrl: user?.photoUrl ?? null,
      publicUrl: user?.publicUrl ?? null,
      email: null,
      activationStatus: edge?.node?.activationStatus ?? null,
    });
  }

  const members = Array.from(byPersonId.values());
  const rowCount = edges.length;

  // A view_staff denial arrives as a GraphQL error alongside a NON-null `data`
  // ({ organization: null }), so upworkGraphQL treats it as partial success and
  // returns normally. Without this check the caller cannot tell "you may not
  // list this roster" from "this agency has no members".
  const permissionDenied = (result.errors ?? []).some((e) =>
    /view_staff|is denied/i.test(e?.message ?? ""),
  );

  return {
    organizationId: org?.id != null ? String(org.id) : null,
    organizationName: org?.name ?? null,
    isAgency: org?.flag?.agency === true,
    totalCount: org?.staffs?.totalCount ?? rowCount,
    rowCount,
    permissionDenied,
    members,
  };
}

/**
 * Shared selection set for `TalentProfile`, used by BOTH the agency batch
 * lookup and the connected user's own profile. Kept in one place so the two
 * import paths cannot drift and produce differently-populated personas.
 *
 * Every field here was verified allowed on a real token, on both paths.
 */
const TALENT_PROFILE_FIELDS = `
  personId
  personalData {
    firstName
    lastName
    title
    description
    profileUrl
    portrait {
      portrait
      portrait150
      portrait500
    }
    location {
      country
      city
      timezone
    }
  }
  skills {
    prettyName
    skill
  }
  specializedProfiles {
    title
  }
  employmentRecords {
    startDateTime
  }
`;

/** Raw `TalentProfile` node matching TALENT_PROFILE_FIELDS. */
interface TalentProfileNode {
  personId?: string | number | null;
  personalData?: {
    firstName?: string | null;
    lastName?: string | null;
    title?: string | null;
    description?: string | null;
    profileUrl?: string | null;
    portrait?: {
      portrait?: string | null;
      portrait150?: string | null;
      portrait500?: string | null;
    } | null;
    location?: {
      country?: string | null;
      city?: string | null;
      timezone?: string | null;
    } | null;
  } | null;
  skills?: Array<{
    prettyName?: string | null;
    skill?: string | null;
  } | null> | null;
  specializedProfiles?: Array<{ title?: string | null } | null> | null;
  employmentRecords?: Array<{ startDateTime?: string | null } | null> | null;
}

/** Normalizes one raw TalentProfile node. Returns null when it has no personId. */
function mapTalentProfileNode(
  node: TalentProfileNode | null | undefined,
): UpworkTalentProfile | null {
  const personId = node?.personId != null ? String(node.personId) : "";
  if (!personId) return null;

  const personal = node?.personalData ?? null;

  return {
    personId,
    firstName: personal?.firstName ?? null,
    lastName: personal?.lastName ?? null,
    title: personal?.title ?? null,
    description: personal?.description ?? null,
    portraitUrl:
      personal?.portrait?.portrait500 ??
      personal?.portrait?.portrait150 ??
      personal?.portrait?.portrait ??
      null,
    profileUrl: personal?.profileUrl ?? null,
    country: personal?.location?.country ?? null,
    city: personal?.location?.city ?? null,
    timezone: personal?.location?.timezone ?? null,
    skills: (node?.skills ?? [])
      .map((s) => s?.prettyName ?? s?.skill ?? null)
      .filter((s): s is string => Boolean(s)),
    // `specializedProfiles` comes back as null, not [], for members with none.
    specializations: (node?.specializedProfiles ?? [])
      .map((p) => p?.title ?? null)
      .filter((t): t is string => Boolean(t)),
    employmentStartDates: (node?.employmentRecords ?? [])
      .map((r) => r?.startDateTime ?? null)
      .filter((d): d is string => Boolean(d)),
  };
}

const TALENT_PROFILES_QUERY = `
query AgencyMemberTalentProfiles($personIds: [ID!]!) {
  talentProfiles(personIds: $personIds) {
    profiles {
${TALENT_PROFILE_FIELDS}
    }
  }
}
`;

interface TalentProfilesResponse {
  data?: {
    talentProfiles?: {
      profiles?: Array<TalentProfileNode | null> | null;
    } | null;
  };
  errors?: { message: string }[];
}

/**
 * Batch-fetch talent profiles for a list of Upwork personIds, keyed by personId.
 *
 * Returns an EMPTY map on any failure instead of throwing. Enrichment is
 * best-effort by design: reading other agency members' talent profiles works on
 * a real token but is undocumented by Upwork, so callers must stay useful when
 * a member has no entry in the map.
 */
export async function fetchUpworkTalentProfilesByPersonIds(
  accessToken: string,
  personIds: string[],
  options?: UpworkGraphqlRequestOptions,
): Promise<Map<string, UpworkTalentProfile>> {
  const unique = Array.from(new Set(personIds.filter(Boolean)));
  const byPersonId = new Map<string, UpworkTalentProfile>();
  if (unique.length === 0) return byPersonId;

  let result: TalentProfilesResponse;
  try {
    result = await upworkGraphQL<TalentProfilesResponse>(
      accessToken,
      TALENT_PROFILES_QUERY,
      { personIds: unique },
      options,
    );
  } catch (err) {
    console.warn(
      "[upwork] fetchUpworkTalentProfilesByPersonIds failed:",
      err instanceof Error ? err.message : String(err),
    );
    return byPersonId;
  }

  for (const node of result.data?.talentProfiles?.profiles ?? []) {
    const profile = mapTalentProfileNode(node);
    if (profile) byPersonId.set(profile.personId, profile);
  }

  return byPersonId;
}

const SELF_TALENT_PROFILE_QUERY = `
query SelfTalentProfile {
  user {
    id
    name
    photoUrl
    talentProfile {
${TALENT_PROFILE_FIELDS}
    }
  }
}
`;

interface SelfTalentProfileResponse {
  data?: {
    user?: {
      id?: string | number | null;
      name?: string | null;
      photoUrl?: string | null;
      talentProfile?: TalentProfileNode | null;
    } | null;
  };
  errors?: { message: string }[];
}

/**
 * The connected user's own freelancer profile, shaped for the persona mapper.
 *
 * Uses the no-arg `user` query, the same root `fetchUpworkPortfolioItems` uses,
 * and needs NO tenant header: `user` is the current user regardless of the
 * selected organization.
 *
 * Returns null when the account has no freelancer profile at all, e.g. a
 * client-only Upwork account. That is a real dead end for the import, not an
 * error, so it does not throw.
 *
 * `talentProfile.personId` is the SAME identifier as `Staff.user.id` from the
 * agency roster (verified on a real account), so a persona imported here and
 * one imported from an agency roster collide on `upwork_person_id` exactly as
 * intended, and one person can never end up with two personas.
 */
export async function fetchUpworkSelfTalentProfile(
  accessToken: string,
  options?: UpworkGraphqlRequestOptions,
): Promise<{
  member: UpworkAgencyStaffMember;
  profile: UpworkTalentProfile;
} | null> {
  let result: SelfTalentProfileResponse;
  try {
    result = await upworkGraphQL<SelfTalentProfileResponse>(
      accessToken,
      SELF_TALENT_PROFILE_QUERY,
      {},
      options,
    );
  } catch (err) {
    console.warn(
      "[upwork] fetchUpworkSelfTalentProfile failed:",
      err instanceof Error ? err.message : String(err),
    );
    return null;
  }

  const user = result.data?.user ?? null;
  const profile = mapTalentProfileNode(user?.talentProfile);
  if (!profile) return null;

  return {
    member: {
      personId: profile.personId,
      // Unlike StaffUser, personalData.firstName / lastName ARE readable here,
      // so the mapper takes them from the profile. These stay null to keep the
      // member shape identical across both import paths.
      firstName: null,
      lastName: null,
      name: user?.name ?? null,
      photoUrl: user?.photoUrl ?? null,
      publicUrl: null,
      email: null,
      activationStatus: 1,
    },
    profile,
  };
}
