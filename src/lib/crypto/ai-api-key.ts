import {
  decryptSecret,
  encryptSecret,
  readEncryptionKey,
} from "./secret-box";

/**
 * Encryption for `user_settings.openai_api_key` and `.anthropic_api_key`.
 *
 * These are the credentials that cost the user money on every request, so they
 * get the same treatment the Upwork client secret has always had. Keyed on its
 * own variable rather than sharing `UPWORK_CREDENTIALS_ENCRYPTION_KEY`, so the
 * two can be rotated independently.
 *
 * Encryption applies going forward only: keys written before this existed stay
 * plaintext and keep working, which `lib/ai/keys.ts` handles on the read side.
 */

const ENV_VAR = "AI_KEYS_ENCRYPTION_KEY";

export function encryptAiApiKey(plaintext: string): string {
  return encryptSecret(plaintext, readEncryptionKey(ENV_VAR));
}

export function decryptAiApiKey(payload: string): string {
  return decryptSecret(payload, readEncryptionKey(ENV_VAR));
}
