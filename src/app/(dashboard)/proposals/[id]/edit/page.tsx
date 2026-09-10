"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter, useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft,
  Save,
  Check,
  AlertCircle,
  Loader2,
  FileText,
  User,
  Link as LinkIcon,
} from "lucide-react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase/client";
import type { ProposalStatus } from "@/types";
import { toast } from "sonner";
import { handleBoldKeyDown } from "@/lib/unicode-bold";

export default function EditProposalPage() {
  const router = useRouter();
  const params = useParams();
  const proposalId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Form state
  const [clientName, setClientName] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [jobUrl, setJobUrl] = useState("");
  const [proposalContent, setProposalContent] = useState("");
  const [status, setStatus] = useState<"draft" | "sent" | "won" | "lost">(
    "draft",
  );
  const [notes, setNotes] = useState("");

  const fetchProposal = async () => {
    if (!isSupabaseConfigured) {
      const msg = "Supabase is not configured";
      setLoadError(msg);
      toast.error(msg);
      setLoading(false);
      return;
    }

    try {
      const { data, error: fetchError } = await supabase
        .from("proposals")
        .select("*")
        .eq("id", proposalId)
        .single();

      if (fetchError) throw fetchError;

      if (data) {
        setClientName(data.client_name);
        setJobTitle(data.job_title);
        setJobDescription(data.job_description || "");
        setJobUrl(data.job_url || "");
        setProposalContent(data.proposal_content);
        setStatus((data.status as ProposalStatus) ?? "draft");
        setNotes(data.notes || "");
      }
    } catch (err) {
      console.error("Error fetching proposal:", err);
      const msg =
        err instanceof Error ? err.message : "Failed to load proposal";
      setLoadError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };


  // Declared after `fetchProposal`, and awaited inside an async IIFE so its
  // setState calls land after the request rather than in the effect body.
  useEffect(() => {
    void (async () => {
      await fetchProposal();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proposalId]);
  const handleSave = async () => {
    // Validation
    if (!clientName.trim()) {
      toast.error("Please enter a client name");
      return;
    }

    if (!jobTitle.trim()) {
      toast.error("Please enter a job title");
      return;
    }

    if (!proposalContent.trim()) {
      toast.error("Proposal content cannot be empty");
      return;
    }

    if (!isSupabaseConfigured) {
      toast.error("Supabase is not configured");
      return;
    }

    setSaving(true);

    try {
      const { error: saveError } = await supabase
        .from("proposals")
        .update({
          client_name: clientName,
          job_title: jobTitle,
          job_description: jobDescription || null,
          job_url: jobUrl || null,
          proposal_content: proposalContent,
          status,
          notes: notes || null,
        })
        .eq("id", proposalId);

      if (saveError) throw saveError;

      setSaveSuccess(true);

      setTimeout(() => {
        router.push("/proposals");
      }, 1000);
    } catch (err) {
      console.error("Error saving proposal:", err);
      toast.error(
        err instanceof Error ? err.message : "Failed to save proposal",
      );
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    router.push("/proposals");
  };

  const wordCount = proposalContent.trim().split(/\s+/).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (loadError && !clientName) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-4">
        <AlertCircle className="h-12 w-12 text-destructive" />
        <p className="text-lg font-semibold">Error loading proposal</p>
        <p className="text-muted-foreground">{loadError}</p>
        <Link href="/proposals">
          <Button>Back to Proposals</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <Link
            href="/proposals"
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to History
          </Link>
          <h1 className="text-3xl font-bold tracking-normal">Edit Proposal</h1>
          <p className="text-muted-foreground">Update your proposal details</p>
        </div>
        <div className="flex items-center gap-3">
          {saveSuccess && (
            <span className="text-sm text-green-600 flex items-center gap-1">
              <Check className="h-4 w-4" />
              Saved successfully!
            </span>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_350px]">
        {/* Main Form */}
        <div className="space-y-6">
          {/* Job Details */}
          <div className="bg-card rounded-xl shadow-sm border overflow-hidden">
            <div className="p-6 border-b flex justify-between items-center">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <FileText className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h3 className="text-base font-bold">Job Details</h3>
                  <p className="text-sm text-muted-foreground">
                    Client and job information
                  </p>
                </div>
              </div>
            </div>
            <div className="p-6 space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-tight">
                    Client Name <span className="text-destructive">*</span>
                  </label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="e.g. Acme Corp"
                      className="pl-9 bg-muted/50"
                      value={clientName}
                      onChange={(e) => setClientName(e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-tight">
                    Status
                  </label>
                  <Select
                    value={status}
                    onValueChange={(value) => setStatus(value as ProposalStatus)}
                  >
                    <SelectTrigger className="bg-muted/50">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="draft">Draft</SelectItem>
                      <SelectItem value="sent">Sent</SelectItem>
                      <SelectItem value="won">Won</SelectItem>
                      <SelectItem value="lost">Lost</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-tight">
                  Job Title <span className="text-destructive">*</span>
                </label>
                <Input
                  placeholder="e.g. Senior React Developer for Fintech Startup"
                  className="bg-muted/50"
                  value={jobTitle}
                  onChange={(e) => setJobTitle(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-tight">
                  Job URL
                </label>
                <div className="relative">
                  <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="url"
                    placeholder="https://upwork.com/jobs/..."
                    className="pl-9 bg-muted/50"
                    value={jobUrl}
                    onChange={(e) => setJobUrl(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-tight">
                  Job Description
                </label>
                <Textarea
                  placeholder="Original job description..."
                  rows={4}
                  className="bg-muted/50"
                  value={jobDescription}
                  onChange={(e) => setJobDescription(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Proposal Content */}
          <div className="bg-card rounded-xl shadow-sm border overflow-hidden">
            <div className="p-6 border-b flex justify-between items-center">
              <div>
                <h3 className="text-base font-bold">Proposal Content</h3>
                <p className="text-sm text-muted-foreground">
                  Your proposal text
                </p>
              </div>
              <div className="text-xs text-muted-foreground">
                {wordCount} words
              </div>
            </div>
            <div className="p-6">
              <Textarea
                placeholder="Write your proposal here..."
                rows={20}
                className="bg-muted/50 font-mono text-sm"
                value={proposalContent}
                onChange={(e) => setProposalContent(e.target.value)}
                onKeyDown={(e) =>
                  handleBoldKeyDown(e, proposalContent, setProposalContent)
                }
              />
            </div>
          </div>

          {/* Notes */}
          <div className="bg-card rounded-xl shadow-sm border overflow-hidden">
            <div className="p-6 border-b">
              <h3 className="text-base font-bold">Internal Notes</h3>
              <p className="text-sm text-muted-foreground">
                Private notes (not shown to client)
              </p>
            </div>
            <div className="p-6">
              <Textarea
                placeholder="Add any internal notes or reminders..."
                rows={4}
                className="bg-muted/50"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 justify-end pb-8">
            <Button variant="outline" size="lg" onClick={handleCancel}>
              Cancel
            </Button>
            <Button
              size="lg"
              className="bg-primary hover:bg-primary/90 text-primary-foreground"
              onClick={handleSave}
              disabled={saving || saveSuccess}
            >
              {saving ? (
                <>
                  <div className="h-4 w-4 mr-2 border-2 border-black border-t-transparent rounded-full animate-spin" />
                  Saving...
                </>
              ) : saveSuccess ? (
                <>
                  <Check className="h-4 w-4 mr-2" />
                  Saved!
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Save Changes
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Sidebar Stats */}
        <div className="space-y-4">
          <div className="bg-card rounded-xl shadow-sm border p-6 sticky top-8">
            <h3 className="text-sm font-bold mb-4">Proposal Stats</h3>
            <div className="space-y-4">
              <div className="flex justify-between items-center py-2 border-b">
                <span className="text-xs text-muted-foreground">Status</span>
                <span
                  className={`text-sm font-semibold capitalize ${
                    status === "won"
                      ? "text-green-600"
                      : status === "lost"
                        ? "text-red-600"
                        : status === "sent"
                          ? "text-blue-600"
                          : "text-gray-600"
                  }`}
                >
                  {status}
                </span>
              </div>
              <div className="flex justify-between items-center py-2 border-b">
                <span className="text-xs text-muted-foreground">
                  Word Count
                </span>
                <span className="text-sm font-semibold">{wordCount}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b">
                <span className="text-xs text-muted-foreground">Read Time</span>
                <span className="text-sm font-semibold">
                  ~{Math.ceil(wordCount / 200)} min
                </span>
              </div>
              <div className="flex justify-between items-center py-2">
                <span className="text-xs text-muted-foreground">Client</span>
                <span className="text-sm font-semibold truncate max-w-[150px]">
                  {clientName || "-"}
                </span>
              </div>
            </div>

            <div className="mt-6 pt-6 border-t space-y-3">
              <Button
                variant="outline"
                className="w-full"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(proposalContent);
                    toast.success("Proposal copied to clipboard!");
                  } catch (err) {
                    console.error("Failed to copy:", err);
                  }
                }}
              >
                Copy to Clipboard
              </Button>
              {jobUrl && (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => window.open(jobUrl, "_blank")}
                >
                  View Job Posting
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
