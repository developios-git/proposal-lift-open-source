"use client";

import { useLayoutEffect } from "react";
import { useAuthStore } from "@/lib/auth/auth-store";
import type { Profile } from "@/types";
import type { User } from "@supabase/supabase-js";

export default function AuthHydrator({
  user,
  profile,
  children,
}: {
  user: User | null;
  profile: Profile | null;
  children: React.ReactNode;
}) {
  const setAuthData = useAuthStore((s) => s.setAuthData);

  // useLayoutEffect (not useEffect) so the store is populated before child
  // components run their own effects — e.g. the settings fetches on the
  // templates and portfolio pages must see an authenticated session.
  useLayoutEffect(() => {
    setAuthData({ user, profile });
  }, [user, profile, setAuthData]);

  return children;
}
