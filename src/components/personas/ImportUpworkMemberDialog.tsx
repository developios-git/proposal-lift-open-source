"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-fetch";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, UserCircle2, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  computeProfileCompletion,
  MIN_PROFILE_COMPLETION_FOR_PROPOSALS,
} from "@/lib/profile-completion";
import type { UpworkPersonaDraft } from "@/lib/personas/map-upwork-member-to-persona";
import type {
  AgencyMemberCandidate,
  AgencyMembersResponse,
  BulkImportResponse,
  BulkImportSkipped,
} from "@/app/api/upwork/agency-members/route";

/*
 * Styling follows the landing dialog (src/components/landing/HowItWorksVideoButton.tsx):
 * #f6f7f4 surface, #e0e3dc / #cdd0cb borders, #0b0f0a ink, #535652 muted,
 * #8ea726 accent, rounded-[16px], p-0 shell with padded sections.
 *
 * It deliberately does NOT use `--font-onest`. That variable is defined in
 * landing.css and scoped to `.landing-root`, so on a dashboard route it would
 * silently fall back. `font-heading` is global and is used for the title.
 */

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called with the chosen member's prefill draft. Single-select writes nothing. */
  onSelect: (draft: UpworkPersonaDraft) => void;
  /** Called after a bulk import finishes and the user dismisses the summary. */
  onBulkImported: () => void;
};

/**
 * Names the sections a draft is still missing, so the row can say what the user
 * will need to add rather than just showing a number. Mirrors the sections in
 * computeProfileCompletion, including its one-link rule for socialLinks.
 */
function missingSections(draft: UpworkPersonaDraft): string[] {
  const missing: string[] = [];
  if (!draft.bio) missing.push("a bio");
  if (draft.skills.length === 0) missing.push("skills");
  if (draft.specializations.length === 0) missing.push("a specialization");
  if (draft.years_of_experience == null) missing.push("experience");
  if (!draft.upwork_url) missing.push("a profile link");
  return missing;
}

const SURFACE = "bg-[#f6f7f4]";
const HAIRLINE = "border-[#e0e3dc]";
const INK = "text-[#0b0f0a]";
const MUTED = "text-[#535652]";

