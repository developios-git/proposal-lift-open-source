"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PersonaForm } from "@/components/personas/PersonaForm";
import { ImportUpworkMemberDialog } from "@/components/personas/ImportUpworkMemberDialog";
import type { UpworkPersonaDraft } from "@/lib/personas/map-upwork-member-to-persona";
import { usePersonaImportDraftStore } from "@/lib/personas/persona-import-draft-store";
import { UpworkImportGate } from "@/components/upwork/UpworkImportGate";
import { useUpworkConnection } from "@/lib/upwork/use-upwork-connection";
import { upworkImportDisabledReason } from "@/lib/upwork/upwork-import-disabled-reason";
import { toast } from "sonner";

export default function NewPersonaPage() {
  const router = useRouter();
  const [importOpen, setImportOpen] = useState(false);

  const upworkConnection = useUpworkConnection();
  const importDisabledReason = upworkImportDisabledReason(
    upworkConnection,
    "import personas",
  );

  // Picks up a draft chosen in the dialog on /personas, if the user got
  // here that way. Read once in a lazy initializer rather than an effect: it
  // avoids a cascading render, and the store is empty on the server so there is
  // no SSR guard or hydration mismatch to worry about. `takeDraft` clears as it
  // reads, so coming back here later gives a blank form.
  const [draft, setDraft] = useState<UpworkPersonaDraft | null>(() =>
    usePersonaImportDraftStore.getState().takeDraft(),
  );

  const handleSelect = (selected: UpworkPersonaDraft) => {
    setDraft(selected);
    toast.success("Member details loaded. Review the form before saving.");
  };

  return (
    // w-full: the dashboard shell is a column flex container, so mx-auto alone
    // would make this shrink to fit its content. Matters for the narrow
    // permission-denied branch below.
    <div className="w-full mx-auto max-w-6xl px-4 py-8 pb-16 sm:px-6 lg:py-10">
      <div className="mb-8 flex flex-col gap-6 border-b border-border/60 pb-8 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 gap-4">
          <Button size="icon" className="shrink-0 rounded-xl" asChild>
            <Link href="/personas" aria-label="Back to personas">
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
          <div className="min-w-0 mt-3">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Link
                href="/personas"
                className="text-xs font-medium tracking-wide hover:text-foreground"
              >
                Personas
              </Link>
              <span className="text-xs" aria-hidden>
                /
              </span>
              <span className="text-xs font-medium text-foreground">New</span>
            </div>
            <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold tracking-normal sm:text-3xl">
              Create persona
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              Build a proposal identity: who you are on Upwork, proof points,
              and links. The model uses this whenever this persona is chosen on{" "}
              <span className="font-medium text-foreground/90">Generate</span>.
            </p>
          </div>
        </div>

        <UpworkImportGate reason={importDisabledReason}>
          <Button
            type="button"
            variant="outline"
            className="shrink-0 gap-2 rounded-xl"
            disabled={importDisabledReason !== null}
            onClick={() => setImportOpen(true)}
          >
            <Download className="h-4 w-4" />
            Import from Upwork
          </Button>
        </UpworkImportGate>
      
      </div>

      <PersonaForm
        // Load-bearing: hydrate only runs when `initial` changes identity, so
        // remounting guarantees a newly picked member fully replaces whatever
        // was in the fields.
        key={draft?.upwork_person_id ?? "blank"}
        mode="create"
        initial={draft}
        onSuccess={() => router.push("/personas")}
        onCancel={() => router.push("/personas")}
      />
      <ImportUpworkMemberDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onSelect={handleSelect}
        // Bulk import bypasses this form entirely, so send the user to the
        // list where the new personas actually are.
        onBulkImported={() => router.push("/personas")}
      />
    </div>
  );
}
