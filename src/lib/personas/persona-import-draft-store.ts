import { create } from "zustand";
import type { UpworkPersonaDraft } from "@/lib/personas/map-upwork-member-to-persona";

/**
 * Hands a chosen Upwork draft from the personas list to the create form.
 *
 * The import dialog opens in place on `/personas`, but the form lives on
 * `/personas/new`, so the draft has to survive one client-side navigation.
 * A store rather than a query param or sessionStorage because:
 *   - the draft is far too large for a URL, and re-fetching it on the next page
 *     would cost another 3 Upwork API calls
 *   - it starts empty on the server, so a lazy `useState` initializer can read
 *     it during render with no SSR guard and no hydration mismatch
 *
 * `takeDraft` clears as it reads, so returning to the create form later gives a
 * blank form rather than a stale prefill. A hard reload loses the draft, which
 * is the correct outcome: the user should pick again.
 */
type PersonaImportDraftState = {
  draft: UpworkPersonaDraft | null;
  setDraft: (draft: UpworkPersonaDraft | null) => void;
  /** Returns the pending draft and clears it in the same call. */
  takeDraft: () => UpworkPersonaDraft | null;
};

export const usePersonaImportDraftStore = create<PersonaImportDraftState>(
  (set, get) => ({
    draft: null,
    setDraft: (draft) => set({ draft }),
    takeDraft: () => {
      const { draft } = get();
      if (draft) set({ draft: null });
      return draft;
    },
  }),
);
