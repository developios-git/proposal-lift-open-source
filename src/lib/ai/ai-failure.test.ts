import { describe, expect, it } from "vitest";
import { classifyAIHttpStatus } from "./ai-failure";

const FALLBACK = "Failed to generate template";

describe("classifyAIHttpStatus rejected keys", () => {
  it("treats 401 and 403 as a key the user must fix", () => {
    for (const status of [401, 403]) {
      const f = classifyAIHttpStatus(status, "openai", FALLBACK);
      expect(f.code).toBe("invalid_api_key");
      expect(f.message).toContain("rejected your API key");
    }
  });

  it("answers 400, not the provider's 401", () => {
    // The caller's key is wrong; this app's request was fine. Passing 401
    // through would read as "you are not signed in" to any client that
    // handles auth generically.
    expect(classifyAIHttpStatus(401, "openai", FALLBACK).status).toBe(400);
  });

  it("never tells the user to try again", () => {
    // Retrying a rejected key fails identically, forever.
    const f = classifyAIHttpStatus(401, "openai", FALLBACK);
    expect(f.message.toLowerCase()).not.toContain("try again");
  });

  it("names the provider that did the rejecting", () => {
    expect(classifyAIHttpStatus(401, "openai", FALLBACK).message).toContain(
      "OpenAI",
    );
    expect(classifyAIHttpStatus(401, "anthropic", FALLBACK).message).toContain(
      "Anthropic",
    );
  });
});

describe("classifyAIHttpStatus quota", () => {
  it("keeps 429 separate from a bad key", () => {
    // A 429 means the key works and the account does not. Calling it invalid
    // would send the user to replace a key that is fine.
    const f = classifyAIHttpStatus(429, "openai", FALLBACK);
    expect(f.code).toBe("provider_quota");
    expect(f.status).toBe(429);
    expect(f.message).toContain("quota");
  });
});

describe("classifyAIHttpStatus provider outages", () => {
  it("maps every 5xx to an upstream failure", () => {
    for (const status of [500, 502, 503, 529]) {
      const f = classifyAIHttpStatus(status, "anthropic", FALLBACK);
      expect(f.code).toBe("provider_unavailable");
      expect(f.status).toBe(502);
    }
  });
});

describe("classifyAIHttpStatus fallback", () => {
  it("uses the caller's message when there is no status", () => {
    const f = classifyAIHttpStatus(undefined, "openai", FALLBACK);
    expect(f).toEqual({
      message: FALLBACK,
      code: "generation_failed",
      status: 500,
    });
  });

  it("uses the caller's message for statuses it has no advice for", () => {
    for (const status of [400, 404, 422]) {
      expect(classifyAIHttpStatus(status, "openai", FALLBACK).message).toBe(
        FALLBACK,
      );
    }
  });

  it("does not treat a 200 as a failure category", () => {
    expect(classifyAIHttpStatus(200, "openai", FALLBACK).code).toBe(
      "generation_failed",
    );
  });
});
