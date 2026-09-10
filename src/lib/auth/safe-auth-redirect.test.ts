import { describe, expect, it } from "vitest";
import { safeAuthRedirectPath } from "./safe-auth-redirect";

describe("safeAuthRedirectPath", () => {
  it("allows same-origin relative paths", () => {
    expect(safeAuthRedirectPath("/extension/handoff")).toBe(
      "/extension/handoff",
    );
    expect(safeAuthRedirectPath("/dashboard")).toBe("/dashboard");
  });

  it("rejects protocol-relative and absolute URLs", () => {
    expect(safeAuthRedirectPath("//evil.com")).toBe("/dashboard");
    expect(safeAuthRedirectPath("https://evil.com")).toBe("/dashboard");
    expect(safeAuthRedirectPath("/\\evil")).toBe("/dashboard");
  });

  it("uses fallback for empty", () => {
    expect(safeAuthRedirectPath(null)).toBe("/dashboard");
    expect(safeAuthRedirectPath("")).toBe("/dashboard");
  });
});
