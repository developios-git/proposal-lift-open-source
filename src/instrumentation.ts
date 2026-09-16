/**
 * Next.js runs register() once per server instance, before it serves requests.
 *
 * Used here to refuse to start without the Supabase configuration nothing works
 * without. Throwing makes `node server.js` exit with the message, so a Docker
 * container restarts with it at the top of `docker compose logs app` — instead
 * of starting "fine" and answering signup with a bare "Internal server error".
 * On Vercel the same message lands in the function logs.
 *
 * Problems that only break one feature are logged as warnings and the app
 * starts anyway.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { findEnvProblems, readServerEnv } = await import("@/lib/env");
  const { readEncryptionKey } = await import("@/lib/crypto/secret-box");

  const { errors, warnings } = findEnvProblems(readServerEnv());

  for (const name of [
    "UPWORK_CREDENTIALS_ENCRYPTION_KEY",
    "AI_KEYS_ENCRYPTION_KEY",
  ]) {
    try {
      readEncryptionKey(name);
    } catch (error) {
      warnings.push(
        `${(error as Error).message}. Saving credentials that use it will fail until it is fixed.`,
      );
    }
  }

  for (const warning of warnings) {
    console.warn(`[config] ${warning}`);
  }

  if (errors.length > 0) {
    throw new Error(
      "ProposalLift cannot start. Fix these environment variables:\n" +
        errors.map((error) => `  - ${error}`).join("\n"),
    );
  }
}
