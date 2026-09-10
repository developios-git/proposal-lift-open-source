import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveAnthropicApiKey, resolveOpenAIApiKey } from "./keys";
import { encryptAiApiKey } from "@/lib/crypto/ai-api-key";

/**
 * The env-fallback cases below are the point of this file: upstream these
 * resolvers returned a platform key when the user had none, and this build must
 * never do that. If someone reintroduces the fallback, these fail.
 */
describe("AI key resolution", () => {
  const saved: Record<string, string | undefined> = {};
  const KEYS = ["OPENAI_API_KEY", "ANTHROPIC_API_KEY"] as const;

  beforeEach(() => {
    for (const k of KEYS) saved[k] = process.env[k];
  });

  afterEach(() => {
    for (const k of KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it("returns the user's saved OpenAI key", () => {
    expect(resolveOpenAIApiKey("sk-user-key")).toBe("sk-user-key");
  });

  it("trims surrounding whitespace", () => {
    expect(resolveOpenAIApiKey("  sk-user-key \n")).toBe("sk-user-key");
    expect(resolveAnthropicApiKey("\tsk-ant-key ")).toBe("sk-ant-key");
  });

  it("treats an empty or whitespace-only key as absent", () => {
    expect(resolveOpenAIApiKey("")).toBeNull();
    expect(resolveOpenAIApiKey("   ")).toBeNull();
    expect(resolveOpenAIApiKey(null)).toBeNull();
    expect(resolveOpenAIApiKey(undefined)).toBeNull();
  });

  it("does NOT fall back to a platform OPENAI_API_KEY", () => {
    process.env.OPENAI_API_KEY = "sk-platform-key";
    expect(resolveOpenAIApiKey(null)).toBeNull();
    expect(resolveOpenAIApiKey("")).toBeNull();
  });

  it("does NOT fall back to a platform ANTHROPIC_API_KEY", () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-platform-key";
    expect(resolveAnthropicApiKey(null)).toBeNull();
    expect(resolveAnthropicApiKey("")).toBeNull();
  });

  it("prefers the user's key even when a platform key is present", () => {
    process.env.OPENAI_API_KEY = "sk-platform-key";
    expect(resolveOpenAIApiKey("sk-user-key")).toBe("sk-user-key");
  });
});

const ENC_KEY = "ab".repeat(32);
const OTHER_ENC_KEY = "cd".repeat(32);

/**
 * The column holds two shapes at once: ciphertext for anything saved since
 * encryption shipped, plaintext for anything saved before it. No backfill was
 * run, so both must resolve.
 */
describe("AI key decryption", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("decrypts a stored encrypted key", () => {
    vi.stubEnv("AI_KEYS_ENCRYPTION_KEY", ENC_KEY);
    const stored = encryptAiApiKey("sk-proj-real-key");
    expect(resolveOpenAIApiKey(stored)).toBe("sk-proj-real-key");
  });

  it("decrypts for both providers", () => {
    vi.stubEnv("AI_KEYS_ENCRYPTION_KEY", ENC_KEY);
    expect(resolveAnthropicApiKey(encryptAiApiKey("sk-ant-real"))).toBe(
      "sk-ant-real",
    );
  });

  /**
   * The legacy path. A plaintext key predating encryption has to keep working,
   * or every existing install loses its AI features on deploy.
   */
  it("passes a legacy plaintext key straight through", () => {
    vi.stubEnv("AI_KEYS_ENCRYPTION_KEY", ENC_KEY);
    expect(resolveOpenAIApiKey("sk-proj-legacy-plaintext")).toBe(
      "sk-proj-legacy-plaintext",
    );
    expect(resolveAnthropicApiKey("  sk-ant-legacy  ")).toBe("sk-ant-legacy");
  });

  /** Resolving plaintext must not need the variable at all. */
  it("resolves a legacy key even with no encryption key configured", () => {
    vi.stubEnv("AI_KEYS_ENCRYPTION_KEY", "");
    expect(resolveOpenAIApiKey("sk-proj-legacy")).toBe("sk-proj-legacy");
  });

  /**
   * The rotated-key case. Null routes the user to "add your key in Settings",
   * which is the actual fix, instead of crashing a generation mid-stream.
   */
  it("resolves to null when the key cannot be decrypted", () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubEnv("AI_KEYS_ENCRYPTION_KEY", ENC_KEY);
    const stored = encryptAiApiKey("sk-proj-real-key");

    vi.stubEnv("AI_KEYS_ENCRYPTION_KEY", OTHER_ENC_KEY);
    expect(resolveOpenAIApiKey(stored)).toBeNull();
    expect(logged).toHaveBeenCalled();
  });

  it("resolves to null when the encryption key is gone entirely", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubEnv("AI_KEYS_ENCRYPTION_KEY", ENC_KEY);
    const stored = encryptAiApiKey("sk-proj-real-key");

    vi.stubEnv("AI_KEYS_ENCRYPTION_KEY", "");
    expect(resolveOpenAIApiKey(stored)).toBeNull();
  });

  /** Never log the key itself, whatever went wrong. */
  it("keeps key material out of the failure log", () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubEnv("AI_KEYS_ENCRYPTION_KEY", ENC_KEY);
    const stored = encryptAiApiKey("sk-proj-super-secret-value");

    vi.stubEnv("AI_KEYS_ENCRYPTION_KEY", OTHER_ENC_KEY);
    resolveOpenAIApiKey(stored);

    const dumped = JSON.stringify(logged.mock.calls.map(String));
    expect(dumped).not.toContain("super-secret-value");
  });
});
