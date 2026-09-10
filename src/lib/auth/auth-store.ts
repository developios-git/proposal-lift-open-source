"use client";

import { apiFetch } from "@/lib/api-fetch";
import { create } from "zustand";
import { supabase } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";
import type { Profile } from "@/types";

export interface AuthState {
  user: User | null;
  profile: Profile | null;
  loading: boolean;

  setAuthData: (data: { user: User | null; profile: Profile | null }) => void;

  setLoading: (loading: boolean) => void;

  clearAuth: () => void;

  signOut: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  profile: null,
  loading: true,

  /** Single setter for hydration from the server-rendered layout. */
  setAuthData: ({ user, profile }) =>
    set({
      user,
      profile,
      loading: false,
    }),

  setLoading: (loading) => set({ loading }),

  clearAuth: () =>
    set({
      user: null,
      profile: null,
      loading: false,
    }),

  signOut: async () => {
    try {
      // Clears the httpOnly cookie server-side, then the client session.
      await apiFetch("/api/auth/logout", { method: "POST" });
      await supabase.auth.signOut();
    } finally {
      set({
        user: null,
        profile: null,
        loading: false,
      });
    }
  },
}));
