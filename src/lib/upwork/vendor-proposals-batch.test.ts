import { describe, expect, it } from "vitest";
import {
  aliasForStatus,
  buildVendorProposalsBatchQuery,
  mapVendorProposalNode,
  mergeVendorProposalEdgeGroups,
  parseVendorProposalsBatch,
  upworkDateTimeToIso,
  VENDOR_PROPOSAL_STATUS_FILTER_INPUTS,
  VendorProposalsBatchUnavailableError,
  type VendorProposalEdge,
  type VendorProposalGraphqlNode,
  type VendorProposalsBatchGraphqlResponse,
  type VendorProposalsConnection,
} from "./vendor-proposals-batch";

// ---------- Fixtures ----------

function isoDateTime(iso: string) {
  return { rawValue: iso, displayValue: iso };
}

function node(
  overrides: Partial<VendorProposalGraphqlNode> & { id: string | number },
): VendorProposalGraphqlNode {
  return {
    status: { status: "Accepted" },
    auditDetails: {
      createdDateTime: isoDateTime("2026-07-01T10:00:00.000Z"),
      modifiedDateTime: isoDateTime("2026-07-01T10:00:00.000Z"),
    },
    marketplaceJobPosting: {
      id: "job-1",
      content: { title: "Senior React Developer" },
      clientCompanyPublic: {
        city: "Austin",
        country: { name: "United States" },
      },
    },
    ...overrides,
  };
}

function edge(n: VendorProposalGraphqlNode): VendorProposalEdge {
  return { cursor: `cursor-${n.id}`, node: n };
}

function connection(edges: VendorProposalEdge[]): VendorProposalsConnection {
  return {
    totalCount: edges.length,
    edges,
    pageInfo: { hasNextPage: false, endCursor: null },
  };
}

/** A full batch response with every alias present, each holding the given edges. */
function fullBatch(
  perStatus: Partial<Record<string, VendorProposalEdge[]>> = {},
): VendorProposalsBatchGraphqlResponse {
  const data: Record<string, VendorProposalsConnection | null> = {};
  for (const status of VENDOR_PROPOSAL_STATUS_FILTER_INPUTS) {
    const alias = aliasForStatus(status);
    data[alias] = connection(perStatus[alias] ?? []);
  }
  return { data };
}

// ---------- Query builder ----------

