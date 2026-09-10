# Security Policy

ProposalLift is self-hosted. Every instance is a separate deployment, owned and operated by the
person running it, holding that person's Upwork credentials and AI keys. That shapes everything
below: a vulnerability here is a bug that puts *other people's* instances at risk, which is a
different thing from a problem with any one deployment.

## Supported versions

There are no tagged releases yet. **Only the latest commit on the default branch is supported.**

If you are self-hosting, updating means pulling the latest code and applying any new migrations in
`supabase/migrations/`. There is no backporting to older commits.

## Reporting a vulnerability

**Please do not open a public issue for a security problem.**

Report it privately through GitHub: go to the **Security** tab on this repository and choose
**Report a vulnerability**. That opens a private advisory only the maintainers can see, and it lets
us discuss and fix the issue before any of it is public.

Useful things to include, if you have them:

- What an attacker can do, and what they need to start (an account on the instance? a link a
  signed-in user clicks? nothing at all?)
- The affected route, file, or migration
- Steps to reproduce, or a proof of concept
- Whether it needs the Chrome extension, or affects the web app alone

This is a small project with no dedicated security team, so responses are best effort rather than
guaranteed within a fixed window. You will get an acknowledgement, and we will tell you honestly
whether and when a fix is coming.

Please give us a reasonable chance to ship a fix before disclosing publicly. If you would like
credit in the advisory, say so and we will include it.

## Scope

**In scope** — anything in this repository that could compromise an instance other than your own:

- Authentication and session handling, including the extension sign-in handoff
- Row-level security policies in `supabase/migrations/` that let one account reach another's rows
- The encryption of Upwork credentials and AI keys at rest
- Server-side request forgery, injection, or path traversal in the API routes
- Anything that leaks an API key, an OAuth token, or a session to a party that should not have it

**Out of scope** — real problems, but not ones a change to this code can fix:

- Misconfiguration of *your own* deployment: a leaked `SUPABASE_SECRET_KEY`, a publicly readable
  `.env`, an unset encryption key, a Supabase project with RLS disabled by hand
- Vulnerabilities in Supabase, Upwork, OpenAI, Anthropic, Vercel, or any other third party — report
  those to the vendor
- **Open signup.** Anyone who can reach your instance can create an account. This is documented
  behaviour, not a flaw; see "Security and your data" in the README. They cannot read your rows,
  but they can use your instance. Put it behind a proxy or keep it private if that matters.
- Cost or quota exhaustion of your own AI or Upwork keys by users you gave accounts to

## Already known, and deliberate

These look like findings and are not. Each is a decision with a reason; if you think the reasoning
is wrong, that is a discussion worth having, but it is not an undisclosed vulnerability.

- **`extension_auth_handoffs` has RLS enabled and zero policies.** Every access path goes through
  the service role, which bypasses RLS. Clients must never read or write handoff codes directly, so
  a policy would widen access for no reason.
- **`upwork_api_usage`, `filter_webhook_state` and `webhook_delivery_log` are SELECT-only.** Their
  writes belong to a `SECURITY DEFINER` function or the cron job, not to the client.
- **The extension `redirect_uri` check is exact string equality.** No parsing, no normalisation, no
  prefix or suffix matching. This is intentional and is the security boundary of the whole extension
  sign-in flow — widening it would turn the consent page into a session-minting oracle for any
  origin.
- **There is no platform API key.** The app never falls back to a server-side `OPENAI_API_KEY` or
  `ANTHROPIC_API_KEY`; each user's own key is the only source.
- **The CSP `connect-src` is derived from `NEXT_PUBLIC_SUPABASE_URL` at build time** rather than
  hardcoded, so that each self-hoster's browser can reach their own Supabase project.

## If your own instance is compromised

Nothing here is a report to us — it is what to do on your own deployment.

1. **Rotate the two encryption keys.** `UPWORK_CREDENTIALS_ENCRYPTION_KEY` and
   `AI_KEYS_ENCRYPTION_KEY` are independent, so either can be rotated alone. Rotating one makes
   everything encrypted under it unreadable, so those credentials have to be entered again.
2. **Revoke and reissue your Upwork developer app secret** at <https://www.upwork.com/developer/keys/>,
   then save the new one in Settings.
3. **Revoke your AI provider keys** at the provider and save replacements in Settings.
4. **Rotate your Supabase keys** (`SUPABASE_SECRET_KEY` and the publishable key) from the Supabase
   dashboard, and update your environment. This signs out every session.
5. **Review `upwork_api_usage`** for calls you do not recognise.

## A note on forks

This project is licensed under AGPL-3.0. If you run a modified version as a network service, you
must offer its source to your users. A fork that changes any of the security boundaries listed above
is a different piece of software from this one, and a report about a fork should go to whoever
maintains it.
