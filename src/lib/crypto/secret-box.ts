import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Authenticated symmetric encryption for secrets held in `user_settings`.
 *
 * Extracted from `upwork-client-secret.ts` when the AI provider keys needed the
 * same treatment. Two copies of a crypto routine is one copy too many: a fix or
 * a format change applied to one and not the other is the kind of bug that
 * stays silent until someone's stored secret will not decrypt.
 *
 * The wire format is unchanged from that original — `v1:<iv>:<tag>:<ciphertext>`,
 * AES-256-GCM, base64url — so every Upwork client secret already in a database
 * still decrypts. `upwork-client-secret.test.ts` pins that with a fixture
 * generated before the extraction.
 *
 * GCM, not CBC: the auth tag means a tampered payload throws instead of
 * returning plausible garbage that would then be sent to a provider as an API
 * key.
 */

const PREFIX = "v1";
const ALGO = "aes-256-gcm";
const IV_LEN = 16;
const KEY_LEN = 32;

/**
 * Reads and validates an encryption key from the environment.
 *
 * Takes the variable name so the error can name it. A self-hoster who sees
 * "the encryption key is missing" has to go looking; one who sees
 * "AI_KEYS_ENCRYPTION_KEY is not set" already knows what to do.
 */
export function readEncryptionKey(envVarName: string): Buffer {
  const raw = process.env[envVarName]?.trim();
  if (!raw) {
    throw new Error(`${envVarName} is not set (64 hex chars = 32 bytes)`);
  }
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    return Buffer.from(raw, "hex");
  }
  if (raw.length === KEY_LEN) {
    return Buffer.from(raw, "utf8");
  }
  throw new Error(
    `${envVarName} must be 64 hex characters or 32 UTF-8 bytes`,
  );
}

/**
 * Whether a stored value is one of ours, as opposed to a plaintext secret
 * written before encryption existed.
 *
 * Structural, not a prefix guess: four colon-separated parts led by the version
 * tag. Provider keys (`sk-proj-…`, `sk-ant-…`) and Upwork secrets cannot take
 * that shape, so a legacy row is never mistaken for ciphertext or the reverse.
 */
export function isEncryptedSecret(value: string): boolean {
  const parts = value.split(":");
  return parts.length === 4 && parts[0] === PREFIX;
}

/** Format: `v1:<iv_b64url>:<tag_b64url>:<ciphertext_b64url>` */
export function encryptSecret(plaintext: string, key: Buffer): string {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [
    PREFIX,
    iv.toString("base64url"),
    tag.toString("base64url"),
    enc.toString("base64url"),
  ].join(":");
}

export function decryptSecret(payload: string, key: Buffer): string {
  if (!isEncryptedSecret(payload)) {
    throw new Error("Invalid encrypted payload");
  }
  const [, ivB64, tagB64, dataB64] = payload.split(":");
  const iv = Buffer.from(ivB64!, "base64url");
  const tag = Buffer.from(tagB64!, "base64url");
  const data = Buffer.from(dataB64!, "base64url");
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString(
    "utf8",
  );
}
