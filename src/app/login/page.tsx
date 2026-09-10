import { LoginPageClient } from "./LoginPageClient";
import { isGoogleAuthEnabled } from "@/lib/auth/google-auth-enabled";
import { safeAuthRedirectPath } from "@/lib/auth/safe-auth-redirect";

/**
 * `next` is read here rather than with `useSearchParams` in the client so the
 * page needs no Suspense boundary, and so the open-redirect guard runs on the
 * server where it cannot be skipped.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  return (
    <LoginPageClient
      googleEnabled={isGoogleAuthEnabled()}
      next={next ? safeAuthRedirectPath(next) : null}
    />
  );
}
