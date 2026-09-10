import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const apiFetch = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api-fetch", () => ({ apiFetch }));

import { embedProjectAfterSave } from "./embed-after-save";

const json = (status: number, body: unknown) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;

beforeEach(() => {
  apiFetch.mockReset();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("embedProjectAfterSave", () => {
  it("reports success so the list can be trusted to render the embedded state", async () => {
    apiFetch.mockResolvedValue(json(200, { success: true }));
    await expect(embedProjectAfterSave("p1")).resolves.toBe("embedded");
  });

  it("posts the project id to the embed route", async () => {
    apiFetch.mockResolvedValue(json(200, { success: true }));
    await embedProjectAfterSave("p1");

    expect(apiFetch).toHaveBeenCalledWith(
      "/api/projects/embed",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ projectId: "p1" }),
      }),
    );
  });

  it("singles out a missing key, which the user has to act on", async () => {
    // 409 + missing_key is the one outcome the backfill cannot fix on its own.
    apiFetch.mockResolvedValue(json(409, { code: "missing_key" }));
    await expect(embedProjectAfterSave("p1")).resolves.toBe("missing_key");
  });

  it("treats any other error status as transient", async () => {
    apiFetch.mockResolvedValue(json(500, { error: "boom" }));
    await expect(embedProjectAfterSave("p1")).resolves.toBe("failed");
  });

  it("survives a body that is not JSON", async () => {
    apiFetch.mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => {
        throw new Error("not json");
      },
    } as unknown as Response);

    await expect(embedProjectAfterSave("p1")).resolves.toBe("failed");
  });

  it("does not throw when the network drops", async () => {
    // The project row is already saved; a dead network must not surface as an
    // unhandled rejection on top of a successful save.
    apiFetch.mockRejectedValue(new Error("offline"));
    await expect(embedProjectAfterSave("p1")).resolves.toBe("failed");
  });

  it("stops waiting once the timeout passes", async () => {
    vi.useFakeTimers();
    try {
      apiFetch.mockReturnValue(new Promise(() => {}));

      const pending = embedProjectAfterSave("p1", { timeoutMs: 8000 });
      await vi.advanceTimersByTimeAsync(8000);

      await expect(pending).resolves.toBe("timeout");
    } finally {
      vi.useRealTimers();
    }
  });

  it("never aborts the request it gave up waiting on", async () => {
    // Giving up on the wait must not give up on the write, so no signal is
    // passed — the embedding still lands after we navigate away.
    apiFetch.mockResolvedValue(json(200, { success: true }));
    await embedProjectAfterSave("p1");

    const init = apiFetch.mock.calls[0]?.[1] as RequestInit | undefined;
    expect(init?.signal).toBeUndefined();
  });
});
