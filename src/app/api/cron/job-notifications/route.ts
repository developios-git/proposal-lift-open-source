import { NextResponse } from "next/server";
import type { ProposalTenant } from "@/lib/extension/membership";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { fetchJobsForFilter, quotaContextForFilter } from "@/lib/upwork/sync";
import { applyFrontendFilters } from "@/lib/upwork/apply-frontend-filters";
import {
  ensureValidAccessToken,
  UpworkTokenMissingError,
  UpworkTokenRefreshError,
} from "@/lib/upwork/refresh-token";
import {
  getUpworkQuotaUsage,
  UpworkQuotaExceededError,
} from "@/lib/upwork/quota";
import { deliverAndLog } from "@/lib/webhooks/deliver";
import type { WebhookPayload, DeliveryContext } from "@/lib/webhooks/deliver";
import type { UpworkJob } from "@/lib/upwork/client";
import type { FilterCriteria } from "@/types";
import { Resend } from "resend";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// ─── Constants ───────────────────────────────────────────────────────────────

const OFFLINE_THRESHOLD_MS = 20 * 1000; // TESTING: 20s (restore to 5 * 60 * 1000)
const SOFT_LOCK_MS = 3 * 60 * 1000; // skip filter if checked < 3 min ago
const MAX_NOTIFIED_IDS = 500; // cap stored ID history
const MAX_JOBS_PER_PAYLOAD = 10; // cap jobs sent per webhook
const MIN_QUOTA_RESERVE = 500; // minimum remaining Upwork quota before skipping

// ─── Types ───────────────────────────────────────────────────────────────────

type FilterRow = {
  id: string;
  name: string;
  filters: unknown;
  user_id: string;
};

type WebhookRow = {
  id: string;
  url: string;
  name: string;
  consecutive_failures: number;
};

