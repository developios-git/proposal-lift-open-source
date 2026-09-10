/**
 * Dashboard → Resources: the reference material a self-hoster actually needs.
 *
 * New for this build. The commercial Resources page was a video library and
 * nothing else, because a hosted product has no setup beyond signing in. Here
 * the person using the app is also the one who provisioned the database, filled
 * in the environment, and registered the Upwork developer app, so the page has
 * to point at those.
 *
 * Two kinds of entry, kept apart on purpose:
 *  - `DOC_GUIDES` are files in this repository. They are shown as paths, not
 *    links: a deployed instance has no route that can serve them.
 *  - `EXTERNAL_REFERENCES` open in a new tab. Only first-party documentation
 *    and the consoles where the app's own credentials are issued.
 */

export type DocGuide = {
  /** Repo-relative path, rendered verbatim. */
  path: string;
  title: string;
  description: string;
};

export type ExternalReference = {
  href: string;
  title: string;
  description: string;
  /** Grouping header on the page. */
  group: "Credentials" | "Infrastructure";
};

export const DOC_GUIDES: DocGuide[] = [
  {
    path: "README.md",
    title: "Setup guide",
    description:
      "Create the Supabase project, apply the schema, fill in the environment, register your Upwork app, and start the app.",
  },
  {
    path: "docs/extension.md",
    title: "Chrome extension internals",
    description:
      "How the extension talks to this server: the sign-in handoff, the CORS and redirect-URI rules, and building an unpacked copy. The steps for setting it up are under Extension.",
  },
  {
    path: "docs/cron.md",
    title: "Scheduling job alerts",
    description:
      "Job alerts do not fire until you schedule the cron yourself. This is the snippet, and why it needs a public URL.",
  },
];

export const EXTERNAL_REFERENCES: ExternalReference[] = [
  {
    // Same destination the Settings → Integrations panel links to; keep them
    // in step so the two places never send the user somewhere different.
    href: "https://www.upwork.com/developer/keys/",
    title: "Register an Upwork developer app",
    description:
      "Where the Client ID and Secret come from. Approval can take a few days.",
    group: "Credentials",
  },
  {
    href: "https://platform.openai.com/api-keys",
    title: "OpenAI API keys",
    description:
      "The key every AI feature runs on. Also the one that embeds your portfolio for job matching.",
    group: "Credentials",
  },
  {
    href: "https://console.anthropic.com/settings/keys",
    title: "Anthropic API keys",
    description:
      "Optional. Adds Claude as an alternative model for writing proposals.",
    group: "Credentials",
  },
  {
    href: "https://supabase.com/docs/guides/database/overview",
    title: "Supabase database docs",
    description:
      "The Postgres database behind the app, including the SQL editor you paste the schema into.",
    group: "Infrastructure",
  },
  {
    href: "https://resend.com/docs/introduction",
    title: "Resend",
    description:
      "Sends the job-alert emails. Required if you want alerts; nothing else uses it.",
    group: "Infrastructure",
  },
  {
    href: "https://upstash.com/docs/redis/overall/getstarted",
    title: "Upstash Redis",
    description:
      "Optional rate limiting. The app runs without it — requests are simply not throttled.",
    group: "Infrastructure",
  },
];
