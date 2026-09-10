"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  RESOURCE_VIDEOS,
  type ResourceVideo,
} from "@/lib/resources/resource-videos";
import { videoPreviewUrl } from "@/lib/resources/video-preview-url";
import {
  DOC_GUIDES,
  EXTERNAL_REFERENCES,
} from "@/lib/resources/resource-links";
import { ExternalLink, FileText, Play } from "lucide-react";

/**
 * Resources.
 *
 * Upstream this was a video library and nothing else. Two things are added
 * here, both because a self-hoster set this instance up themselves and needs
 * the setup material as much as the product tour: the docs shipped in the
 * repository, and the consoles that issue the credentials the app asks for.
 *
 * Each card previews its own video, muted and looping, as upstream did. That
 * means this page does contact the video host on view — the one place in the
 * app that does, and a deliberate exception: a still frame does not tell you
 * what a walkthrough covers, and this page exists to be browsed.
 *
 * The previews are inert (no pointer events, no tab stop, aria-hidden) and
 * lazily loaded, so only the cards actually on screen load a frame. Sound and
 * real playback still require opening the dialog.
 */

function formatPublishedAt(iso: string, nowMs: number): string {
  const date = new Date(iso);
  const days = Math.floor((nowMs - date.getTime()) / 86_400_000);
  if (days < 1) return "Published today";
  if (days === 1) return "Published yesterday";
  if (days < 7) return `Published ${days} days ago`;
  return `Published ${date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  })}`;
}