type WebhookStateRow = {
  id: string;
  filter_id: string;
  notified_job_ids: string[];
  baseline_pending: boolean;
  last_checked_at: string;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (supabase: any) => supabase as any;


// ─── Helpers ─────────────────────────────────────────────────────────────────

async function isAnyoneOnline(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  serviceClient: any,
  filter: FilterRow,
): Promise<boolean> {
  const offlineCutoff = new Date(
    Date.now() - OFFLINE_THRESHOLD_MS,
  ).toISOString();

  const { data: presence } = await db(serviceClient)
    .from("user_presence")
    .select("user_id")
    .eq("user_id", filter.user_id)
    .gte("last_seen_at", offlineCutoff)
    .maybeSingle();

  return !!presence;
}

async function loadOrCreateWebhookState(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  serviceClient: any,
  filterId: string,
): Promise<WebhookStateRow> {
  const { data: existing } = await db(serviceClient)
    .from("filter_webhook_state")
    .select("*")
    .eq("filter_id", filterId)
    .maybeSingle();

  if (existing) return existing as WebhookStateRow;

  const { data: created } = await db(serviceClient)
    .from("filter_webhook_state")
    .insert({ filter_id: filterId })
    .select()
    .single();

  return created as WebhookStateRow;
}

async function updateWebhookState(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  serviceClient: any,
  filterId: string,
  updates: {
    notified_job_ids?: string[];
    baseline_pending?: boolean;
    last_notified_at?: string | null;
    last_checked_at?: string;
  },
): Promise<void> {
  await db(serviceClient)
    .from("filter_webhook_state")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("filter_id", filterId);
}

function appendAndTrimIds(existing: string[], newIds: string[]): string[] {
  const combined = [...existing, ...newIds];
  return combined.slice(-MAX_NOTIFIED_IDS);
}

function buildJobItem(job: UpworkJob) {
  // The UpworkJob interface declares amount.value but the GraphQL response uses rawValue.
  // hourlyBudgetMin/Max are returned by the API but absent from the interface, so we cast.
  const raw = job as unknown as Record<string, unknown>;

  const amountRaw = raw.amount as Record<string, unknown> | undefined;
  const fixedAmount =
    amountRaw?.rawValue != null ? parseFloat(String(amountRaw.rawValue)) : null;

  const hourlyMinRaw = raw.hourlyBudgetMin as
    | Record<string, unknown>
    | undefined;
  const hourlyMaxRaw = raw.hourlyBudgetMax as
    | Record<string, unknown>
    | undefined;
  const hourlyMin =
    hourlyMinRaw?.rawValue != null
      ? parseFloat(String(hourlyMinRaw.rawValue))
      : null;
  const hourlyMax =
    hourlyMaxRaw?.rawValue != null
      ? parseFloat(String(hourlyMaxRaw.rawValue))
      : null;

  const engagementLower = String(job.engagement ?? "").toLowerCase();
  const hasHourlyBudget = hourlyMin != null || hourlyMax != null;
  const isHourly =
    hasHourlyBudget ||
    engagementLower.includes("hour") ||
    engagementLower.includes("hr");

  return {
    upwork_id: job.ciphertext ?? job.id,
    title: job.title,
    url: job.ciphertext
      ? `https://www.upwork.com/jobs/${job.title.replace(/[ /]/g, "-")}_${job.ciphertext}/?referrer_url_path=/nx/search/jobs/`
      : `https://www.upwork.com/jobs/~${job.id}`,
    job_type: isHourly ? "hourly" : fixedAmount != null ? "fixed" : null,
    budget_min: isHourly ? hourlyMin : fixedAmount,
    budget_max: isHourly ? hourlyMax : fixedAmount,
    experience_level: job.experienceLevel ?? null,
    client_country: job.client?.location?.country ?? null,
    client_payment_verified: job.client?.verificationStatus === "VERIFIED",
    skills: job.skills?.map((s) => s.prettyName || s.name || "") ?? [],
    posted_at: job.createdDateTime ?? new Date().toISOString(),
  };
}

async function getOwnerEmail(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  serviceClient: any,
  filter: FilterRow,
): Promise<string | null> {
  try {

    const { data: userData } = await serviceClient.auth.admin.getUserById(
      filter.user_id,
    );
    return userData?.user?.email ?? null;
  } catch {
    return null;
  }
}

async function sendWebhookDisabledEmail(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  serviceClient: any,
  webhook: WebhookRow,
  filter: FilterRow,
): Promise<void> {
  const resendKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM?.trim();
  if (!resendKey || !from) return;

  const ownerEmail = await getOwnerEmail(serviceClient, filter);
  if (!ownerEmail) return;

  const resend = new Resend(resendKey);
  const settingsUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/settings?tab=webhooks`;

  await resend.emails
    .send({
      from: `ProposalLift <${from}>`,
      to: ownerEmail,
      subject: `Webhook "${webhook.name}" has been disabled`,
      html: [
        `<p>Your webhook <strong>${webhook.name}</strong> has been automatically disabled`,
        ` after 5 consecutive delivery failures.</p>`,
        `<p>Please check the URL is correct and re-enable it in `,
        `<a href="${settingsUrl}">Settings → Webhooks</a>.</p>`,
      ].join(""),
    })
    .catch((err: unknown) => {
      console.error(
        "[job-notifications] failed to send webhook-disabled email:",
        err,
      );
    });
}

// ─── Cron handler ────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json(
      { error: "CRON_SECRET not configured" },
      { status: 500 },
    );
  }
  if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const serviceClient = createSupabaseServiceClient();
  const now = new Date().toISOString();
  const appBaseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";

  // ── 1. Load all filters for orgs/users that have at least one active webhook ─
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: filters, error: filtersError } = await (serviceClient as any)
    .from("saved_job_filters")
    .select("id, name, filters, user_id")
    // Disabled filters are inert: never poll Upwork for them. Filtered in the
    // query rather than the loop below so a tenant whose filters are all
    // disabled never even reaches the quota/credential grouping.
    .eq("is_enabled", true);

  if (filtersError) {
    console.error("[job-notifications] failed to load filters:", filtersError);
    return NextResponse.json({ error: "DB error" }, { status: 500 });
  }

  if (!filters?.length) {
    return NextResponse.json({ processed: 0, notified: 0, skipped: 0 });
  }

  // ── 2. Group filters by quota/credential context ──────────────────────────
  const groups = new Map<string, FilterRow[]>();
  for (const filter of filters as FilterRow[]) {
    const key = `user:${filter.user_id}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(filter);
  }

  let totalProcessed = 0;
  let totalNotified = 0;
  let totalSkipped = 0;

  // ── 3. Process each credential group ─────────────────────────────────────
  for (const [, groupFilters] of groups) {
    const representative = groupFilters[0];
    const quotaCtx = quotaContextForFilter(representative);
    const tenant: ProposalTenant = { userId: representative.user_id };



    // 3a. Quota guard — reserve headroom for user-triggered syncs
    const quota = await getUpworkQuotaUsage(quotaCtx).catch(() => null);
    if (quota && quota.remaining < MIN_QUOTA_RESERVE) {
      console.warn(
        `[job-notifications] quota too low for ${JSON.stringify(quotaCtx)}: ${quota.remaining} remaining`,
      );
      totalSkipped += groupFilters.length;
      continue;
    }

    // 3b. Load (and refresh if needed) the Upwork access token once per group
    let accessToken: string;
    try {
      accessToken = await ensureValidAccessToken(serviceClient, tenant);
    } catch (err) {
      if (err instanceof UpworkTokenMissingError) {
        console.info(
          `[job-notifications] no Upwork token for ${JSON.stringify(tenant)}, skipping group`,
        );
      } else if (err instanceof UpworkTokenRefreshError) {
        console.warn(
          `[job-notifications] token refresh failed: ${(err as Error).message}`,
        );
      } else {
        console.error("[job-notifications] unexpected token error:", err);
      }
      totalSkipped += groupFilters.length;
      continue;
    }

    // 3c. Process each filter in the group
    for (const filter of groupFilters) {
      totalProcessed++;

      try {
        // i. Load or create webhook state row
        const state = await loadOrCreateWebhookState(serviceClient, filter.id);
        if (!state) {
          totalSkipped++;
          continue;
        }

        // ii. Soft-lock: skip if this filter was checked too recently
        const lastChecked = new Date(state.last_checked_at).getTime();
        if (Date.now() - lastChecked < SOFT_LOCK_MS) {
          totalSkipped++;
          continue;
        }

        // iii. Presence check: skip if any org member / solo user is online
        const anyOnline = await isAnyoneOnline(serviceClient, filter);
        if (anyOnline) {
          await updateWebhookState(serviceClient, filter.id, {
            last_checked_at: now,
          });
          totalSkipped++;
          continue;
        }

        // iv. Fetch latest jobs from Upwork, then apply client-side filters
        //     that mirror the frontend filteredJobs useMemo (country, spend, rating, etc.)
        let fetchedJobs: UpworkJob[];
        try {
          const result = await fetchJobsForFilter(
            filter,
            accessToken,
            quotaCtx,
          );
          fetchedJobs = applyFrontendFilters(
            result.jobs,
            filter.filters as FilterCriteria,
          );
        } catch (err) {
          if (err instanceof UpworkQuotaExceededError) {
            console.warn(
              `[job-notifications] quota exceeded mid-run for filter ${filter.id}`,
            );
            totalSkipped++;
            break; // Stop this group — quota is gone
          }
          console.error(
            `[job-notifications] fetch failed for filter ${filter.id}:`,
            err,
          );
          await updateWebhookState(serviceClient, filter.id, {
            last_checked_at: now,
          });
          totalSkipped++;
          continue;
        }

        const fetchedIds = fetchedJobs.map((j) => j.ciphertext ?? j.id);

        // v. Baseline run: populate IDs without sending webhooks
        if (state.baseline_pending) {
          await updateWebhookState(serviceClient, filter.id, {
            notified_job_ids: appendAndTrimIds(
              state.notified_job_ids,
              fetchedIds,
            ),
            baseline_pending: false,
            last_checked_at: now,
          });
          console.info(
            `[job-notifications] baseline established for filter ${filter.id} (${fetchedIds.length} IDs)`,
          );
          continue;
        }

        // vi. Identify genuinely new jobs
        const alreadyNotified = new Set(state.notified_job_ids);
        const newJobs = fetchedJobs.filter(
          (j) => !alreadyNotified.has(j.ciphertext ?? j.id),
        );

        if (newJobs.length === 0) {
          await updateWebhookState(serviceClient, filter.id, {
            last_checked_at: now,
          });
          continue;
        }

        // vii. Load active webhooks for this tenant
        const { data: activeWebhooks } = await db(serviceClient)
          .from("webhook_configurations")
          .select("id, url, name, consecutive_failures")
          .eq("is_active", true)
          .eq("user_id", filter.user_id);

        if (!activeWebhooks?.length) {
          // No active webhooks — still track the IDs so we don't send a burst later
          await updateWebhookState(serviceClient, filter.id, {
            notified_job_ids: appendAndTrimIds(
              state.notified_job_ids,
              fetchedIds,
            ),
            last_checked_at: now,
          });
          continue;
        }

        // viii. Build and deliver payload
        const deliveryJobs = newJobs.slice(0, MAX_JOBS_PER_PAYLOAD);
        const runId = `${filter.id}:${Math.floor(Date.now() / (5 * 60 * 1000))}`;
        const filterUrl = `${appBaseUrl}/filters/${filter.id}`;

        const payload: WebhookPayload = {
          event: "new_jobs",
          run_id: runId,
          filter: { id: filter.id, name: filter.name, url: filterUrl },
          new_job_count: deliveryJobs.length,
          total_new_jobs: newJobs.length,
          jobs: deliveryJobs.map(buildJobItem),
          notified_at: now,
        };

        for (const webhook of activeWebhooks as WebhookRow[]) {
          const ctx: DeliveryContext = {
            webhookId: webhook.id,
            webhookName: webhook.name,
            url: webhook.url,
            consecutiveFailures: webhook.consecutive_failures,
            filterId: filter.id,
            runId,
            jobCount: deliveryJobs.length,
          };
          const outcome = await deliverAndLog(db(serviceClient), ctx, payload);

          if (outcome.autoDisabled) {
            console.warn(
              `[job-notifications] disabling webhook ${webhook.id} ("${webhook.name}") after ${outcome.nowAtFailures} failures`,
            );
            await sendWebhookDisabledEmail(serviceClient, webhook, filter);
          }
        }

        // ix. Persist updated notified IDs and timestamps
        await updateWebhookState(serviceClient, filter.id, {
          notified_job_ids: appendAndTrimIds(
            state.notified_job_ids,
            fetchedIds,
          ),
          last_notified_at: now,
          last_checked_at: now,
        });

        totalNotified++;
        console.info(
          `[job-notifications] filter ${filter.id}: notified ${newJobs.length} new jobs to ${activeWebhooks.length} webhook(s)`,
        );
      } catch (err) {
        // Per-filter errors must not abort the whole run
        console.error(
          `[job-notifications] unexpected error for filter ${filter.id}:`,
          err,
        );
        totalSkipped++;
      }
    }
  }

  console.info(
    `[job-notifications] done: processed=${totalProcessed} notified=${totalNotified} skipped=${totalSkipped}`,
  );

  return NextResponse.json({
    processed: totalProcessed,
    notified: totalNotified,
    skipped: totalSkipped,
  });
}
