import { describe, expect, it } from "vitest";
import { resolveNameCommit } from "./resolve-name-commit";

describe("resolveNameCommit", () => {
  it("saves a trimmed name when it differs from the current one", () => {
    expect(resolveNameCommit("  Design leads  ", "Untitled")).toEqual({
      action: "save",
      name: "Design leads",
    });
  });

  it("does nothing when the draft matches the current name", () => {
    expect(resolveNameCommit("Design leads", "Design leads")).toEqual({
      action: "none",
      name: "Design leads",
    });
  });

  it("does nothing when only surrounding whitespace was added", () => {
    expect(resolveNameCommit("  Design leads ", "Design leads")).toEqual({
      action: "none",
      name: "Design leads",
    });
  });

  it("reverts an empty draft instead of letting the API coerce it", () => {
    expect(resolveNameCommit("", "Design leads")).toEqual({
      action: "revert",
      name: "Design leads",
    });
  });

  it("reverts a whitespace-only draft", () => {
    expect(resolveNameCommit("   ", "Design leads")).toEqual({
      action: "revert",
      name: "Design leads",
    });
  });

  it("still reverts when the current name is itself empty", () => {
    expect(resolveNameCommit("  ", "")).toEqual({ action: "revert", name: "" });
  });

  it("keeps interior whitespace untouched", () => {
    expect(resolveNameCommit(" US  clients ", "Untitled")).toEqual({
      action: "save",
      name: "US  clients",
    });
  });

  it("treats a case change as a save", () => {
    expect(resolveNameCommit("design leads", "Design leads")).toEqual({
      action: "save",
      name: "design leads",
    });
  });
});
