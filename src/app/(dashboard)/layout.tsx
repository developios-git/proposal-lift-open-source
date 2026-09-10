import AuthHydrator from "@/components/AuthHydrator";
import DashboardShell from "@/components/DashboardLayout";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { repairProfileAfterEmailConfirmed } from "@/lib/account/gate";
import { redirect } from "next/navigation";

/**
 * Upstream this was 163 lines and almost entirely billing and org: two billing
 * locks that signed the user out, an access lock, an account_state gate, a
 * trial banner, an `organization_members` lookup, and three sequential profile
 * re-reads to see the result of each repair.
 *
 * What is left is the only question this build asks: is there a signed-in user
 * with a profile row?
 *
 * `/verify` and `/getting-started` routing is handled by the proxy on the way
 * in, not here. Putting it in both places is what caused the redirect loops
 * upstream had to work around.
 */
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profileRow } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  // No profile row means the `on_auth_user_created` trigger never fired and the
  // account is unusable, so send them back rather than rendering an empty shell.
  if (!profileRow) {
    redirect("/login");
  }

  const profile =
    (await repairProfileAfterEmailConfirmed(supabase, user, profileRow)) ??
    profileRow;

  return (
    <AuthHydrator user={user} profile={profile}>
      <DashboardShell>{children}</DashboardShell>
    </AuthHydrator>
  );
}
