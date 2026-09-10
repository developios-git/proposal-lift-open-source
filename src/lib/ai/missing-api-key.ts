/**
 * The "you have not added an API key yet" signal, kept apart from the key
 * resolution itself.
 *
 * Split out of `keys.ts` when that file gained decryption. `keys.ts` now
 * imports `node:crypto` transitively and is server-only, but the new-proposal
 * page is a client component and needs `MISSING_API_KEY_CODE` to branch on the
 * error it gets back over SSE. Importing it from there would drag the crypto
 * into the browser bundle.
 *
 * Client code imports this module. Server code may use either — `keys.ts`
 * re-exports both names.
 */

/**
 * Thrown when a generation path needs a provider key the user has not saved.
 *
 * A distinct type, not a plain `Error`, because this is the one failure that is
 * a setup step rather than a fault: it must reach the user as "add your key in
 * Settings", and it must stay distinguishable after crossing an SSE boundary,
 * where only the message and a code survive.
 */
export class MissingApiKeyError extends Error {
  readonly provider: "openai" | "anthropic";

  constructor(provider: "openai" | "anthropic", message: string) {
    super(message);
    this.name = "MissingApiKeyError";
    this.provider = provider;
  }
}

/** The wire code the client branches on. Shared so the two cannot drift. */
export const MISSING_API_KEY_CODE = "missing_api_key";