export function ImportUpworkMemberDialog({
  open,
  onOpenChange,
  onSelect,
  onBulkImported,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<AgencyMembersResponse | null>(null);
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
  const [bulkRunning, setBulkRunning] = useState(false);
  const [bulkResult, setBulkResult] = useState<BulkImportResponse | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setData(null);
    setSelectedPersonId(null);
    setBulkResult(null);
    try {
      const res = await apiFetch("/api/upwork/agency-members");
      const body = (await res.json()) as AgencyMembersResponse & {
        error?: string;
        message?: string;
      };
      if (!res.ok) {
        throw new Error(
          body.message || body.error || "Failed to load Upwork members",
        );
      }
      setData(body);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load Upwork members");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    // Awaited inside an async IIFE rather than called directly: `load` opens
    // with a synchronous state reset, and calling it straight from an effect
    // body is the cascading render `react-hooks/set-state-in-effect` flags.
    void (async () => {
      await load();
    })();
  }, [open, load]);

  const selected =
    data?.members.find((m) => m.personId === selectedPersonId) ?? null;

  // Copy adapts to what the list actually represents. An agency roster reads as
  // "pick a member"; a solo freelancer, or an agency member who cannot list the
  // roster, only ever sees themselves.
  const isSelfOnly = data?.reason === "self";
  const eyebrow = isSelfOnly ? "Upwork profile" : "Upwork agency";
  const title = isSelfOnly
    ? "Import your Upwork profile"
    : "Import a member from Upwork";
  const description = isSelfOnly
    ? "Your Upwork profile fills the persona form, where you can review and edit everything before saving."
    : "Pick one member. Their Upwork details fill the persona form, where you can review and edit everything before saving.";

  const handleUse = () => {
    if (!selected) return;
    onSelect(selected.draft);
    onOpenChange(false);
  };

  const importableCount = data?.members.filter((m) => m.importable).length ?? 0;

  const handleImportAll = async () => {
    setBulkRunning(true);
    setError(null);
    try {
      const res = await apiFetch("/api/upwork/agency-members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const body = (await res.json()) as BulkImportResponse & {
        error?: string;
        message?: string;
      };
      if (!res.ok) {
        throw new Error(body.message || body.error || "Bulk import failed");
      }
      setBulkResult(body);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Bulk import failed");
    } finally {
      setBulkRunning(false);
    }
  };

  const skipLabel = (s: BulkImportSkipped): string => {
    if (s.reason === "duplicate") return "already imported";
    if (s.reason === "failed") return "could not be saved";
    return s.missing.length > 0
      ? `needs ${s.missing.join(", ")}`
      : "incomplete profile";
  };

  const renderSummary = (result: BulkImportResponse) => (
    <div className="space-y-4">
      <div className="rounded-[10px] border border-[#8ea726]/40 bg-[#8ea726]/10 px-4 py-3">
        <p className={cn("text-sm font-semibold", INK)}>
          {result.createdCount === 1
            ? "1 persona created"
            : `${result.createdCount} personas created`}
        </p>
        {result.skippedCount > 0 && (
          <p className={cn("mt-0.5 text-xs", MUTED)}>
            {result.skippedCount === 1
              ? "1 member was skipped."
              : `${result.skippedCount} members were skipped.`}
          </p>
        )}
      </div>

      {result.skipped.length > 0 && (
        <ul className="space-y-2">
          {result.skipped.map((s) => (
            <li
              key={s.personId}
              className={cn(
                "flex flex-wrap items-baseline gap-x-2 gap-y-0.5 rounded-[10px] border bg-white px-3 py-2 text-xs",
                HAIRLINE,
              )}
            >
              <span className={cn("font-medium", INK)}>{s.displayName}</span>
              <span className={MUTED}>{skipLabel(s)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  const renderRow = (member: AgencyMemberCandidate) => {
    const isSelected = member.personId === selectedPersonId;
    const disabled = member.alreadyImported;
    const completion = computeProfileCompletion(member.draft);
    const isReady = completion >= MIN_PROFILE_COMPLETION_FOR_PROPOSALS;
    const missing = missingSections(member.draft);

    return (
      <button
        key={member.personId}
        type="button"
        role="radio"
        aria-checked={isSelected}
        disabled={disabled}
        onClick={() => setSelectedPersonId(member.personId)}
        className={cn(
          "flex w-full items-start gap-3 rounded-[12px] border bg-white px-3 py-3 text-left transition-colors sm:px-4",
          "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[#8ea726]/25",
          isSelected
            ? "border-[#8ea726] bg-[#8ea726]/[0.07] ring-2 ring-[#8ea726]/25"
            : "border-[#e0e3dc] hover:border-[#cdd0cb] hover:bg-[#f0f2ed]",
          disabled &&
            "cursor-not-allowed opacity-55 hover:border-[#e0e3dc] hover:bg-white",
        )}
      >
        {member.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={member.photoUrl}
            alt=""
            className="mt-0.5 size-9 shrink-0 rounded-full object-cover sm:size-10"
          />
        ) : (
          <UserCircle2
            className="mt-0.5 size-9 shrink-0 text-[#9aa09a] sm:size-10"
            aria-hidden
          />
        )}

        <span className="min-w-0 flex-1">
          {/* Wraps rather than truncating, so a long name plus both chips
              still reads on a narrow screen. */}
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className={cn("min-w-0 truncate text-sm font-semibold", INK)}>
              {member.displayName}
            </span>
            <span
              className={cn(
                "shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold tabular-nums",
                isReady
                  ? "border-[#8ea726]/40 bg-[#8ea726]/15 text-[#4c5c14]"
                  : "border-[#e4d8ab] bg-[#f6efd8] text-[#6d5c18]",
              )}
            >
              {completion}%
            </span>
            {member.alreadyImported && (
              <span className="shrink-0 rounded-full border border-[#cdd0cb] bg-[#e3e6e1] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-[#535652]">
                Already imported
              </span>
            )}
          </span>

          <span className={cn("mt-1 block truncate text-xs", MUTED)}>
            {member.draft.role_title || "No profile details from Upwork"}
          </span>

          {!isReady && (
            <span className="mt-1.5 block text-xs leading-[1.5] text-[#6d5c18]">
              {missing.length > 0
                ? `Needs ${missing.join(", ")} to reach ${MIN_PROFILE_COMPLETION_FOR_PROPOSALS}%. Add it on the next screen.`
                : `Needs a little more detail to reach ${MIN_PROFILE_COMPLETION_FOR_PROPOSALS}%. Add it on the next screen.`}
            </span>
          )}

          {!member.alreadyImported && !member.importable && (
            <span className="mt-1.5 block text-xs leading-[1.5] text-[#6d5c18]">
              Bulk import will skip this one:{" "}
              {member.missingForImport.length > 0
                ? `needs ${member.missingForImport.join(", ")}`
                : "the Upwork profile is too thin"}
              . You can still select it and fill the form in by hand.
            </span>
          )}
        </span>
      </button>
    );
  };

  const body = () => {
    if (bulkResult) return renderSummary(bulkResult);

    if (loading) {
      return (
        <div
          className={cn(
            "flex items-center justify-center gap-3 py-16 text-sm",
            MUTED,
          )}
          role="status"
          aria-live="polite"
        >
          <Loader2 className="size-5 animate-spin" aria-hidden />
          Loading Upwork members...
        </div>
      );
    }

    if (error) {
      return (
        <div className="space-y-4 py-12 text-center">
          <p className="text-sm text-red-600">{error}</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void load()}
            className="h-10 rounded-[10px] border-[#cdd0cb] bg-[#e3e6e1] px-5 text-sm font-semibold text-[#0b0f0a] shadow-none hover:bg-[#d8dbd6]"
          >
            Try again
          </Button>
        </div>
      );
    }

    if (data?.reason === "none" || (data && data.members.length === 0)) {
      return (
        <div
          className={cn(
            "rounded-[12px] border border-dashed px-6 py-12 text-center",
            HAIRLINE,
          )}
        >
          <Users className={cn("mx-auto mb-3 size-9", MUTED)} aria-hidden />
          <p className={cn("text-sm font-semibold", INK)}>
            Nothing to import from Upwork
          </p>
          <p
            className={cn("mx-auto mt-1.5 max-w-sm text-sm leading-[1.6]", MUTED)}
          >
            The connected Upwork account has no freelancer profile, so there is
            nothing to bring across. Fill the form in manually instead.
          </p>
        </div>
      );
    }

    return (
      <div className="space-y-3">
        {data && !data.enrichmentAvailable && (
          <p className="rounded-[10px] border border-[#e4d8ab] bg-[#f6efd8] px-4 py-3 text-xs leading-[1.6] text-[#6d5c18]">
            Upwork did not return full profiles for these members, so only the
            name, photo, and profile link are filled. Add the role, bio, and
            skills yourself in the form.
          </p>
        )}
        {data?.truncated && (
          <p className={cn("text-xs", MUTED)}>
            Showing the first {data.memberCount} members. Upwork returns one
            page at a time.
          </p>
        )}

        <div
          role="radiogroup"
          aria-label="Upwork agency members"
          className="space-y-2"
        >
          {data?.members.map(renderRow)}
        </div>
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          // flex + max-h so the list scrolls while header and footer stay put,
          // instead of the whole dialog growing past the viewport.
          "flex max-h-[min(88vh,760px)] flex-col gap-0 overflow-hidden p-0",
          "rounded-[16px] border shadow-[0_24px_60px_-20px_rgba(11,15,10,0.35)]",
          "sm:max-w-[580px]",
          HAIRLINE,
          SURFACE,
        )}
      >
        <div className="shrink-0 px-5 pb-4 pt-6 sm:px-8 sm:pb-5 sm:pt-8">
          <DialogHeader className="gap-2.5 text-left sm:text-left">
            <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-[#cdd0cb] bg-[#e3e6e1] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#535652]">
              <Users className="size-3.5 text-[#0b0f0a]" aria-hidden />
              {eyebrow}
            </span>
            <DialogTitle
              className={cn(
                "font-heading text-[22px] font-normal leading-[1.2] sm:text-[26px]",
                INK,
              )}
            >
              {title}
            </DialogTitle>
            <DialogDescription
              className={cn("text-sm leading-[1.6] tracking-[-0.08px]", MUTED)}
            >
              {description}
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 sm:px-8">
          {body()}
        </div>

        <div
          className={cn(
            "shrink-0 border-t bg-[#f0f2ed] px-5 py-4 sm:px-8",
            HAIRLINE,
          )}
        >
          {bulkResult ? (
            <DialogFooter className="gap-3">
              <Button
                type="button"
                onClick={() => {
                  onOpenChange(false);
                  onBulkImported();
                }}
                className="h-11 rounded-[10px] border border-[#8ea726] bg-primary px-6 text-sm font-semibold text-[#0b0f0a] shadow-none transition hover:brightness-[1.03]"
              >
                Done
              </Button>
            </DialogFooter>
          ) : (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              {data?.reason === "agency" && importableCount > 0 ? (
                <Button
                  type="button"
                  onClick={() => void handleImportAll()}
                  disabled={bulkRunning}
                  className="h-11 rounded-[10px] border border-[#cdd0cb] bg-[#e3e6e1] px-5 text-sm font-semibold text-[#0b0f0a] shadow-none transition-colors hover:bg-[#d8dbd6]"
                >
                  {bulkRunning ? (
                    <>
                      <Loader2
                        className="mr-2 size-4 animate-spin"
                        aria-hidden
                      />
                      Importing...
                    </>
                  ) : (
                    `Import all ${importableCount}`
                  )}
                </Button>
              ) : (
                // Keeps justify-between pushing the pair right when there is no
                // bulk button, i.e. the solo and permission-denied paths.
                <span />
              )}

              <DialogFooter className="gap-3 sm:flex-row">
                <Button
                  type="button"
                  onClick={() => onOpenChange(false)}
                  disabled={bulkRunning}
                  className="h-11 rounded-[10px] border border-[#cdd0cb] bg-[#e3e6e1] px-6 text-sm font-semibold text-[#0b0f0a] shadow-none transition-colors hover:bg-[#d8dbd6]"
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={handleUse}
                  disabled={!selected || bulkRunning}
                  className="h-11 rounded-[10px] border border-[#8ea726] bg-primary px-6 text-sm font-semibold text-[#0b0f0a] shadow-none transition hover:brightness-[1.03]"
                >
                  Use this member
                </Button>
              </DialogFooter>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
