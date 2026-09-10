/** Matches API errors from /api/jobs/sync when OAuth tokens are missing. */
export function isUpworkConnectionError(message: unknown): boolean {
  if (typeof message !== "string") return false;
  return (
    message.includes("Upwork is not connected") ||
    message.includes("connect your Upwork account")
  );
}
