import { afterEach, describe, expect, it, vi } from "vitest";
import {
  decryptSecret,
  encryptSecret,
  isEncryptedSecret,
  readEncryptionKey,
} from "./secret-box";

const KEY_A = Buffer.alloc(32, 1);
const KEY_B = Buffer.alloc(32, 2);

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("encryptSecret / decryptSecret", () => {
  it("round-trips a value", () => {
    const payload = encryptSecret("sk-proj-abc123", KEY_A);
    expect(decryptSecret(payload, KEY_A)).toBe("sk-proj-abc123");
  });

  it("round-trips values that are empty, unicode, or very long", () => {
    for (const value of ["", "π–—🙂", "sk-".padEnd(5000, "x")]) {
      expect(decryptSecret(encryptSecret(value, KEY_A), KEY_A)).toBe(value);
    }
  });

  /** A random IV per call, or identical keys would leak that they are identical. */
  it("produces different ciphertext each time for the same input", () => {
    const a = encryptSecret("same", KEY_A);
    const b = encryptSecret("same", KEY_A);
    expect(a).not.toBe(b);
    expect(decryptSecret(a, KEY_A)).toBe(decryptSecret(b, KEY_A));
  });

  it("refuses a payload encrypted under a different key", () => {
    const payload = encryptSecret("sk-proj-abc123", KEY_A);
    expect(() => decryptSecret(payload, KEY_B)).toThrow();
  });

  /**
   * GCM is authenticated, so this must fail loudly rather than return
   * plausible-looking garbage that then gets sent to a provider as a key.
   */
  it("refuses a tampered ciphertext", () => {
    const [prefix, iv, tag, data] = encryptSecret("secret", KEY_A).split(":");
    const flipped = data!.startsWith("A") ? "B" + data!.slice(1) : "A" + data!.slice(1);
    expect(() => decryptSecret([prefix, iv, tag, flipped].join(":"), KEY_A)).toThrow();
  });

  it("refuses a structurally invalid payload", () => {
    for (const bad of ["", "sk-proj-not-encrypted", "v1:only:three", "v2:a:b:c"]) {
      expect(() => decryptSecret(bad, KEY_A)).toThrow();
    }
  });
});

/**
 * This is what lets a plaintext key already in the database be told apart from
 * an encrypted one. Provider keys start with `sk-`, so the two can never
 * collide — but the check must be on structure, not on a guess about prefixes.
 */
describe("isEncryptedSecret", () => {
  it("recognises its own output", () => {
    expect(isEncryptedSecret(encryptSecret("sk-proj-abc", KEY_A))).toBe(true);
  });

  it("rejects real provider keys and other plaintext", () => {
    for (const value of [
      "sk-proj-abc123",
      "sk-ant-api03-xyz",
      "",
      "   ",
      "v1",
      "v1:incomplete",
      "not:four:parts:but-wrong-prefix".replace("not", "v2"),
    ]) {
      expect(isEncryptedSecret(value)).toBe(false);
    }
  });
});

describe("readEncryptionKey", () => {
  it("accepts 64 hex characters", () => {
    vi.stubEnv("TEST_ENC_KEY", "ab".repeat(32));
    expect(readEncryptionKey("TEST_ENC_KEY")).toHaveLength(32);
  });

  it("accepts 32 raw UTF-8 bytes", () => {
    vi.stubEnv("TEST_ENC_KEY", "x".repeat(32));
    expect(readEncryptionKey("TEST_ENC_KEY")).toHaveLength(32);
  });

  /** The message must name the variable, or a self-hoster cannot act on it. */
  it("names the missing variable when unset", () => {
    vi.stubEnv("TEST_ENC_KEY", "");
    expect(() => readEncryptionKey("TEST_ENC_KEY")).toThrow(/TEST_ENC_KEY/);
  });

  it("rejects a key of the wrong length", () => {
    vi.stubEnv("TEST_ENC_KEY", "tooshort");
    expect(() => readEncryptionKey("TEST_ENC_KEY")).toThrow(/TEST_ENC_KEY/);
  });
});
