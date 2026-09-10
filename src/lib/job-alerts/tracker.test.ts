import { describe, expect, it } from "vitest";
import { createJobAlertsTracker } from "./tracker";

const row = (id: string) => ({ id, title: `Job ${id}` });

describe("createJobAlertsTracker", () => {
  it("reports nothing on the first ingest", () => {
    const tracker = createJobAlertsTracker();
    expect(tracker.ingest([row("a"), row("b")]).newJobs).toEqual([]);
  });

  it("reports only ids missing from an earlier ingest", () => {
    const tracker = createJobAlertsTracker();
    tracker.ingest([row("a"), row("b")]);
    const { newJobs } = tracker.ingest([row("c"), row("a"), row("d")]);
    expect(newJobs.map((j) => j.id)).toEqual(["c", "d"]);
  });

  it("reports an arrival only once", () => {
    const tracker = createJobAlertsTracker();
    tracker.ingest([row("a")]);
    expect(tracker.ingest([row("b")]).newJobs.map((j) => j.id)).toEqual(["b"]);
    expect(tracker.ingest([row("b")]).newJobs).toEqual([]);
  });

  it("reset re-baselines, so the next ingest reports nothing", () => {
    const tracker = createJobAlertsTracker();
    tracker.ingest([row("a")]);
    tracker.reset();
    expect(tracker.ingest([row("b")]).newJobs).toEqual([]);
  });

  it("markSeen suppresses a later ingest of the same ids", () => {
    const tracker = createJobAlertsTracker();
    tracker.ingest([row("a")]);
    tracker.markSeen([row("b"), row("c")]);
    const { newJobs } = tracker.ingest([row("b"), row("c"), row("d")]);
    expect(newJobs.map((j) => j.id)).toEqual(["d"]);
  });

  it("markSeen before any ingest does not establish the baseline", () => {
    const tracker = createJobAlertsTracker();
    tracker.markSeen([row("a")]);
    // The first ingest is still the baseline, so it reports nothing.
    expect(tracker.ingest([row("a"), row("b")]).newJobs).toEqual([]);
  });

  it("evicts the oldest ids past the 500 cap", () => {
    const tracker = createJobAlertsTracker();
    tracker.ingest([row("oldest")]);
    // 500 more ids push the set to 501 and evict the single oldest entry.
    tracker.markSeen(Array.from({ length: 500 }, (_, i) => row(`x${i}`)));
    expect(tracker.ingest([row("oldest")]).newJobs.map((j) => j.id)).toEqual([
      "oldest",
    ]);
    // A recently-recorded id is still remembered.
    expect(tracker.ingest([row("x499")]).newJobs).toEqual([]);
  });
});
