# The Chrome extension

The extension drafts proposals on Upwork job pages against **your own** ProposalLift server.
Unlike the commercial build, it has no server address compiled into it: you type yours once, and
it talks to nothing else for the rest of its life.

Set a server once, sign in on your own site, then draft proposals directly on Upwork's apply page:
pick a persona, stream a draft into Upwork's own proposal box, have screening questions answered,
and select any passage to rewrite it in place.

---

## How it differs from the commercial extension

| | Commercial | Self-hosted |
|---|---|---|
| Server address | compiled in at build time, in six places | typed by the user, stored in `chrome.storage.sync` |
| Supabase URL + anon key | compiled in | **not present at all** — the server refreshes tokens |
| Sign-in | email/password inside the extension | on your own site, in a real browser window |
| Session handoff | `externally_connectable` (pins one origin) | `chrome.identity.launchWebAuthFlow` |
| Host permissions | the app origin + the Supabase project | **none** |

That last row is worth dwelling on. The extension asks for no host permissions, so Chrome never
shows anyone a "read and change your data on your-domain.com" prompt. Cross-origin calls work
because your server opts in through CORS.

---

## Using it

The step-by-step — install it, point it at your server, sign in, then draft a proposal on
Upwork — is **in the app itself**, under **Extension** in the sidebar. It lives there rather
than here because it hands you your own instance's address, and because it reads your account
to tell you whether the API key and persona the panel demands are actually in place. A file in
this repository can do neither.

The rest of this document is how that works underneath, and how to build an unpacked copy.

---

## The extension's id

The store assigned the extension a permanent id on first upload, and every install carries it:

```bash
# .env
PUBLISHED_EXTENSION_ID=pmbimligkdnacbjijogfpejadehdihpk
```

`.env.example` ships with that value, so a `.env` copied from it already recognises the extension.

It is configuration rather than a constant in the source because that is how a self-hoster expects
to set things — an entry in `.env`, or a variable in a host's dashboard — and because changing a
compiled-in value would mean editing TypeScript and rebuilding. It is identical on every install
all the same, which is why the file arrives pre-filled instead of blank.

**Don't leave it unset.** Both `extensionCorsHeaders` and `isAllowedExtensionRedirectUri` read it,
and with nothing configured `allowedExtensionIds()` returns an empty list — so the server turns the
store extension away. The panel reports “running but is not accepting this extension” and sign-in
never completes. Nothing in the schema or the logs explains why.

It also puts the install button on the in-app **Extension** page. While it is unset that page still
describes the install, but links nowhere.

---

## Running a development build

The extension's client source is **not in this repository**. It is developed separately and
distributed through the Chrome Web Store; what lives here is the server half — the sign-in handoff,
the CORS and redirect-URI rules, and the API surface documented below.

You still need a way to point a build at a local server, whether you are working on the extension
itself or checking a server change against it. For that you need the app running, Chrome, and an
unpacked build produced from the extension's own repository.

### 1. Start the app

```bash
npm run dev
```

`SUPABASE_SECRET_KEY` must be set in `.env`. Extension sign-in mints a session through Supabase's
admin API, so an instance without it runs the web app fine but cannot connect the extension.

### 2. Load the extension

`chrome://extensions` → turn on **Developer mode** → **Load unpacked** → select the built extension
directory from its own repository.

Nothing opens on install. Click the extension's toolbar icon to reach the setup screen.

### 3. Tell the server which extension this is

Unpacked builds get a Chrome-generated id rather than the store one, and your server has no way to
guess it. Copy the id shown under the extension on `chrome://extensions`, then put it in the same
variable, replacing the store id:

```bash
# .env
PUBLISHED_EXTENSION_ID=abcdefghijklmnopabcdefghijklmnop
```

It is one variable because it answers one question — which extension is ours. Set it to the
unpacked id and this instance trusts that build *instead of* the store one, which is what you
want while developing. It accepts a comma-separated list if you need both.

`.env` is the file Docker Compose reads, so it works for both paths. Running natively with
`next dev`, `.env.local` works too and takes precedence.

Restart the dev server.

> You can skip this for a first look — in `next dev` with nothing configured, the server accepts
> any extension id and logs a warning. That escape hatch is disabled in production builds, so set
> the id before you test anything you intend to trust.

### 4. Connect

Click the extension's toolbar icon:

1. Enter `http://localhost:3000` and press **Connect**. The extension probes
   `GET /api/extension/session` and expects a 401 with a JSON body — that one request tells
   "wrong address" apart from "not a ProposalLift server" apart from "server won't accept this
   extension".
2. Press **Sign in**. A window opens on your own site. If you are already signed in there it goes
   straight to a consent screen; otherwise you log in first, in that window.
