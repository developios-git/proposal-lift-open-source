/**
 * Copy for the Chrome extension walkthrough at `/extension`.
 *
 * Unlike its neighbours in this directory, nothing here is a trust decision —
 * `cors.ts`, `redirect-uri.ts` and `extension-id.ts` are boundaries, this is
 * prose. It sits beside them anyway so that changing how the extension
 * connects and changing what we tell people about connecting it are one edit
 * in one folder.
 *
 * The split with `docs/extension.md` is deliberate: this is what you do, that
 * is how it works underneath.
 */

export type ExtensionStep = {
  title: string;
  body: string;
  /**
   * Steps that render more than prose.
   *  - `install` carries the Chrome Web Store button.
   *  - `server-url` repeats the address from the header card, so it is under
   *    the cursor at the step where it gets typed.
   */
  kind?: "install" | "server-url";
  /** Prerequisites the server can actually check before you install anything. */
  check?: "api-key" | "persona";
  link?: { href: string; label: string };
};

export type ExtensionIssue = {
  symptom: string;
  fix: string;
};

export const EXTENSION_STEPS: ExtensionStep[] = [
  {
    kind: "install",
    title: "Install the extension",
    body:
      "Add it to Chrome from the Web Store. Nothing opens afterwards \u2014 click its " +
      "toolbar icon to reach the setup screen.",
  },
  {
    kind: "server-url",
    title: "Point it at this server",
    body:
      "No server address is compiled into the extension, so the setup screen asks for " +
      "one. Paste this in and press Connect. It probes the server once, which is how it " +
      "tells a typo apart from an address running something else entirely.",
  },
  {
    title: "Sign in",
    body:
      "Press Sign in. A window opens on this site's own login page, so whatever you " +
      "normally sign in with works and no password ever reaches the extension. If you " +
      "are already signed in you land straight on a consent screen: press Connect and " +
      "the window closes itself.",
  },
  {
    check: "api-key",
    title: "Save your OpenAI key",
    body:
      "Every generation runs on your key. There is no shared one to fall back on, and " +
      "the extension reads whatever is saved here rather than asking you again.",
    link: { href: "/settings", label: "Open Settings" },
  },
  {
    check: "persona",
    title: "Build a persona",
    body:
      "Proposals are written as a persona, and the panel only offers ones that are at " +
      "least 70% complete. A name, a bio, a few skills and one profile link clears that.",
    link: { href: "/personas", label: "Open Personas" },
  },
  {
    title: "Open a job's apply page",
    body:
      "The panel appears bottom-right on the apply page only \u2014 the URL starting with " +
      "/nx/proposals/job/~.../apply. A job's public listing page will not show it.",
  },
  {
    title: "Write the draft",
    body:
      "Collapsed, the panel is one button labelled with whatever you still need to do. " +
      "Once everything above is done it reads Write with AI: pick a persona, press it, " +
      "and the draft streams into Upwork's own proposal box. Tick the screening " +
      "questions box and their answers are filled in too, matched to the textareas in " +
      "page order.",
  },
  {
    title: "Edit it, then send it yourself",
    body:
      "Select any passage for a small toolbar. Bold applies unicode bold, and Ctrl+B " +
      "does the same. Ask ProposalLift rewrites just that passage against an " +
      "instruction you type. Nothing here presses Upwork's buttons or spends connects.",
  },
];

export const EXTENSION_ISSUES: ExtensionIssue[] = [
  {
    symptom: "\u201Cis reachable, but it is not a ProposalLift server\u201D",
    fix:
      "Something answered at that address, but not this app's API. Look for a typo, or " +
      "a proxy sitting in front of the app.",
  },
  {
    symptom: "\u201Crunning but is not accepting this extension\u201D",
    fix:
      "This server does not recognise the extension's id, so CORS turned the call away. " +
      "It is running a build from before the extension was published — update it and " +
      "restart.",
  },
  {
    symptom: "\u201CThis link did not come from a recognised ProposalLift extension\u201D",
    fix:
      "The consent screen rejected the address it was asked to hand the session back " +
      "to. Same cause as above. That check is exact string equality on purpose \u2014 " +
      "loosening it would let any site talk your browser into minting a session.",
  },
  {
    symptom: "Sign-in fails, though the app itself works",
    fix:
      "SUPABASE_SECRET_KEY is missing. Extension sign-in mints its session through " +
      "Supabase's admin API, so an instance without it serves the web app normally and " +
      "cannot connect the extension at all.",
  },
  {
    symptom: "The sign-in window opens, then closes immediately",
    fix: "You cancelled, or the one-time code expired. They live 120 seconds \u2014 press Sign in again.",
  },
  {
    symptom: "Nothing appears on the Upwork page",
    fix:
      "You are on the job's listing page rather than its apply page. Open the job, press " +
      "Apply, and the panel appears bottom-right.",
  },
  {
    symptom: "You get signed out on a machine you never touched",
    fix:
      "Working as intended. Your server address syncs between machines but your session " +
      "does not, and each session is bound to the server that issued it. Pointing the " +
      "extension somewhere new signs you out of the old server everywhere.",
  },
];

/** The listing URL for an id, or null while the extension is unpublished. */
export function chromeWebStoreUrl(extensionId: string): string | null {
  const id = extensionId.trim();
  return id ? `https://chromewebstore.google.com/detail/${id}` : null;
}
