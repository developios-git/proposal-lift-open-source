import { describe, expect, it } from "vitest";
import {
  resolveGuardedDestination,
  type AnchorNavigationContext,
} from "./resolve-guarded-destination";

const BASE: AnchorNavigationContext = {
  href: "https://app.test/portfolios",
  origin: "https://app.test",
  currentPathWithSearch: "/settings",
};

const resolve = (overrides: Partial<AnchorNavigationContext> = {}) =>
  resolveGuardedDestination({ ...BASE, ...overrides });

describe("resolveGuardedDestination", () => {
  it("guards a plain in-app link to another page", () => {
    expect(resolve()).toBe("/portfolios");
  });

  it("keeps the query string and hash of the destination", () => {
    expect(
      resolve({ href: "https://app.test/settings?tab=webhooks#section" }),
    ).toBe("/settings?tab=webhooks#section");
  });

  it("guards a move to another tab on the same page", () => {
    // Same pathname, different search: the settings page swaps its whole panel,
    // so the unsaved editor goes off screen just as it would on a route change.
    expect(resolve({ href: "https://app.test/settings?tab=webhooks" })).toBe(
      "/settings?tab=webhooks",
    );
  });
});

describe("resolveGuardedDestination leaves clicks alone when", () => {
  it("the click is not a primary button press", () => {
    expect(resolve({ button: 1 })).toBeNull();
    expect(resolve({ button: 2 })).toBeNull();
  });

  it("a modifier key opens it elsewhere", () => {
    expect(resolve({ modifierKey: true })).toBeNull();
  });

  it("the anchor downloads rather than navigates", () => {
    expect(resolve({ hasDownload: true })).toBeNull();
  });

  it("the anchor opens in another tab", () => {
    expect(resolve({ target: "_blank" })).toBeNull();
    expect(resolve({ target: "someframe" })).toBeNull();
  });

  it("the anchor explicitly targets the current tab", () => {
    // _self is the default behaviour, so it must still be guarded.
    expect(resolve({ target: "_self" })).toBe("/portfolios");
  });

  it("there is no href", () => {
    expect(resolve({ href: null })).toBeNull();
    expect(resolve({ href: undefined })).toBeNull();
    expect(resolve({ href: "" })).toBeNull();
  });

  it("the href is unparseable", () => {
    expect(resolve({ href: "not a url" })).toBeNull();
  });

  it("the protocol never replaces the document", () => {
    expect(resolve({ href: "mailto:hi@app.test" })).toBeNull();
    expect(resolve({ href: "tel:+15551234" })).toBeNull();
    expect(resolve({ href: "blob:https://app.test/abc" })).toBeNull();
  });

  it("the destination leaves the origin", () => {
    // beforeunload is the right prompt for a cross-origin exit, and router.push
    // could not complete the navigation anyway.
    expect(resolve({ href: "https://upwork.com/jobs" })).toBeNull();
  });

  it("the destination is the page we are already on", () => {
    expect(resolve({ href: "https://app.test/settings" })).toBeNull();
  });

  it("the click is an in-page anchor jump", () => {
    expect(resolve({ href: "https://app.test/settings#security" })).toBeNull();
  });
});
