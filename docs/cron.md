# Scheduling job alerts

Job alerts do not fire out of the box. The tables, the settings UI, and the endpoint that does the
work all exist, but **nothing calls that endpoint** until you schedule it yourself.

This is deliberate. The scheduler runs inside Supabase's infrastructure and can only reach an app
on a public address, so a snippet that assumed one would be wrong for everybody running on
localhost.

---

## What you are scheduling

`POST /api/cron/job-notifications`, with the header:

```
Authorization: Bearer <your CRON_SECRET>
```

Each run walks every enabled filter that has at least one active webhook, fetches matching jobs
from Upwork using that user's own credentials, and delivers anything new. It skips users who are
currently online (they are already looking at the feed), filters checked in the last three minutes,
and anyone whose Upwork API quota is nearly spent.

Every filter's fetch counts against that user's own Upwork quota, so a schedule far tighter than
your filters actually change will burn the quota the job feed needs.

---

## Before you start

1. **Your app must be reachable from the internet.** A `localhost` or LAN address will not work —
   Supabase runs the schedule on its own servers. Deploy first, then come back to this.
2. **Set `CRON_SECRET`** to a long random string in your app's environment and restart the app.
   Without it the endpoint returns `500`, and with the wrong value `401`.

   ```bash
   openssl rand -hex 32
   ```

3. **Set `RESEND_API_KEY` and `RESEND_FROM`** if you want the email half of alerts. Webhooks work
   without them.

---

## Set up the schedule

In your Supabase dashboard, open **SQL Editor → New query**, fill in the two values at the top, and
run it.

```sql
-- Both extensions live in Supabase's own schema. pg_cron holds the schedule,
-- pg_net makes the outbound request.
create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

select cron.schedule(
  'proposallift-job-notifications',
  '*/15 * * * *',                       -- every 15 minutes
  $$
  select net.http_post(
    url     := 'https://your-app.example.com/api/cron/job-notifications',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer your-cron-secret-here'
    ),
    body    := '{}'::jsonb
  );
  $$
);
```

Replace **both** placeholders: the URL with your deployment's own address, and the bearer token with
the exact `CRON_SECRET` your app is running with.

`*/15 * * * *` is a reasonable starting point. Every 5 minutes is about as tight as is sensible;
hourly is fine if your filters are broad.

---

## Check it worked

```sql
-- The schedule exists
select jobname, schedule, active from cron.job;

-- The last few runs, newest first
select status, return_message, start_time
from cron.job_run_details
order by start_time desc
limit 10;
```

`status = 'succeeded'` means pg_cron ran the statement — it does not mean your app answered. For
that, check the response pg_net recorded:

```sql
select status_code, content, created
from net._http_response
order by created desc
limit 10;
```

A `200` is a completed run. A `401` means the bearer token does not match `CRON_SECRET`. A `500`
saying `CRON_SECRET not configured` means the app has no secret set — check it reached the running
container, not just the `.env` file.

---

## Changing or removing the schedule

`cron.schedule` with the same job name replaces the existing entry, so re-run the block above after
changing the interval or the secret. To stop alerts entirely:

```sql
select cron.unschedule('proposallift-job-notifications');
```

---

## Other schedulers

Nothing about the endpoint is Supabase-specific — it is an HTTP POST with a bearer token. GitHub
Actions on a schedule, a Vercel cron, a systemd timer, or a plain `crontab` line all work:

```bash
*/15 * * * * curl -fsS -X POST https://your-app.example.com/api/cron/job-notifications \
  -H "Authorization: Bearer $CRON_SECRET" >/dev/null
```

Use exactly one of them. Two schedulers hitting the same endpoint doubles the Upwork API usage
without finding anything twice.
