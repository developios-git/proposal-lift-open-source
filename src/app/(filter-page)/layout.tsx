import AuthHydrator from "@/components/AuthHydrator";
import FilterPageShell from "@/components/FilterPageShell";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { repairProfileAfterEmailConfirmed } from "@/lib/account/gate";
import { redirect } from "next/navigation";

/**
 * Same gate as the dashboard layout; only the chrome differs. See
 * `FilterPageShell` for why /filter/[id] needs its own shell.
 */
export default async function FilterPageLayout({
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

  if (!profileRow) {
    redirect("/login");
  }

  const profile =
    (await repairProfileAfterEmailConfirmed(supabase, user, profileRow)) ??
    profileRow;

  return (
    <AuthHydrator user={user} profile={profile}>
      <FilterPageShell>
        <div className="flex h-full min-h-0 overflow-hidden bg-background">
          {children}
        </div>
      </FilterPageShell>
    </AuthHydrator>
  );
}