describe("buildVendorProposalsBatchQuery", () => {
  it("aliases every status into one document", () => {
    const query = buildVendorProposalsBatchQuery(true);

    for (const status of VENDOR_PROPOSAL_STATUS_FILTER_INPUTS) {
      expect(query).toContain(`${aliasForStatus(status)}: vendorProposals(`);
      expect(query).toContain(`status_eq: ${status}`);
    }
    expect(query.match(/vendorProposals\(/g)).toHaveLength(
      VENDOR_PROPOSAL_STATUS_FILTER_INPUTS.length,
    );
  });

  it("declares the org variable and filter only when scoped", () => {
    const scoped = buildVendorProposalsBatchQuery(true);
    expect(scoped).toContain("$org: ID!");
    expect(scoped.match(/organizationId_eq: \$org/g)).toHaveLength(
      VENDOR_PROPOSAL_STATUS_FILTER_INPUTS.length,
    );

    const unscoped = buildVendorProposalsBatchQuery(false);
    expect(unscoped).not.toContain("$org");
    expect(unscoped).not.toContain("organizationId_eq");
  });

  it("uses a single fragment rather than repeating the selection set", () => {
    const query = buildVendorProposalsBatchQuery(true);
    expect(
      query.match(/fragment VendorProposalsBatchConnection/g),
    ).toHaveLength(1);
    // The blocked-scope fields must never appear — a denial aborts the whole query.
    expect(query).not.toContain("typeTitle");
  });

  it("returns the same cached string per variant", () => {
    expect(buildVendorProposalsBatchQuery(true)).toBe(
      buildVendorProposalsBatchQuery(true),
    );
    expect(buildVendorProposalsBatchQuery(true)).not.toBe(
      buildVendorProposalsBatchQuery(false),
    );
  });
});

// ---------- Response parsing ----------

describe("parseVendorProposalsBatch", () => {
  it("returns one edge group per status when all aliases succeed", () => {
    const result = parseVendorProposalsBatch(
      fullBatch({ accepted: [edge(node({ id: "p1" }))] }),
    );

    expect(result.edgeGroups).toHaveLength(
      VENDOR_PROPOSAL_STATUS_FILTER_INPUTS.length,
    );
    expect(result.failedStatuses).toEqual([]);
    expect(result.edgeGroups.flat()).toHaveLength(1);
  });

  it("throws when data is null, which is what a failed alias produces", () => {
    // vendorProposals is VendorProposalsConnection! — an error in any alias has
    // no nullable parent below data, so the whole batch comes back null.
    const response: VendorProposalsBatchGraphqlResponse = {
      data: null,
      errors: [{ message: "Not authorized", path: ["offered"] }],
    };

    expect(() => parseVendorProposalsBatch(response)).toThrow(
      VendorProposalsBatchUnavailableError,
    );
    try {
      parseVendorProposalsBatch(response);
    } catch (e) {
      expect((e as VendorProposalsBatchUnavailableError).detail).toBe(
        "Not authorized",
      );
    }
  });

  it("reports the status when a single alias is null but the rest survive", () => {
    const batch = fullBatch({ accepted: [edge(node({ id: "p1" }))] });
    batch.data!.offered = null;

    const result = parseVendorProposalsBatch(batch);

    expect(result.failedStatuses).toEqual(["Offered"]);
    expect(result.edgeGroups).toHaveLength(
      VENDOR_PROPOSAL_STATUS_FILTER_INPUTS.length - 1,
    );
    expect(result.edgeGroups.flat()).toHaveLength(1);
  });

  it("reports a status whose alias is missing entirely", () => {
    const batch = fullBatch();
    delete batch.data!.hired;

    expect(parseVendorProposalsBatch(batch).failedStatuses).toEqual(["Hired"]);
  });

  it("throws when every alias is missing", () => {
    expect(() => parseVendorProposalsBatch({ data: {} })).toThrow(
      VendorProposalsBatchUnavailableError,
    );
  });
});

// ---------- Merging ----------

describe("mergeVendorProposalEdgeGroups", () => {
  it("dedupes a proposal appearing under two statuses, newest activity wins", () => {
    const stale = node({
      id: "p1",
      status: { status: "Accepted" },
      auditDetails: {
        createdDateTime: isoDateTime("2026-07-01T10:00:00.000Z"),
        modifiedDateTime: isoDateTime("2026-07-01T10:00:00.000Z"),
      },
    });
    const fresh = node({
      id: "p1",
      status: { status: "Offered" },
      auditDetails: {
        createdDateTime: isoDateTime("2026-07-01T10:00:00.000Z"),
        modifiedDateTime: isoDateTime("2026-07-05T18:30:00.000Z"),
      },
    });

    const merged = mergeVendorProposalEdgeGroups([[edge(stale)], [edge(fresh)]]);

    expect(merged.size).toBe(1);
    expect(merged.get("p1")?.status).toBe("Offered");
    expect(merged.get("p1")?.activityAt).toBe("2026-07-05T18:30:00.000Z");
    // submittedAt tracks creation, not the status change.
    expect(merged.get("p1")?.submittedAt).toBe("2026-07-01T10:00:00.000Z");
  });

  it("keeps the newest copy regardless of group order", () => {
    const older = node({
      id: "p1",
      status: { status: "Accepted" },
      auditDetails: {
        createdDateTime: isoDateTime("2026-07-01T10:00:00.000Z"),
        modifiedDateTime: isoDateTime("2026-07-01T10:00:00.000Z"),
      },
    });
    const newer = node({
      id: "p1",
      status: { status: "Hired" },
      auditDetails: {
        createdDateTime: isoDateTime("2026-07-01T10:00:00.000Z"),
        modifiedDateTime: isoDateTime("2026-07-09T09:00:00.000Z"),
      },
    });

    expect(
      mergeVendorProposalEdgeGroups([[edge(newer)], [edge(older)]]).get("p1")
        ?.status,
    ).toBe("Hired");
  });

  it("keeps distinct proposals and ignores empty groups", () => {
    const merged = mergeVendorProposalEdgeGroups([
      [edge(node({ id: "p1" })), edge(node({ id: "p2" }))],
      [],
      [edge(node({ id: "p3" }))],
    ]);

    expect([...merged.keys()].sort()).toEqual(["p1", "p2", "p3"]);
  });

  it("returns an empty map for no groups", () => {
    expect(mergeVendorProposalEdgeGroups([]).size).toBe(0);
  });
});

// ---------- Node mapping ----------

describe("mapVendorProposalNode", () => {
  it("maps a complete node", () => {
    expect(mapVendorProposalNode(node({ id: 12345 }), 0)).toMatchObject({
      vendorProposalId: "12345",
      jobPostingId: "job-1",
      jobTitle: "Senior React Developer",
      clientLabel: "Austin, United States",
      clientCountry: "United States",
      status: "Accepted",
      submittedAt: "2026-07-01T10:00:00.000Z",
    });
  });

  it("exposes the country separately from the joined label, or null when city-only", () => {
    // The flag lookup needs the country alone; the label stays pre-joined.
    const cityOnly = mapVendorProposalNode(
      node({
        id: "p1",
        marketplaceJobPosting: {
          id: "job-1",
          content: { title: "Job" },
          clientCompanyPublic: { city: "EAST ELMHURST", country: null },
        },
      }),
      0,
    );
    expect(cityOnly.clientLabel).toBe("EAST ELMHURST");
    expect(cityOnly.clientCountry).toBeNull();

    const countryOnly = mapVendorProposalNode(
      node({
        id: "p2",
        marketplaceJobPosting: {
          id: "job-2",
          content: { title: "Job" },
          clientCompanyPublic: { city: null, country: { name: "Kuwait" } },
        },
      }),
      0,
    );
    expect(countryOnly.clientLabel).toBe("Kuwait");
    expect(countryOnly.clientCountry).toBe("Kuwait");

    // A blank country name must not become an empty string the flag would
    // try, and fail, to resolve.
    const blankCountry = mapVendorProposalNode(
      node({
        id: "p3",
        marketplaceJobPosting: {
          id: "job-3",
          content: { title: "Job" },
          clientCompanyPublic: { city: "Bonn", country: { name: "  " } },
        },
      }),
      0,
    );
    expect(blankCountry.clientCountry).toBeNull();

    expect(
      mapVendorProposalNode(node({ id: "p4", marketplaceJobPosting: null }), 0)
        .clientCountry,
    ).toBeNull();
  });

  it("falls back when the job posting or its parts are missing", () => {
    const noPosting = mapVendorProposalNode(
      node({ id: "p1", marketplaceJobPosting: null }),
      0,
    );
    expect(noPosting.jobTitle).toBe("Job posting");
    expect(noPosting.clientLabel).toBe("Client");
    expect(noPosting.jobPostingId).toBeNull();

    const blankTitle = mapVendorProposalNode(
      node({
        id: "p2",
        marketplaceJobPosting: {
          id: "job-2",
          content: { title: "   " },
          clientCompanyPublic: null,
        },
      }),
      0,
    );
    expect(blankTitle.jobTitle).toBe("Job posting");
    expect(blankTitle.clientLabel).toBe("Client");
  });

  it("joins only the client location parts that are present", () => {
    const countryOnly = mapVendorProposalNode(
      node({
        id: "p1",
        marketplaceJobPosting: {
          id: "job-1",
          content: { title: "Job" },
          clientCompanyPublic: { city: null, country: { name: "Germany" } },
        },
      }),
      0,
    );
    expect(countryOnly.clientLabel).toBe("Germany");

    const neither = mapVendorProposalNode(
      node({
        id: "p2",
        marketplaceJobPosting: {
          id: "job-2",
          content: { title: "Job" },
          clientCompanyPublic: { city: null, country: null },
        },
      }),
      0,
    );
    expect(neither.clientLabel).toBe("Client");
  });

  it("defaults a missing status to Unknown", () => {
    expect(mapVendorProposalNode(node({ id: "p1", status: null }), 0).status).toBe(
      "Unknown",
    );
  });

  it("falls back to created, then to a position-derived stamp, for activityAt", () => {
    const noModified = mapVendorProposalNode(
      node({
        id: "p1",
        auditDetails: {
          createdDateTime: isoDateTime("2026-07-02T08:00:00.000Z"),
          modifiedDateTime: null,
        },
      }),
      0,
    );
    expect(noModified.activityAt).toBe("2026-07-02T08:00:00.000Z");

    const unparsable = mapVendorProposalNode(
      node({
        id: "p2",
        auditDetails: {
          createdDateTime: { rawValue: "", displayValue: "" },
          modifiedDateTime: { rawValue: "not-a-date", displayValue: "" },
        },
      }),
      0,
    );
    // Synthetic stamp — only its parseability matters, since it exists purely
    // to keep the API's own newest-first ordering stable.
    expect(Number.isNaN(Date.parse(unparsable.activityAt))).toBe(false);
    expect(unparsable.submittedAt).toBe(unparsable.activityAt);
  });
});

describe("upworkDateTimeToIso", () => {
  it("parses 10-digit seconds and 13-digit milliseconds", () => {
    expect(upworkDateTimeToIso({ rawValue: "1751364000", displayValue: "" })).toBe(
      new Date(1751364000 * 1000).toISOString(),
    );
    expect(
      upworkDateTimeToIso({ rawValue: "1751364000000", displayValue: "" }),
    ).toBe(new Date(1751364000000).toISOString());
  });

  it("parses an ISO string and trims surrounding whitespace", () => {
    expect(
      upworkDateTimeToIso({
        rawValue: "  2026-07-01T10:00:00.000Z  ",
        displayValue: "",
      }),
    ).toBe("2026-07-01T10:00:00.000Z");
  });

  it("returns null for unusable input", () => {
    expect(upworkDateTimeToIso(null)).toBeNull();
    expect(upworkDateTimeToIso(undefined)).toBeNull();
    expect(upworkDateTimeToIso({ rawValue: "", displayValue: "" })).toBeNull();
    expect(
      upworkDateTimeToIso({ rawValue: "not-a-date", displayValue: "" }),
    ).toBeNull();
  });
});
