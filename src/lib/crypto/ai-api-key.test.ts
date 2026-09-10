import { afterEach, describe, expect, it, vi } from "vitest";
import { decryptAiApiKey, encryptAiApiKey } from "./ai-api-key";

const KEY = "ab".repeat(32);
const OTHER_KEY = "cd".repeat(32);

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("AI API key encryption", () => {
  it("round-trips an OpenAI key", () => {
    vi.stubEnv("AI_KEYS_ENCRYPTION_KEY", KEY);
    const payload = encryptAiApiKey("sk-proj-abc123def456");
    expect(payload).not.toContain("sk-proj");
    expect(decryptAiApiKey(payload)).toBe("sk-proj-abc123def456");
  });

  it("round-trips an Anthropic key", () => {
    vi.stubEnv("AI_KEYS_ENCRYPTION_KEY", KEY);
    const payload = encryptAiApiKey("sk-ant-api03-xyz789");
    expect(decryptAiApiKey(payload)).toBe("sk-ant-api03-xyz789");
  });

  /**
   * The failure mode this guards is an operator rotating the key and the app
   * quietly sending garbage to OpenAI as a credential.
   */
  it("refuses a payload written under a different key", () => {
    vi.stubEnv("AI_KEYS_ENCRYPTION_KEY", KEY);
    const payload = encryptAiApiKey("sk-proj-abc123");
    vi.stubEnv("AI_KEYS_ENCRYPTION_KEY", OTHER_KEY);
    expect(() => decryptAiApiKey(payload)).toThrow();
  });

  /** Its own variable — sharing the Upwork one was considered and rejected. */
  it("names AI_KEYS_ENCRYPTION_KEY when it is missing", () => {
    vi.stubEnv("AI_KEYS_ENCRYPTION_KEY", "");
    vi.stubEnv("UPWORK_CREDENTIALS_ENCRYPTION_KEY", KEY);
    expect(() => encryptAiApiKey("sk-proj-abc")).toThrow(
      /AI_KEYS_ENCRYPTION_KEY/,
    );
  });
});
