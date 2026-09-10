/**
 * Dashboard → Resources: video library config.
 *
 * Swap these for your own recordings if you fork this. The page renders nothing
 * for the videos section when the array is empty, so removing them all is a
 * supported state rather than a broken one.
 *
 * Each card previews its video the way upstream did: the embed, muted and
 * looping, playing behind the card. It was dropped in the port for a real
 * reason — three third-party frames load before the user has asked for any of
 * them, on an app that otherwise makes no third-party call on page view — and
 * put back deliberately, because a still frame does not convey what the video
 * is and the page is a video library first.
 *
 * The cost is contained where it can be: the preview iframes are lazily loaded
 * so cards below the fold cost nothing until scrolled to, and they are inert —
 * no pointer events, no tab stop, out of the accessibility tree. Playback with
 * sound still only happens in the dialog, after a click.
 */

export type ResourceVideo = {
  id: string;
  title: string;
  /** Shown under the title on the card. */
  description?: string;
  /** ISO 8601 */
  publishedAt: string;
  /** iframe src in the dialog — full embed URL for playback. */
  embedUrl: string;
  /** Optional; shown as MM:SS on the card */
  durationSeconds?: number;
  /** Optional grouping for future filters */
  category?: string;
};

export const RESOURCE_VIDEOS: ResourceVideo[] = [
  {
    id: "proposallift-overview",
    title: "ProposalLift — Overview",
    description:
      "A walkthrough of the app: personas, templates, hooks, the Chrome extension, and job alerts.",
    publishedAt: "2026-07-07T10:00:00.000Z",
    embedUrl:
      "https://www.tella.tv/video/vid_cmr96ttcc001w0aghh2kaequb/embed?b=1&title=1&a=1&loop=0&autoPlay=true&t=0&muted=1&wt=0&o=1",
    category: "Getting started",
  },
  {
    id: "connect-upwork-api-key",
    title: "How to Connect Upwork API Key",
    description:
      "Register a developer app, set its permissions, and connect your Upwork account.",
    publishedAt: "2026-07-07T10:00:00.000Z",
    embedUrl:
      "https://www.tella.tv/video/vid_cmr9ar0by00jx0akt6pcsc8r6/embed?b=1&title=1&a=1&loop=0&autoPlay=true&t=0&muted=1&wt=0&o=1",
    category: "Getting started",
  },
  {
    id: "upwork-auth-vs-upwork-api",
    title: "Upwork Auth vs Upwork API: What They Are and How to Connect",
    description:
      "Why connecting an account and registering a developer app are two separate steps.",
    publishedAt: "2026-08-04T10:00:00.000Z",
    embedUrl:
      "https://www.tella.tv/video/vid_cmsd98noe02f204jw2gr995y7/embed?b=1&title=1&a=1&loop=0&autoPlay=true&t=0&muted=1&wt=0&o=1",
    category: "Getting started",
  },
];
