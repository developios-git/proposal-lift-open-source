import { describe, expect, it } from "vitest";
import { resolveRouteAccess } from "./route-access";

const access = (
  pathname: string,
  over: Partial<{
    signedIn: boolean;
    isRecoverySession: boolean;
    hasResetCode: boolean;
  }> = {},
) =>
  resolveRouteAccess({
    pathname,
    signedIn: false,
    isRecoverySession: false,
    hasResetCode: false,
    ...over,
  }).kind;

describe("resolveRouteAccess", () => {
  describe("signed out", () => {
    it("sends a protected page to login", () => {
      expect(access("/dashboard")).toBe("require_auth");
    });

    it("leaves the auth pages alone", () => {
      expect(access("/login")).toBe("allow");
      expect(access("/signup")).toBe("allow");
      expect(access("/auth/forget-password")).toBe("allow");
      expect(access("/auth/reset-password")).toBe("allow");
    });

    it("lets API routes answer for themselves", () => {
      expect(access("/api/proposals")).toBe("allow");
    });
  });

  describe("signed in", () => {
    const signedIn = { signedIn: true };

    it("bounces the guest-only pages", () => {
      expect(access("/login", signedIn)).toBe("guest_only");
      expect(access("/signup", signedIn)).toBe("guest_only");
      expect(access("/auth/forget-password", signedIn)).toBe("guest_only");
    });

    it("bounces the reset form, which has no business being open", () => {
      expect(access("/auth/reset-password", signedIn)).toBe("guest_only");
      expect(access("/auth/reset-password/form", signedIn)).toBe("guest_only");
    });

    it("still honours a reset link that carries its own code", () => {
      expect(
        access("/auth/reset-password", { ...signedIn, hasResetCode: true }),
      ).toBe("allow");
    });

    it("allows the app itself", () => {
      expect(access("/dashboard", signedIn)).toBe("allow");
      expect(access("/filters", signedIn)).toBe("allow");
    });
  });

  describe("recovery session", () => {
    const recovering = { signedIn: true, isRecoverySession: true };

    it("pins the app back to the reset form", () => {
      expect(access("/dashboard", recovering)).toBe("pin_recovery");
    });

    it("pins the guest-only pages too, so the marker cannot unlock them", () => {
      expect(access("/login", recovering)).toBe("pin_recovery");
      expect(access("/signup", recovering)).toBe("pin_recovery");
      expect(access("/auth/forget-password", recovering)).toBe("pin_recovery");
    });

    it("leaves the reset form reachable", () => {
      expect(access("/auth/reset-password", recovering)).toBe("allow");
      expect(access("/auth/reset-password/form", recovering)).toBe("allow");
    });

    it("lets in-flight callbacks finish", () => {
      expect(access("/auth/callback", recovering)).toBe("allow");
      expect(access("/auth/confirm-callback", recovering)).toBe("allow");
      expect(access("/auth/upwork/callback", recovering)).toBe("allow");
    });

    it("does not pin API routes", () => {
      expect(access("/api/profile", recovering)).toBe("allow");
    });
  });
});
