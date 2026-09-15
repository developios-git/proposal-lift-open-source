<div align="center">

<img src="public/LogoIcon.png" alt="ProposalLift" width="88" height="88">

# ProposalLift

**Self-hosted AI proposal generator for Upwork freelancers.**

Pull live job feeds from Upwork, grade them against your niche, and write proposals grounded in
your own portfolio — on your own server, with your own API keys.

</div>

---

You run this yourself. You register your own Upwork developer app, you bring your own OpenAI key,
and everything lives in a Supabase project you own. There is no shared platform account, no
subscription, and no telemetry — nothing here reports to anyone but you.

## Contents

- [What ProposalLift does](#what-proposallift-does)
- [Features](#features)
- [How it works](#how-it-works)
- [Prerequisites](#prerequisites)
- [Choose your install path](#choose-your-install-path)
- **Part 1 — Install**
  - [1. Create a Supabase project](#1-create-a-supabase-project)
  - [2. Apply the database schema](#2-apply-the-database-schema)
  - [3. Configure Supabase Auth URLs](#3-configure-supabase-auth-urls)
  - [4. Configure `.env`](#4-configure-env)
  - [5. Start the app](#5-start-the-app)
  - [6. Create your account](#6-create-your-account)
- **Part 2 — Connect**
  - [7. Register your Upwork developer app](#7-register-your-upwork-developer-app)
  - [8. Finish setup in the app](#8-finish-setup-in-the-app)
- **Part 3 — Optional**
  - [Google sign-in](#google-sign-in)
  - [Job alerts](#job-alerts)
  - [Chrome extension](#chrome-extension)
  - [Rate limiting](#rate-limiting)
  - [Deploying to a public URL](#deploying-to-a-public-url)
- **Reference**
  - [Local development](#local-development)
  - [Project structure](#project-structure)
  - [Updating](#updating)
  - [Troubleshooting](#troubleshooting)
  - [Security and your data](#security-and-your-data)
  - [FAQ](#faq)
  - [Contributing](#contributing)
  - [License](#license)

---

## What ProposalLift does

The core loop, in the order you experience it:

1. **Connect Upwork.** You register your own Upwork developer app and save the client id and secret
   in Settings, where the secret is encrypted at rest. There is no shared platform app — everyone
   brings their own.
2. **Save a filter.** A filter is a stored Upwork search — skills, budget, client country,
   experience level — plus optional **qualify criteria**: free text describing the work you
   actually want.
3. **Work the feed.** The feed pulls live results from Upwork. Some conditions run as part of the
   Upwork query; others can't be expressed in their API and are applied after the fetch —
   competition level from applicant counts, freelancer-location preference, keyword exclusion.
4. **Qualify.** With criteria set, each job is graded qualified or disqualified by an AI pass and
   badged inline, so you can skip the ones that were never a fit.
5. **Generate a proposal.** The job, your chosen **persona**, the **portfolio projects** most
   relevant to that job, an opening **hook**, and optionally a **template** and your **knowledge
   base** are assembled into a proposal that streams in as it is written.
6. **Iterate.** Refine a selected passage, regenerate just the hook, answer the client's screening
   questions, then save the proposal with its status.

Alongside that, **job alerts** can notify a webhook or email you when new matching jobs appear —
though nothing schedules them until you [set that up yourself](#job-alerts). A **Chrome extension**
puts the same generation into Upwork's own apply page.

## Features

**Job discovery**
- Live Upwork job feed, filtered by saved searches
- Post-fetch filters Upwork's API can't express: competition level, client location, excluded keywords
- AI job qualification against criteria you write in plain language
- Applied-status awareness, read from Upwork rather than guessed

**Proposal generation**
- Streaming proposal drafts built from your persona, portfolio, and hooks
- Portfolio matching — your projects are ranked against each job by similarity, not keyword search
- Screening-question answers generated alongside the proposal
- Refine a highlighted passage, or regenerate just the opening hook
- Reusable templates with variables

**Delivery**
- Chrome extension that drafts directly on Upwork's apply page
- Job alerts to an outbound webhook or email
- Proposal library with status tracking

**Your data**
- One Supabase project, owned by you, with row-level security on every table
- Upwork secrets and AI keys encrypted at rest
- No telemetry, no analytics, no error reporting

### Supporting entities

All owned by you, all feeding generation:

| Entity | Role |
|---|---|
| **Personas** | Who the proposal is written as: name, role, bio, skills, experience. Importable from a connected Upwork profile. |
| **Portfolio projects** | Past work, matched to each job at generation time. Organised by categories and tags. |
| **Hooks** | Reusable opening lines. |
| **Templates** | Proposal skeletons with variables. |
| **Profile** | Your own details, used when no persona is selected. |
| **Knowledge base** | Free-form context injected into every generation. |

## How it works

| Layer | What it is |
|---|---|
| App | Next.js 16 (App Router) with React 19 |
| UI | Tailwind CSS v4 and shadcn/ui |
| Database and auth | Your own Supabase project — Postgres with vector search |
| AI | Your own OpenAI key. Anthropic optional, as an alternative model |
| Delivery | Docker Compose |

**Docker runs only the app.** Postgres, authentication, and storage all come from the Supabase
project you create in step 1 — there is no database container, and no database connection string to
configure. You apply the schema yourself, once, by pasting it into Supabase's SQL editor. That also
means `docker compose down` destroys nothing.

## Prerequisites

**Both paths need:**

- A [Supabase](https://supabase.com) account — the free tier is enough
- An Upwork account that can register a developer app
- An [OpenAI API key](https://platform.openai.com/api-keys) with billing enabled
- Git

**To run it (Docker path):**

- [Docker Engine](https://docs.docker.com/get-docker/) with Compose v2

That's all. You do not need Node installed.

**To work on the code (local path):**

- Node 22 or newer, and the exact npm version pinned in `package.json` — see
  [The pinned npm version](#the-pinned-npm-version)
- Docker, which the local Supabase stack runs on top of

## Choose your install path

| I want to… | Path | Start at |
|---|---|---|
| Run ProposalLift for myself | Docker Compose + a hosted Supabase project | [Part 1](#1-create-a-supabase-project), below |
| Work on the code | npm + a local Supabase stack | [Local development](#local-development) |

Everything from here to the end of Part 2 assumes the Docker path.

---

# Part 1 — Install

By the end of Part 1 the app is running and you have an account.

## 1. Create a Supabase project

Sign in at [supabase.com](https://supabase.com) and create a project. Pick a region near you and
save the database password somewhere — you won't need it for this app, but Supabase will ask for it
later for unrelated things.

Wait for provisioning to finish before the next step.

> Free-tier projects pause after a stretch of inactivity. Opening the dashboard wakes them again.

## 2. Apply the database schema

In your Supabase dashboard open **SQL Editor → New query**. Copy the **entire** contents of:

```
supabase/migrations/20260828000000_baseline.sql
```

Paste it into the editor and click **Run**. It is one file and it creates everything: 18 tables, 6
functions, vector search, and row-level security on every table.

**Paste the whole file.** Running it in pieces leaves the schema half-built, and the app gives you
no useful error when that happens.

**Verify before moving on.** Open the **Table Editor** — you should see **18 tables**. If you see
fewer, or none, the query did not complete. Check the SQL editor's output for the error. The script
is not written to be re-run against a partially built schema, so the cleanest fix is to reset the
database (**Project Settings → General → Reset database**) and paste it again from the top.

## 3. Configure Supabase Auth URLs

Supabase sends the confirmation and password-reset emails, and it will only send people back to
URLs you have allowed. Skip this and those links point at the wrong host.

In the dashboard, open **Authentication → URL Configuration**:

- **Site URL** — your app's address. `http://localhost:3000` while you're trying it out.
- **Redirect URLs** — add all three, or add `http://localhost:3000/**` to cover them at once:

  ```
  http://localhost:3000/auth/confirm-callback
  http://localhost:3000/api/auth/reset-password
  http://localhost:3000/auth/callback
  ```

  The third is only used by Google sign-in, but adding it now saves a trip back.

**About confirmation email.** Hosted Supabase projects have email confirmation **on** by default,
so you will have to click a link before you can sign in. Supabase's built-in mail sender is
test-grade and heavily rate limited — for anything beyond trying it out, configure your own SMTP
under **Authentication → Emails**. For a single-user instance, turning confirmations off is a
reasonable alternative.

> Resend is **not** used for authentication email. `RESEND_API_KEY` only sends
> [job alerts](#job-alerts).

## 4. Configure `.env`

```bash
git clone https://github.com/developios-git/proposal-lift-open-source.git
cd proposal-lift-open-source
cp .env.example .env
```

`.env.example` is heavily commented and worth reading. The tables below are the summary.

### Required

The app will not work correctly without all six.

| Variable | Where it comes from | What breaks without it |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase **Project Settings → API**, "Project URL" | Nothing connects. This value is also compiled into the page's security policy, so if it's wrong **at build time** login fails silently with only a console error. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Same page, "Publishable key" | Nothing connects. |
| `SUPABASE_SECRET_KEY` | Same page, "Secret key" | Signup and email confirmation break. Also required for [extension](#chrome-extension) sign-in. Server-side only — never exposed to the browser. |
| `UPWORK_CREDENTIALS_ENCRYPTION_KEY` | Generate one, below | Saving Upwork credentials fails outright. |
| `AI_KEYS_ENCRYPTION_KEY` | Generate a **second, different** one | Saving an AI key fails outright. |
| `UPWORK_REDIRECT_URI` | You choose it; must match Upwork exactly | Connecting Upwork fails. Local default: `http://localhost:3000/auth/upwork/callback` |

There is no database connection string. The app talks to Supabase over its API, and you already
applied the schema.

### Generating the two encryption keys

Each is 64 hexadecimal characters — 32 random bytes. Use two **different** values so either can be
rotated without touching the other.

```bash
openssl rand -hex 32
```

On Windows without `openssl` (it ships with Git Bash), use PowerShell:

```powershell
$b = [byte[]]::new(32)
[System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b)
($b | ForEach-Object { '{0:x2}' -f $_ }) -join ''
```

> Use a cryptographic generator, not `Get-Random` — these keys protect your Upwork secret and your
> API keys.

**Set them once and keep them.** Changing either makes everything already encrypted with it
unreadable, and every account has to re-enter the affected credentials by hand.

### Optional

| Variable | What it does |
|---|---|
| `NEXT_PUBLIC_APP_URL` | Your app's public address. Ends up inside confirmation and reset emails, so set it before you deploy. Defaults to `http://localhost:3000`. |
| `PORT` | Which **host** port maps to the container. See the note below. |
| `GOOGLE_AUTH_ENABLED` | Shows the Google sign-in button. See [Google sign-in](#google-sign-in). |
| `RESEND_API_KEY` | Sends job-alert email. Not used for authentication. |
| `RESEND_FROM` | The address alerts are sent from. Both must be set, or email is skipped. |
| `CRON_SECRET` | Guards the job-alerts endpoint. See [Job alerts](#job-alerts). |
| `PUBLISHED_EXTENSION_ID` | The extension's Web Store id. Already filled in by `.env.example`. See [Chrome extension](#chrome-extension). |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | Optional rate limiting. See [Rate limiting](#rate-limiting). |

### Two things that catch people out

> **Values starting with `NEXT_PUBLIC_` are compiled into the app, not read at runtime.** Change one
> and you must rebuild — `docker compose up --build`. A plain `up` reuses the old image with the old
> value baked in, and nothing tells you. Everything else is read at runtime and only needs a restart.

> **`PORT` changes the host port only.** The container always listens on 3000. If you change it, you
> must also change `NEXT_PUBLIC_APP_URL` and `UPWORK_REDIRECT_URI` to match, or Upwork's OAuth
> handshake and every email link will point at a port nothing is serving.

## 5. Start the app

```bash
docker compose up --build
```

The first build takes a few minutes. When it's done the app is on **http://localhost:3000**.

**You'll know it worked** when opening that address lands you on the login page — `/` is not a page
in this build, it's a redirect.

Useful afterwards:

```bash
docker compose up -d        # run in the background
docker compose logs -f app  # follow the logs
docker compose down         # stop
```

`down` stops the container and nothing else. Your data is in Supabase, untouched.

## 6. Create your account

Open **http://localhost:3000**, click through to **Sign up**, and register with an email address
and a password of at least 6 characters. (A **Continue with Google** button appears only if you
enable [Google sign-in](#google-sign-in).)

If you left email confirmation on in [step 3](#3-configure-supabase-auth-urls), check your inbox and
click the link before signing in.

**Where you land is deliberate**, and it isn't a bug if it isn't the dashboard:

- Email not confirmed yet → `/verify`
- Confirmed, but setup unfinished → `/getting-started`
- Everything ready → `/dashboard`

---

# Part 2 — Connect

The app runs, but it can't see Upwork yet. This part fixes that.

## 7. Register your Upwork developer app

There is no shared ProposalLift app on Upwork's side. Your instance talks to Upwork as *your*
application, under *your* API quota, using credentials only you hold.

Go to **[upwork.com/developer/keys](https://www.upwork.com/developer/keys/)** and create a new key.

### Form values

| Field | Value |
|---|---|
| Title | `ProposalLift` |
| Project type | `Web` |
| Callback / Redirect URL | Exactly your `UPWORK_REDIRECT_URI` — `http://localhost:3000/auth/upwork/callback` for a local install |
| Expected API usage | `100 – 500` for light use, `500+` if you work the feed heavily |
| Key rotation period | `12 months` |

For the description field, Settings → Integrations in the running app shows a ready-made paragraph
with a copy button, along with the exact callback URL your instance expects.

### Permissions to enable

Tick all five:

- [ ] **Read marketplace Job Postings** — powers the job feed search
- [ ] **Client Proposals - Read And Write Access** — reads your submitted proposals
- [ ] **Freelancer Profile - Read And Write Access** — reads your freelancer identity
- [ ] **Talent Profile - Read And Write Access public** — imports your portfolio and personas
- [ ] **Common Entities - Read-Only Access** — budget, location and organization fields

**Leave these unticked:** Contract, Messaging, Offer, Payments, TimeSheet, Transaction. The app
never uses them.

> Permissions come entirely from this form — the app doesn't request them per sign-in. That means a
> missed tick doesn't fail when you connect; it fails later, as a permission error while loading the
> feed. It's worth checking twice now.

> **The callback URL must match exactly** — scheme, host, port and path. A mismatch fails at
> Upwork's end, before your app ever sees the request. If you later move to a real domain, you must
> update it in **both** places: here, and `UPWORK_REDIRECT_URI` in `.env`. See
> [Deploying to a public URL](#deploying-to-a-public-url).

Approval can take a few days. Once approved, copy the **Client ID** and **Client Secret**.

## 8. Finish setup in the app

Sign in and open **Get Started** in the sidebar. It tracks nine steps, in this order:

**Required — nothing works until these are done**

1. **Add your OpenAI API key** — *Settings → AI Models*. OpenAI is required; Anthropic is optional
   and adds Claude as an alternative writing model. The key is checked against the provider when you
   save it, and encrypted at rest.
2. **Add Upwork API Client ID & Secret** — *Settings → Integrations*. Paste the two values from
   step 7. The secret must be at least 8 characters.
3. **Connect Upwork** — *Settings → Integrations*. Click **Connect Upwork Account**, authorise on
   Upwork, and you'll land back in Settings. The button stays disabled until step 2 is saved.

**Recommended — this is what makes the output good**

4. **Create Filters** — *Filters*. Your first saved search. Add qualify criteria to turn on AI
   grading of each job.
5. **Create Personas** — *Personas*. Who proposals are written as. Can be imported from the Upwork
   profile you just connected.
6. **Add Knowledge Base** — *Settings → Knowledge Base*. Free-form context added to every
   generation.
7. **Add Portfolio** — *Portfolios*. **Blocked until step 1.** Saving a project generates an
   embedding with your own OpenAI key, and that embedding is how the project gets matched to a job.
   A project saved without a key would be a row that never reaches a proposal, so the app asks for
   the key first rather than letting you fill in a form that can't be saved.
8. **Create Templates** — *Templates*. Proposal skeletons with variables.
9. **Set Up Hooks** — *Hooks*. Reusable opening lines.

### Generate your first proposal

Open **Filters**, click into the filter you made, and the live feed loads. Pick a job, hit
**Generate**, and the proposal streams in. From there you can refine a passage, regenerate the hook,
or answer the screening questions before saving it.

---

# Part 3 — Optional

## Google sign-in

Enable the provider in Supabase **first** — the app never sees your Google client id or secret,
Supabase holds them.

1. Supabase dashboard → **Authentication → Providers → Google**, and configure it there.
2. Make sure `{your app URL}/auth/callback` is in your redirect allowlist
   ([step 3](#3-configure-supabase-auth-urls)).
3. Set `GOOGLE_AUTH_ENABLED=true` in `.env`.
4. Restart: `docker compose restart app`.

Only `true` and `1` count. This is not a `NEXT_PUBLIC_` variable, so a **restart is enough** — no
rebuild.

Left unset, the button simply never renders, and email and password is the only way in.

## Job alerts

A filter can notify a webhook, or email you, when new matching jobs appear.

Three things to know before you start:

- **Nothing schedules this out of the box.** The tables and the UI exist, but no alert fires until
  you set up a scheduler yourself.
- **It only works on a publicly reachable deployment.** The scheduler runs inside Supabase's
  infrastructure and cannot reach `localhost`.
- You need `CRON_SECRET` set. `RESEND_API_KEY` and `RESEND_FROM` are needed only for the email half
  — webhooks deliver without them.

**→ [docs/cron.md](docs/cron.md)** has the SQL, the verification queries, and alternatives if you'd
rather schedule it somewhere other than Supabase.

## Chrome extension

The extension drafts proposals on Upwork's own apply page — it streams a proposal into Upwork's
text box, answers the screening questions, and rewrites passages you select, without you leaving the
page.

It has **no server address and no Supabase configuration compiled in**. You type your own domain
into it on first run, and it talks to nothing else. Sign-in goes through your own site's login page,
so no password ever enters the extension.

It requires `SUPABASE_SECRET_KEY` to be set, because signing in mints a session through Supabase's
admin API.

It also requires your server to recognise the extension, which it does by id. Every install from
the Web Store carries the same one:

```bash
# .env
PUBLISHED_EXTENSION_ID=pmbimligkdnacbjijogfpejadehdihpk
```

`.env.example` ships with that filled in, so a `.env` copied from it needs nothing further — set it
by hand only if you wrote your own. Leave it unset and your server turns the extension away: the
panel reports that your instance is running but is not accepting this extension, and sign-in never
completes.

> The extension never clicks Upwork's buttons and never spends connects. It fills the box; you read
> it and submit it yourself.

**The step-by-step lives in the app.** Sign in and open **Extension** in the sidebar: it walks
through installing it, pointing it at this instance, signing in, and drafting on Upwork. It is
there rather than here because it can hand you your instance's own address, and because it
checks your account for the key and the persona the panel will demand — so you find out
whether it will work before you install anything, not after.

**→ [docs/extension.md](docs/extension.md)** for how it works underneath: the sign-in
handoff, the CORS and redirect-URI rules, and the API surface.

## Rate limiting

Optional. Unconfigured, the app works normally and requests simply aren't throttled.

To enable it, create an [Upstash Redis](https://upstash.com) database and set both
`UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`, then restart. No rebuild needed.

Worth doing if your instance is reachable from the internet, since signup and password reset are
open to anyone who can load the page.

## Deploying to a public URL

This isn't a guide to any particular host — put the container behind whatever reverse proxy you
like. It's the change-list, because moving off `localhost` half-way is the most common way a
self-hosted install breaks, and every item below fails silently and separately.

1. **Point DNS at your server and terminate TLS** in front of the container.
2. **Update `.env`**: set `NEXT_PUBLIC_APP_URL` and `UPWORK_REDIRECT_URI` to the new origin.
3. **Update the Upwork developer app** — the Callback URL must match the new
   `UPWORK_REDIRECT_URI` exactly ([step 7](#7-register-your-upwork-developer-app)).
4. **Update Supabase Auth** — Site URL and the redirect allowlist
   ([step 3](#3-configure-supabase-auth-urls)).
5. **Rebuild**: `docker compose up --build`. You changed a `NEXT_PUBLIC_` value, so a plain restart
   would keep serving the old one.
6. **Now** you can set up [job alerts](#job-alerts), which needed a public address all along.

Also worth doing at this point: configure real SMTP in Supabase, and turn on
[rate limiting](#rate-limiting).

---

# Reference

## Local development

Working on the code, you don't need Docker Compose and you don't paste SQL by hand. The local
Supabase stack applies `supabase/migrations/` for you.

```bash
git clone https://github.com/developios-git/proposal-lift-open-source.git
cd proposal-lift-open-source
npm install
npm run db:start     # starts local Supabase (Docker under the hood)
```

**`npm run db:start` prints the local API URL and keys.** Copy them into `.env` now — the next
command needs them:

```bash
cp .env.example .env
# paste the printed values into NEXT_PUBLIC_SUPABASE_URL,
# NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY and SUPABASE_SECRET_KEY
```

Your local `.env` still needs both encryption keys and `UPWORK_REDIRECT_URI` — see
[step 4](#4-configure-env). The defaults in `.env.example` already point at `localhost:3000`.

```bash
npm run db:reset     # applies supabase/migrations/ to the local stack
npm run dev
```

**What the local stack gives you:**

| | |
|---|---|
| App | http://localhost:3000 |
| Supabase Studio | http://localhost:54323 |
| API | http://localhost:54321 |
| Postgres | `localhost:54322` |
| Mail catcher | http://localhost:54324 — confirmation and reset emails land here, never delivered |

Signup is **instant** locally: email confirmation is off in `supabase/config.toml`, so you skip the
verify step entirely.

> The local config sets its site URL to `127.0.0.1`. Pick either `localhost` or `127.0.0.1` and use
> it consistently — the two are different origins as far as cookies and OAuth are concerned.

### Commands

| Command | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm start` | Serve a production build |
| `npm run lint` | ESLint |
| `npm test` | Run the test suite once |
| `npm run test:watch` | Tests in watch mode |
| `npm run db:start` | Start the local Supabase stack |
| `npm run db:stop` | Stop it |
| `npm run db:reset` | Drop and re-apply all migrations locally |
| `npm run db:push` | Push migrations to a linked project |
| `npm run db:types` | Regenerate `src/types/database.ts` |

`src/types/database.ts` is **generated**. Don't hand-edit it — change the schema, then run
`npm run db:types`.

The Supabase CLI runs through `npx supabase@<pinned version>` rather than as a dependency: it pulls
in eight per-platform binaries the app never uses, and those make the lockfile sensitive to which
npm version installed it.

### The pinned npm version

npm is pinned to one exact version, in `devEngines.packageManager` in `package.json`. npm refuses
`install`, `ci` and `run` under any other version, with `EBADDEVENGINES`. Install the pinned one
(the command works in bash and PowerShell):

```bash
npm install -g npm@$(node -p "require('./package.json').devEngines.packageManager.version")
```

The pin exists because npm releases disagree about optional dependencies: a lockfile written by one
version can fail `npm ci` under another — even between two 11.x releases. The Docker image reads the
same field, so your machine and the image always run the same npm.

**To move to a newer npm**, change it in that one place and regenerate the lockfile:

```bash
# 1. edit devEngines.packageManager.version in package.json, then:
npm install -g npm@<new version>
npm install
# 2. commit package.json and package-lock.json together
```

CI (`.github/workflows/lockfile.yml`) runs the image's `npm ci` on every change to these files, so a
lockfile from a different npm fails there rather than on someone's `docker compose up --build`.

## Project structure

```
src/
  app/                 Routes (App Router)
    (dashboard)/       Signed-in surfaces: settings, portfolios, personas, …
    api/               Route handlers
    auth/              Sign-in, OAuth and email-confirmation callbacks
  components/
    ui/                shadcn/ui primitives
  lib/
    ai/                Model calls, per-user key resolution
    upwork/            Upwork GraphQL client and OAuth
    auth/              Route access rules
    extension/         CORS and redirect-URI rules for the Chrome extension
    onboarding/        The Get Started checklist
    rate-limit/        Optional Upstash limiters
  types/database.ts    Generated — do not edit
supabase/migrations/   The schema
docs/                  Cron and extension guides
Dockerfile             Production image
docker-compose.yml     How it runs
```

## Updating

```bash
git pull
docker compose up --build
```

**This does not touch your database.** If the pull brought new files into `supabase/migrations/`,
apply each one **newer than your install** the same way as [step 2](#2-apply-the-database-schema) —
paste it into the SQL editor and run it, oldest first. Migrations are named by timestamp, so sorting
by filename gives the right order.

> **Never re-run the baseline against a database that's already live.** It builds the schema from
> scratch. Only the incremental migrations that came after your install are safe to apply.

Locally, `npm install && npm run db:reset` does the same thing — but `db:reset` is destructive and
only ever runs against the local stack.

## Troubleshooting

**Pages error with "relation does not exist".**
[Step 2](#2-apply-the-database-schema) was skipped or ran only partway. Check the Table Editor for
18 tables and re-apply the schema.

**Signup succeeds, then everything is broken.**
The signup trigger didn't get created, so your account has no profile row. It lives near the end of
the baseline migration — a paste that was truncated mid-file is the usual cause. Re-apply the full
schema.

**Login fails silently.**
Check the browser console for a Content-Security-Policy violation. It means
`NEXT_PUBLIC_SUPABASE_URL` was empty or wrong **at build time**. Fix `.env` and rebuild with
`docker compose up --build` — a plain `up` reuses the old image.

**Changed `.env` and nothing happened.**
`NEXT_PUBLIC_` values are compiled in and need `--build`. Everything else needs only a restart.

**Confirmation emails never arrive, or link to localhost.**
Check the redirect allowlist in [step 3](#3-configure-supabase-auth-urls) and `NEXT_PUBLIC_APP_URL`
— and remember that one is compiled in, so it needs a rebuild. Supabase's built-in sender is also
rate limited; configure SMTP for real use.

**Saving Upwork credentials fails.**
`UPWORK_CREDENTIALS_ENCRYPTION_KEY` is missing or malformed. It must be 64 hex characters. Set it
and restart.

**Saving an AI key fails with "cannot store API keys securely".**
Same problem, different key: `AI_KEYS_ENCRYPTION_KEY`.

**Upwork OAuth errors before it comes back.**
The Callback URL registered on your Upwork app doesn't match `UPWORK_REDIRECT_URI` exactly. Compare
scheme, host, port and path.

**The feed loads but errors about permissions.**
A permission wasn't ticked when you registered the Upwork app. Compare against
[step 7](#7-register-your-upwork-developer-app) — permissions come from the registration form, so
you'll need to update the app on Upwork's side.

**"Add your OpenAI API key" everywhere.**
Settings → AI Models. There is no shared key on this instance, by design.

**Can't create a portfolio project.**
Expected, until an OpenAI key is saved. Projects are embedded on save, and that's what matches them
to jobs.

**Job alerts never fire.**
Nothing schedules them out of the box. See [Job alerts](#job-alerts).

**`npm ci` fails with `Missing: @emnapi/runtime from lock file`.**
`package-lock.json` was written by a different npm version than the one reading it. Install the
[pinned npm](#the-pinned-npm-version), run `npm install`, and commit the updated lockfile.

**npm fails with `EBADDEVENGINES`.**
Your npm isn't the version pinned in `package.json`. The error prints the required version; install
it with the command under [The pinned npm version](#the-pinned-npm-version).

For extension problems see **Extension** in the running app, or
[docs/extension.md](docs/extension.md); for scheduling see [docs/cron.md](docs/cron.md).

## Security and your data

- **Everything lives in your Supabase project.** Row-level security is enabled on all 18 tables and
  scoped to the signed-in account. Nobody with an account on your instance can read anyone else's
  rows.
- **Secrets are encrypted at rest.** Your Upwork client secret and every AI key are encrypted under
  two separate keys, so either can be rotated without touching the other. Rotating one makes
  everything encrypted under it unreadable, and those credentials must be entered again.
- **Job data is never stored.** The feed is read live from Upwork on every load. Upwork's terms
  forbid caching it, so there is no jobs table to leak.
- **No telemetry.** No analytics, no session recording, no error reporting. Nothing phones home.

> **Signup is open.** There is no invite-only mode and no admin approval. If your instance is
> reachable from the internet, anyone who finds it can create an account — they won't see your data,
> but they will be able to use your instance. Put it behind authentication at the proxy, or keep it
> private, if that matters to you.

Found a vulnerability? Please report it privately rather than opening an issue — see
[SECURITY.md](SECURITY.md), which also lists what is in scope and which behaviours are deliberate.

## FAQ

**What does it cost to run?**
The software is free. You pay OpenAI for what you generate, and Supabase's free tier covers a
single user comfortably. Hosting is whatever your server costs.

**Why do I have to register my own Upwork app?**
There is no shared platform app to connect to. It also means the API quota is yours, and your
Upwork credentials never pass through anyone else's server.

**Can several people share one instance?**
Yes — multiple accounts work, and they share nothing at all. There are no teams, shared personas, or
shared portfolios; each account is fully separate.

**Can I deploy it to Vercel?**
Docker Compose is the only path that's supported and tested. Some scaffolding for a Vercel deploy
survives in the code, but you'd be working it out yourself.

**Does it apply to jobs for me, or spend connects?**
No. It writes drafts. Submitting is always something you do by hand, on Upwork.

**What happens if I change an encryption key?**
Everything encrypted under the old value becomes unreadable. For
`UPWORK_CREDENTIALS_ENCRYPTION_KEY` that means re-entering Upwork credentials; for
`AI_KEYS_ENCRYPTION_KEY`, re-entering API keys. Nothing else is affected, and the two are
independent.

## Contributing

Setup is under [Local development](#local-development).

Before opening a pull request:

```bash
npm run lint
npm test
```

Schema changes go in a **new** migration file rather than edits to the baseline, and should be
written so re-running them is harmless. After changing the schema, regenerate the types with
`npm run db:types` and commit the result.

## License

Copyright (C) 2026 Developios.

Licensed under the [GNU Affero General Public License v3.0](LICENSE).

In short: you can run, modify and redistribute this freely, but if you run a modified version as a
network service, you must offer its source to your users under the same license.
