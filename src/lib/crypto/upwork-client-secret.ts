import {
  decryptSecret,
  encryptSecret,
  readEncryptionKey,
} from "./secret-box";

/**
 * Encryption for the Upwork OAuth client secret in `user_settings`.
 *
 * The crypto itself now lives in `secret-box.ts`, shared with the AI provider
 * keys. The wire format did not change in that extraction — see the fixture
 * test alongside this file, which decrypts a payload produced by the original
 * implementation and would fail if it ever did.
 */

const ENV_VAR = "UPWORK_CREDENTIALS_ENCRYPTION_KEY";

export function encryptUpworkClientSecret(plaintext: string): string {
  return encryptSecret(plaintext, readEncryptionKey(ENV_VAR));
}

export function decryptUpworkClientSecret(payload: string): string {
  return decryptSecret(payload, readEncryptionKey(ENV_VAR));
}
