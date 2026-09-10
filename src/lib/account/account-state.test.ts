import { describe, expect, it } from "vitest";
import { postAuthRedirectPath } from "./account-state";

describe("postAuthRedirectPath", () => {
  it("sends an unconfirmed user to /verify", () => {
    expect(
      postAuthRedirectPath({ emailConfirmed: false, firstRunComplete: false }),
    ).toBe("/verify");
  });

  it("keeps an unconfirmed user on /verify even if onboarding is somehow complete", () => {
    expect(
      postAuthRedirectPath({ emailConfirmed: false, firstRunComplete: true }),
    ).toBe("/verify");
  });

  it("sends a confirmed user with unfinished onboarding to /getting-started", () => {
    expect(
      postAuthRedirectPath({ emailConfirmed: true, firstRunComplete: false }),
    ).toBe("/getting-started");
  });

  it("sends a fully set-up user to /dashboard", () => {
    expect(
      postAuthRedirectPath({ emailConfirmed: true, firstRunComplete: true }),
    ).toBe("/dashboard");
  });
});
