"use client";

import { apiFetch } from "@/lib/api-fetch";
import { useState, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import type { Persona } from "@/types";
import { Loader2, X, CheckCircle, Shield } from "lucide-react";
import {
  computeProfileCompletion,
  MIN_PROFILE_COMPLETION_FOR_PROPOSALS,
} from "@/lib/profile-completion";
import { cn } from "@/lib/utils";

type Props = {
  mode: "create" | "edit";
  personaId?: string;
  initial?:
    | (Partial<Persona> & {
        timezone?: string | null;
        upwork_person_id?: string | null;
      })
    | null;
  readOnly?: boolean;
  onSuccess: () => void;
  onCancel: () => void;
};

type PersonaFormBaseline = {
  fullName: string;
  roleTitle: string;
  bio: string;
  location: string;
  avatarUrl: string;
  yearsExperience: number | "";
  skills: string[];
  specializations: string[];
  certifications: string[];
  upworkUrl: string;
  linkedinUrl: string;
  websiteUrl: string;
  githubUrl: string;
  timezone: string;
};

function baselineFromPersona(p: Partial<Persona>): PersonaFormBaseline {
  return {
    fullName: p.full_name ?? "",
    roleTitle: p.role_title ?? "",
    bio: p.bio ?? "",
    location: p.location ?? "",
    avatarUrl: p.avatar_url ?? "",
    yearsExperience: p.years_of_experience ?? "",
    skills: [...(p.skills ?? [])],
    specializations: [...(p.specializations ?? [])],
    certifications: [...(p.certifications ?? [])],
    upworkUrl: p.upwork_url ?? "",
    linkedinUrl: p.linkedin_url ?? "",
    websiteUrl: p.website_url ?? "",
    githubUrl: p.github_url ?? "",
    timezone: p.timezone ?? "",
  };
}

function stringArraysEqual(a: string[], b: string[]) {
  if (a.length !== b.length) return false;
  return a.every((v, i) => v === b[i]);
}

function currentBaselineFromState(
  fullName: string,
  roleTitle: string,
  bio: string,
  location: string,
  avatarUrl: string,
  yearsExperience: number | "",
  skills: string[],
  specializations: string[],
  certifications: string[],
  upworkUrl: string,
  linkedinUrl: string,
  websiteUrl: string,
  githubUrl: string,
  timezone: string,
): PersonaFormBaseline {
  return {
    fullName,
    roleTitle,
    bio,
    location,
    avatarUrl,
    yearsExperience,
    skills: [...skills],
    specializations: [...specializations],
    certifications: [...certifications],
    upworkUrl,
    linkedinUrl,
    websiteUrl,
    githubUrl,
    timezone,
  };
}

export function PersonaForm({
  mode,
  personaId,
  initial,
  readOnly,
  onSuccess,
  onCancel,
}: Props) {
  const fieldLabel =
    "mb-1.5 block text-sm font-medium uppercase tracking-wide text-muted-foreground";

  const [saving, setSaving] = useState(false);
  const [fullName, setFullName] = useState("");
  const [roleTitle, setRoleTitle] = useState("");
  const [bio, setBio] = useState("");
  const [location, setLocation] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [yearsExperience, setYearsExperience] = useState<number | "">("");
  const [skills, setSkills] = useState<string[]>([]);
  const [specializations, setSpecializations] = useState<string[]>([]);
  const [certifications, setCertifications] = useState<string[]>([]);
  const [skillInput, setSkillInput] = useState("");
  const [specInput, setSpecInput] = useState("");
  const [upworkUrl, setUpworkUrl] = useState("");
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [githubUrl, setGithubUrl] = useState("");
  // No input for either. `timezone` comes from an Upwork import and is stored
  // as opaque display text; `upworkPersonId` is the internal dedup marker.
  // Both are carried through so a save does not silently drop them.
  const [timezone, setTimezone] = useState("");
  const [upworkPersonId, setUpworkPersonId] = useState<string | null>(null);

  /** Loaded values for edit mode; used to detect unsaved edits. */
  const [editBaseline, setEditBaseline] = useState<PersonaFormBaseline | null>(
    null,
  );

  const hydrate = useCallback(() => {
    if (!initial) return;
    setFullName(initial.full_name ?? "");
    setRoleTitle(initial.role_title ?? "");
    setBio(initial.bio ?? "");
    setLocation(initial.location ?? "");
    setAvatarUrl(initial.avatar_url ?? "");
    setYearsExperience(initial.years_of_experience ?? "");
    setSkills(initial.skills ?? []);
    setSpecializations(initial.specializations ?? []);
    setCertifications(initial.certifications ?? []);
    setUpworkUrl(initial.upwork_url ?? "");
    setLinkedinUrl(initial.linkedin_url ?? "");
    setWebsiteUrl(initial.website_url ?? "");
    setGithubUrl(initial.github_url ?? "");
    setTimezone(initial.timezone ?? "");
    setUpworkPersonId(initial.upwork_person_id ?? null);
    if (mode === "edit") {
      setEditBaseline(baselineFromPersona(initial));
    } else {
      setEditBaseline(null);
    }
  }, [initial, mode]);

  /**
   * Seed the fields from `initial`, and re-seed whenever it changes identity.
   *
   * Done during render rather than in an effect: these are a pure derivation of
   * a prop, and a synchronous setState inside an effect is the cascading render
   * `react-hooks/set-state-in-effect` flags. This is React's documented
   * "adjusting state when a prop changes" pattern, and it also removes the
   * one-frame flash of stale values the effect version had.
   *
   * `/personas/new` additionally remounts this form via `key`, so a newly
   * picked Upwork member always replaces the fields wholesale.
   */
  const [hydratedFrom, setHydratedFrom] = useState(initial);
  if (initial !== hydratedFrom) {
    setHydratedFrom(initial);
    hydrate();
  }

  const isDirty = useMemo(() => {
    if (mode !== "edit" || !editBaseline) {
      return mode === "create";
    }
    return (
      fullName !== editBaseline.fullName ||
      roleTitle !== editBaseline.roleTitle ||
      bio !== editBaseline.bio ||
      location !== editBaseline.location ||
      avatarUrl !== editBaseline.avatarUrl ||
      yearsExperience !== editBaseline.yearsExperience ||
      !stringArraysEqual(skills, editBaseline.skills) ||
      !stringArraysEqual(specializations, editBaseline.specializations) ||
      !stringArraysEqual(certifications, editBaseline.certifications) ||
      upworkUrl !== editBaseline.upworkUrl ||
      linkedinUrl !== editBaseline.linkedinUrl ||
      websiteUrl !== editBaseline.websiteUrl ||
      githubUrl !== editBaseline.githubUrl ||
      timezone !== editBaseline.timezone
    );
  }, [
    mode,
    editBaseline,
    fullName,
    roleTitle,
    bio,
    location,
    avatarUrl,
    yearsExperience,
    skills,
    specializations,
    certifications,
    upworkUrl,
    linkedinUrl,
    websiteUrl,
    githubUrl,
    timezone,
  ]);

  const addSkill = (
    raw: string,
    list: string[],
    setList: (v: string[]) => void,
  ) => {
    const t = raw.trim();
    if (t && !list.includes(t)) {
      setList([...list, t]);
    }
  };

  const addCert = () => {
    setCertifications([...certifications, ""]);
  };

  const updateCert = (index: number, value: string) => {
    const next = [...certifications];
    next[index] = value;
    setCertifications(next);
  };

  const removeCert = (index: number) => {
    setCertifications(certifications.filter((_, i) => i !== index));
  };

  const payload = () => ({
    full_name: fullName || null,
    role_title: roleTitle || null,
    bio: bio || null,
    location: location || null,
    avatar_url: avatarUrl || null,
    years_of_experience:
      yearsExperience === "" ? null : Number(yearsExperience),
    skills,
    specializations,
    certifications: certifications.filter(Boolean),
    upwork_url: upworkUrl || null,
    linkedin_url: linkedinUrl || null,
    website_url: websiteUrl || null,
    github_url: githubUrl || null,
    timezone: timezone || null,
    upwork_person_id: upworkPersonId,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (readOnly) return;

    if (mode === "edit" && !isDirty) {
      return;
    }

    setSaving(true);
    try {
      if (mode === "create") {
        const res = await apiFetch("/api/personas", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload()),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || "Failed to create persona");
        }
        toast.success("Persona created");
        onSuccess();
      } else if (mode === "edit" && personaId) {
        const res = await apiFetch(`/api/personas/${personaId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload()),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || "Failed to update persona");
        }
        setEditBaseline(
          currentBaselineFromState(
            fullName,
            roleTitle,
            bio,
            location,
            avatarUrl,
            yearsExperience,
            skills,
            specializations,
            certifications,
            upworkUrl,
            linkedinUrl,
            websiteUrl,
            githubUrl,
            timezone,
          ),
        );
        toast.success("Persona updated");
        onSuccess();
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const ro = !!readOnly;

  const chipRemoveClass =
    "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors hover:bg-muted/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50";

  const inputSurface = "rounded-lg border-border/80 bg-white";
  const inputClass = `${inputSurface} h-11`;

  const completionPercent = computeProfileCompletion({
    full_name: fullName,
    role_title: roleTitle,
    bio,
    location,
    skills,
    specializations,
    years_of_experience: yearsExperience,
    certifications,
    upwork_url: upworkUrl,
    linkedin_url: linkedinUrl,
    website_url: websiteUrl,
    github_url: githubUrl,
  });
  const isEligible = completionPercent >= MIN_PROFILE_COMPLETION_FOR_PROPOSALS;
  const circumference = 2 * Math.PI * 45;
  const strokeDashoffset =
    circumference - (completionPercent / 100) * circumference;
  const completionSections = [
    {
      key: "identity",
      label: "Identity",
      weight: 15,
      filled: !!(fullName || roleTitle || location),
    },
    { key: "bio", label: "Bio", weight: 25, filled: !!bio },
    { key: "skills", label: "Skills", weight: 15, filled: skills.length > 0 },
    {
      key: "specializations",
      label: "Specializations",
      weight: 10,
      filled: specializations.length > 0,
    },
    {
      key: "links",
      label: "Links",
      weight: 25,
      // Mirrors computeProfileCompletion's socialLinks rule: any ONE link.
      filled: !!(upworkUrl || linkedinUrl || websiteUrl || githubUrl),
    },
    {
      key: "experience",
      label: "Experience",
      weight: 10,
      filled:
        yearsExperience !== "" || certifications.filter(Boolean).length > 0,
    },
  ];

  return (
    <form onSubmit={handleSubmit} className="w-full">
      <div className="grid grid-cols-1 lg:grid-cols-3 items-start gap-8">
        {/* Left column: all form sections */}
        <div className="lg:col-span-2 space-y-6">
          {readOnly && (
            <p className="rounded-xl border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
              Viewers can view personas but cannot edit them.
            </p>
          )}

          {/* Profile & visibility */}
          <section className="overflow-hidden rounded-2xl border bg-card shadow-sm ring-1 ring-border/60">
            <header className="border-b border-border/70 bg-muted/30 px-5 py-4 sm:px-6">
              <h2 className="text-base font-semibold tracking-normal">
                Profile & visibility
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Basics the model cites as identity—keep consistent with Upwork.
              </p>
            </header>
            <div className="space-y-5 p-5 sm:p-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2">
                  <label htmlFor="persona-full-name" className={fieldLabel}>
                    Full name
                  </label>
                  <Input
                    id="persona-full-name"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    disabled={ro}
                    className={cn(inputClass)}
                    placeholder="Shown on drafts and attribution"
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor="persona-role" className={fieldLabel}>
                    Role / title
                  </label>
                  <Input
                    id="persona-role"
                    value={roleTitle}
                    onChange={(e) => setRoleTitle(e.target.value)}
                    disabled={ro}
                    className={cn(inputClass)}
                    placeholder="e.g. Full-stack Developer"
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor="persona-years" className={fieldLabel}>
                    Years of experience
                  </label>
                  <Input
                    id="persona-years"
                    type="number"
                    min={0}
                    value={yearsExperience}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === "") setYearsExperience("");
                      else {
                        const n = parseInt(v, 10);
                        setYearsExperience(Number.isNaN(n) ? "" : n);
                      }
                    }}
                    disabled={ro}
                    className={cn(inputClass)}
                    placeholder="0"
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor="persona-location" className={fieldLabel}>
                    Location
                  </label>
                  <Input
                    id="persona-location"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    disabled={ro}
                    className={cn(inputClass)}
                    placeholder="City, country"
                  />
                </div>
              </div>
            </div>
          </section>

          {/* Story & expertise */}
          <section className="overflow-hidden rounded-2xl border bg-card shadow-sm ring-1 ring-border/60">
            <header className="border-b border-border/70 bg-muted/30 px-5 py-4 sm:px-6">
              <h2 className="text-base font-semibold tracking-normal">
                Story & expertise
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Richer context here produces stronger, more specific proposals.
              </p>
            </header>
            <div className="space-y-6 p-5 sm:p-6">
              <div className="space-y-2">
                <label htmlFor="persona-bio" className={fieldLabel}>
                  Bio
                </label>
                <Textarea
                  id="persona-bio"
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  disabled={ro}
                  className={cn("min-h-[140px] rounded-xl", inputSurface)}
                  placeholder="How you work, niches, outcomes clients care about…"
                />
              </div>

              <div className="space-y-2">
                <span className={fieldLabel}>Skills</span>
                <div className="flex min-h-[44px] flex-wrap gap-2 rounded-xl border border-dashed border-border/70 bg-muted/15 p-3">
                  {skills.length === 0 ? (
                    <span className="text-xs text-muted-foreground">
                      Add skills with Enter—used for matching and tone.
                    </span>
                  ) : (
                    skills.map((s) => (
                      <button
                        key={s}
                        type="button"
                        disabled={ro}
                        className={cn(
                          chipRemoveClass,
                          "border-primary/25 bg-primary/10 text-primary",
                        )}
                        onClick={() =>
                          !ro && setSkills(skills.filter((x) => x !== s))
                        }
                      >
                        {s}
                        <X className="h-3.5 w-3.5 opacity-70" aria-hidden />
                      </button>
                    ))
                  )}
                </div>
                <Input
                  value={skillInput}
                  onChange={(e) => setSkillInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addSkill(skillInput, skills, setSkills);
                      setSkillInput("");
                    }
                  }}
                  disabled={ro}
                  className={cn(inputClass)}
                  placeholder="Type a skill, press Enter"
                />
              </div>

              <div className="space-y-2">
                <span className={fieldLabel}>Specializations</span>
                <div className="flex min-h-[44px] flex-wrap gap-2 rounded-xl border border-dashed border-border/70 bg-muted/15 p-3">
                  {specializations.length === 0 ? (
                    <span className="text-xs text-muted-foreground">
                      Domains or verticals (e.g. SaaS, Fintech).
                    </span>
                  ) : (
                    specializations.map((s) => (
                      <button
                        key={s}
                        type="button"
                        disabled={ro}
                        className={cn(
                          chipRemoveClass,
                          "border-border bg-secondary/40 text-secondary-foreground",
                        )}
                        onClick={() =>
                          !ro &&
                          setSpecializations(
                            specializations.filter((x) => x !== s),
                          )
                        }
                      >
                        {s}
                        <X className="h-3.5 w-3.5 opacity-70" aria-hidden />
                      </button>
                    ))
                  )}
                </div>
                <Input
                  value={specInput}
                  onChange={(e) => setSpecInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addSkill(specInput, specializations, setSpecializations);
                      setSpecInput("");
                    }
                  }}
                  disabled={ro}
                  className={cn(inputClass)}
                  placeholder="Type and press Enter"
                />
              </div>

              <div className="space-y-3">
                <span className={fieldLabel}>Certifications</span>
                <div className="space-y-2">
                  {certifications.map((c, i) => (
                    <div key={i} className="flex gap-2">
                      <Input
                        value={c}
                        onChange={(e) => updateCert(i, e.target.value)}
                        disabled={ro}
                        className={cn(inputClass)}
                        placeholder="Certification name"
                      />
                      {!ro && (
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="shrink-0 rounded-lg"
                          onClick={() => removeCert(i)}
                          aria-label="Remove certification"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  ))}
                  {!ro && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="rounded-lg"
                      onClick={addCert}
                    >
                      Add certification
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </section>

          {/* Professional links */}
          <section className="overflow-hidden rounded-2xl border bg-card shadow-sm ring-1 ring-border/60">
            <header className="border-b border-border/70 bg-muted/30 px-5 py-4 sm:px-6">
              <h2 className="text-base font-semibold tracking-normal">
                Professional links
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Optional—helps the model ground references to your presence.
              </p>
            </header>
            <div className="grid gap-4 p-5 sm:grid-cols-2 sm:p-6">
              <div className="space-y-2">
                <label htmlFor="persona-upwork" className={fieldLabel}>
                  Upwork URL
                </label>
                <Input
                  id="persona-upwork"
                  value={upworkUrl}
                  onChange={(e) => setUpworkUrl(e.target.value)}
                  disabled={ro}
                  className={cn(inputClass)}
                  placeholder="https://www.upwork.com/…"
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="persona-linkedin" className={fieldLabel}>
                  LinkedIn URL
                </label>
                <Input
                  id="persona-linkedin"
                  value={linkedinUrl}
                  onChange={(e) => setLinkedinUrl(e.target.value)}
                  disabled={ro}
                  className={cn(inputClass)}
                  placeholder="https://linkedin.com/in/…"
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="persona-website" className={fieldLabel}>
                  Website URL
                </label>
                <Input
                  id="persona-website"
                  value={websiteUrl}
                  onChange={(e) => setWebsiteUrl(e.target.value)}
                  disabled={ro}
                  className={cn(inputClass)}
                  placeholder="https://…"
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="persona-github" className={fieldLabel}>
                  GitHub URL
                </label>
                <Input
                  id="persona-github"
                  value={githubUrl}
                  onChange={(e) => setGithubUrl(e.target.value)}
                  disabled={ro}
                  className={cn(inputClass)}
                  placeholder="https://github.com/…"
                />
              </div>
            </div>
          </section>

          <div className="flex w-full flex-wrap justify-end gap-3 border-t border-border/60 pt-6">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="py-2.5 h-auto rounded-xl"
              onClick={onCancel}
            >
              {readOnly ? "Back" : "Cancel"}
            </Button>
            {!ro && (
              <Button
                type="submit"
                size="sm"
                className="gap-2 py-2.5 h-auto rounded-xl px-6"
                disabled={saving || (mode === "edit" && !isDirty)}
              >
                {saving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving…
                  </>
                ) : mode === "create" ? (
                  "Create persona"
                ) : (
                  "Save changes"
                )}
              </Button>
            )}
          </div>
        </div>

        {/* Persona Completion Card — right column, sticky */}
        <div className="lg:col-span-1 lg:sticky lg:top-24">
          <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
            <div className="border-b bg-muted/50 p-6">
              <h4 className="text-base font-bold">Persona Completion</h4>
              <p className="mt-1 text-xs text-muted-foreground">
                Reach 70% to unlock this persona for proposal generation.
              </p>
            </div>
            <div className="flex flex-col items-center p-8">
              <div className="relative flex h-40 w-40 items-center justify-center">
                <svg className="h-full w-full -rotate-90" viewBox="0 0 100 100">
                  <circle
                    cx="50"
                    cy="50"
                    r="45"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="8"
                    className="text-muted"
                  />
                  <circle
                    cx="50"
                    cy="50"
                    r="45"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="8"
                    strokeDasharray={circumference.toFixed(1)}
                    strokeDashoffset={strokeDashoffset.toFixed(1)}
                    strokeLinecap="round"
                    className={
                      isEligible
                        ? "text-green-500 transition-all duration-500"
                        : "text-primary transition-all duration-500"
                    }
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-3xl font-black">
                    {completionPercent}%
                  </span>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                    Complete
                  </span>
                </div>
              </div>

              <div className="mt-10 w-full space-y-4">
                {completionSections.map((s, i) => (
                  <div
                    key={s.key}
                    className={`flex items-center justify-between ${!s.filled ? "opacity-50" : ""}`}
                  >
                    <div className="flex items-center gap-3">
                      {s.filled ? (
                        <CheckCircle className="h-5 w-5 text-primary" />
                      ) : (
                        <div className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-dashed">
                          <span className="text-[10px] font-bold text-muted-foreground">
                            {i + 1}
                          </span>
                        </div>
                      )}
                      <span className="text-sm font-semibold">{s.label}</span>
                    </div>
                    <span
                      className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase ${s.filled ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary"}`}
                    >
                      +{s.weight}%
                    </span>
                  </div>
                ))}
              </div>

              <div className="mt-8 w-full rounded-xl border border-primary/10 bg-primary/5 p-4">
                <div className="flex items-start gap-3">
                  <Shield className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <div>
                    <p className="text-xs font-bold">
                      {isEligible
                        ? "Ready for proposals!"
                        : "Complete to 70% to unlock"}
                    </p>
                    <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                      {isEligible
                        ? "This persona can be selected on the Generate page to write proposals."
                        : "Once you reach 70%, this persona becomes available in the Generate page."}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </form>
  );
}