3. Press **Connect** on the consent screen. The window closes and the popup shows your email.

---

## What the sign-in actually does

```
popup [Sign in]
  -> chrome.identity.launchWebAuthFlow opens
     http://localhost:3000/extension/handoff?redirect_uri=https://<ext-id>.chromiumapp.org/
  -> not signed in? -> /login?next=... -> log in -> back to the handoff page
  -> handoff page checks redirect_uri is EXACTLY https://<ext-id>.chromiumapp.org/
  -> you press Connect
  -> POST /api/extension/handoff/create   (cookie auth) -> one-time code, 120s TTL
  -> 302 https://<ext-id>.chromiumapp.org/?code=<id>
  -> Chrome intercepts its own sentinel URL, closes the window, hands the code to the worker
  -> POST /api/extension/handoff/redeem   -> access + refresh token
  -> chrome.storage.local["ups_auth_session"]
```

Nothing is ever served from `chromiumapp.org`. It is a URL Chrome watches for, which is what lets
this work against a domain that appears nowhere in the extension's manifest.

Two things carry the security of this flow:

- **The `redirect_uri` check is exact string equality.** A prefix or suffix test would let
  `?redirect_uri=https://evil.example/` make a signed-in user's browser mint a session and hand it
  to someone else.
- **The consent screen requires a click.** A page that minted a credential on load would be
  CSRF-shaped: anything able to make your browser visit a URL could make it mint a session.

---

## On the Upwork apply page

The panel injects bottom-right. Collapsed, it is a single button whose label is the next thing you
need to do — set a server, sign in, add an API key, choose a persona, or **Write with AI**.

Generation streams straight into Upwork's proposal box as it arrives. Screening questions on the
page are detected automatically; tick the checkbox and their answers are filled in too, matched to
the textareas in page order.

Select any text in the proposal box and a small toolbar appears: **Bold** applies unicode bold
(Ctrl+B works too), and **Ask ProposalLift** rewrites just that passage against an instruction you
type. You always submit manually — nothing here clicks Upwork's buttons or spends connects.

## Signing out vs changing server

- **Sign out** clears the session and keeps the address.
- **Change** opens the setup screen without touching anything, so you can look and back out with
  **Cancel**. Nothing is written until the new address answers.
- Connecting to a **different** address clears the session. Re-entering the same one does not.

**A session is bound to the server that issued it.** That matters because the two are stored
differently on purpose: the address lives in `chrome.storage.sync` so it follows you between
machines, while the session lives in `chrome.storage.local` so it does not. Changing servers on one
machine therefore reaches your others as a bare address change, with a session beside it that a
different server minted.

Rather than trust the button that made the change, the extension records which server issued each
session and refuses to use it anywhere else — clearing it and asking you to sign in again. So
pointing the extension at a new server signs you out of the old one **everywhere**, including on a
machine you have not touched. That is the intended behaviour: the alternative is one server's
refresh token being handed to another.

---

## API surface

| Method | Path | Auth |
|---|---|---|
| `GET` | `/api/extension/session` | Bearer — also the server-discovery probe |
| `GET` | `/api/extension/catalog` | Bearer — personas, templates, hooks, `hasOpenAiKey` |
| `POST` | `/api/extension/handoff/create` | cookie only, deliberately not Bearer |
| `POST` | `/api/extension/handoff/redeem` | none — the one-time code is the credential |
| `POST` | `/api/extension/token/refresh` | the refresh token in the body |

`handoff/create` refuses Bearer on purpose. A handoff redeems into a long-lived *refresh* token, so
accepting a short-lived access token there would let a stolen one be upgraded into durable access.

---

## Troubleshooting

**"is reachable, but it is not a ProposalLift server"** — the address resolves and something
answered, but not our API. Check for a typo, or a proxy in front of the app.

**"running but is not accepting this extension"** — CORS rejected the call. The server does not
recognise this extension id: set `PUBLISHED_EXTENSION_ID` and restart.

**"This link did not come from a recognised ProposalLift extension"** — the consent page rejected
the `redirect_uri`. Same cause: the server does not know this extension's id.

**Sign-in window opens and immediately closes** — you cancelled, or the handoff expired. Codes live
120 seconds.

**Nothing appears on Upwork job pages** — the panel only injects on the *apply* page, whose URL
starts with `/nx/proposals/job/~.../apply`. A job's public listing page is not enough. If you
are on the right page, check that the extension has been rebuilt and
reloaded.

**"Add your OpenAI key"** — generation uses your own key, saved in Settings on your server. There
is no platform key to fall back on.

**"No persona ≥70% complete"** — a persona needs enough filled in to be usable: a name, a bio,
some skills and one profile link gets you there.