function formatDuration(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

const REFERENCE_GROUPS = ["Credentials", "Infrastructure"] as const;

export default function ResourcesPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const videoIdFromUrl = searchParams.get("video");

  const [sort, setSort] = useState<"newest" | "oldest">("newest");

  // Read the clock once per mount rather than during every render, so the
  // "Published N days ago" labels cannot differ between two renders of the
  // same list.
  const [nowMs] = useState(() => Date.now());

  const selectedVideo = useMemo((): ResourceVideo | null => {
    if (!videoIdFromUrl) return null;
    return RESOURCE_VIDEOS.find((v) => v.id === videoIdFromUrl) ?? null;
  }, [videoIdFromUrl]);

  const sortedVideos = useMemo(() => {
    const list = [...RESOURCE_VIDEOS];
    list.sort((a, b) => {
      const ta = new Date(a.publishedAt).getTime();
      const tb = new Date(b.publishedAt).getTime();
      return sort === "newest" ? tb - ta : ta - tb;
    });
    return list;
  }, [sort]);

  const openVideo = useCallback(
    (video: ResourceVideo) => {
      router.replace(`/resources?video=${encodeURIComponent(video.id)}`, {
        scroll: false,
      });
    },
    [router],
  );

  const closeVideo = useCallback(() => {
    router.replace("/resources", { scroll: false });
  }, [router]);

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-heading text-2xl font-normal tracking-normal">
            Resources
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Setup guides, product walkthroughs, and the docs for the services
            this app runs on.
          </p>
        </div>
        {RESOURCE_VIDEOS.length > 1 && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Sort</span>
            <Select
              value={sort}
              onValueChange={(v) => setSort(v as "newest" | "oldest")}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="newest">Newest first</SelectItem>
                <SelectItem value="oldest">Oldest first</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {/* Videos. Hidden entirely when the config array is empty, which is a
          supported state for a fork with no recordings of its own. */}
      {sortedVideos.length > 0 && (
        <section className="flex flex-col gap-4">
          <div className="flex items-baseline justify-between gap-2 border-b border-border pb-3">
            <p className="text-sm font-medium text-foreground">
              Videos
              <span className="ml-2 font-normal text-muted-foreground">
                {sortedVideos.length}
              </span>
            </p>
          </div>

          <ul className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {sortedVideos.map((video) => (
              <li key={video.id}>
                <button
                  type="button"
                  aria-label={`Play video: ${video.title}`}
                  onClick={() => openVideo(video)}
                  className={cn(
                    "group w-full cursor-pointer overflow-hidden rounded-xl border border-border/80 bg-card text-left shadow-sm transition",
                    "hover:border-border hover:shadow-md",
                    "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none",
                  )}
                >
                  {/* The placeholder is styled rather than left blank: an
                      empty grey rectangle reads as an image that failed to
                      load, and every card showed one. */}
                  <div className="relative flex aspect-video w-full items-center justify-center overflow-hidden border-b border-border/60 bg-linear-to-br from-muted via-muted to-primary/15">
                    {/* The preview is the video itself, muted and looping.
                        Inert on purpose: pointer events off so the click lands
                        on the card button behind it, no tab stop, and hidden
                        from assistive tech, which reads the button's label
                        instead. Lazy so cards below the fold cost nothing. */}
                    <iframe
                      src={videoPreviewUrl(video.embedUrl)}
                      title=""
                      aria-hidden
                      tabIndex={-1}
                      loading="lazy"
                      allow="autoplay; encrypted-media"
                      referrerPolicy="strict-origin-when-cross-origin"
                      className="pointer-events-none absolute inset-0 size-full border-0"
                    />
                    <span className="relative flex size-12 items-center justify-center rounded-full bg-background/90 text-foreground shadow-md transition group-hover:scale-105">
                      <Play className="size-5 fill-current" aria-hidden />
                    </span>
                    {video.durationSeconds != null ? (
                      <span className="pointer-events-none absolute bottom-2 left-2 rounded bg-foreground/80 px-1.5 py-0.5 text-xs font-medium tabular-nums text-background">
                        {formatDuration(video.durationSeconds)}
                      </span>
                    ) : null}
                  </div>
                  <div className="space-y-1 p-3">
                    <p className="line-clamp-2 font-semibold leading-snug">
                      {video.title}
                    </p>
                    {video.description && (
                      <p className="line-clamp-2 text-sm text-muted-foreground">
                        {video.description}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {formatPublishedAt(video.publishedAt, nowMs)}
                    </p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Docs shipped in the repository. Paths, not links: a running instance
          serves no route for them. */}
      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-1 border-b border-border pb-3">
          <p className="text-sm font-medium text-foreground">
            Guides in this repository
          </p>
          <p className="text-sm text-muted-foreground">
            Open these from your checkout of the source, or read them on the
            repository page you cloned from.
          </p>
        </div>

        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {DOC_GUIDES.map((doc) => (
            <li
              key={doc.path}
              className="flex gap-3 rounded-xl border border-border/80 bg-card p-4 shadow-sm"
            >
              <FileText
                className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                aria-hidden
              />
              <div className="min-w-0 space-y-1">
                <p className="font-semibold leading-snug">{doc.title}</p>
                <p className="text-sm text-muted-foreground">
                  {doc.description}
                </p>
                <code className="inline-block rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
                  {doc.path}
                </code>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* External references, grouped. */}
      {REFERENCE_GROUPS.map((group) => {
        const items = EXTERNAL_REFERENCES.filter((r) => r.group === group);
        if (items.length === 0) return null;

        return (
          <section key={group} className="flex flex-col gap-4">
            <div className="border-b border-border pb-3">
              <p className="text-sm font-medium text-foreground">{group}</p>
            </div>

            <ul className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {items.map((ref) => (
                <li key={ref.href}>
                  <a
                    href={ref.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={cn(
                      "flex h-full gap-3 rounded-xl border border-border/80 bg-card p-4 shadow-sm transition",
                      "hover:border-border hover:shadow-md",
                      "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none",
                    )}
                  >
                    <ExternalLink
                      className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                      aria-hidden
                    />
                    <div className="min-w-0 space-y-1">
                      <p className="font-semibold leading-snug">{ref.title}</p>
                      <p className="text-sm text-muted-foreground">
                        {ref.description}
                      </p>
                    </div>
                  </a>
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      <Dialog
        open={!!selectedVideo}
        onOpenChange={(open) => {
          if (!open) closeVideo();
        }}
      >
        <DialogContent
          className="max-h-[min(90vh,900px)] max-w-[min(100vw-2rem,960px)] gap-0 overflow-hidden p-0 sm:max-w-[960px]"
          showCloseButton
        >
          {selectedVideo ? (
            <>
              <DialogHeader className="sr-only">
                <DialogTitle>{selectedVideo.title}</DialogTitle>
                <DialogDescription>
                  {selectedVideo.description ?? "Video guide"}
                </DialogDescription>
              </DialogHeader>
              <div className="aspect-video w-full bg-black">
                <iframe
                  key={selectedVideo.id}
                  title={selectedVideo.title}
                  src={selectedVideo.embedUrl}
                  className="size-full"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                  loading="lazy"
                />
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
