import { redirect } from "next/navigation";
import ResetPassword from "@/components/ResetPassword";

/**
 * Reset links now land on `/api/auth/reset-password`, which exchanges the code
 * and forwards here with `/form` appended. This bare path stays reachable for
 * two cases: links already sent by an older deploy (forward the `code` on to
 * the exchange), and a user who reloads the form URL without one.
 */
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const raw = Array.isArray(params.code) ? params.code[0] : params.code;
  const code = raw?.trim();

  if (code) {
    redirect(`/api/auth/reset-password?code=${encodeURIComponent(code)}`);
  }

  return <ResetPassword />;
}
