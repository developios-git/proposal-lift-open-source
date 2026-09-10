import { validateWebhookUrl } from "@/lib/webhooks/validate-url";

const DELIVERY_TIMEOUT_MS = 10_000;
const FAILURE_THRESHOLD = 5;

export type WebhookPayload = {
  event: "new_jobs" | "test";
  run_id: string;
  filter?: {
    id: string;
    name: string;
    url: string;
  } | null;
  new_job_count: number;
  total_new_jobs?: number;
  jobs: WebhookJobItem[];
  notified_at: string;
};

export type WebhookJobItem = {
  upwork_id: string;
  title: string;
  url: string;
  budget_min: number | null;
  budget_max: number | null;
  job_type: string | null;
  client_country: string | null;
  client_payment_verified: boolean | null;
  skills: string[];
  posted_at: string;
};

export type DeliveryResult = {
  success: boolean;
  statusCode?: number;
  error?: string;
};

export type DeliveryContext = {
  webhookId: string;
  webhookName: string;
  url: string;
  consecutiveFailures: number;
  filterId: string;
  runId: string;
  jobCount: number;
};

export type DeliveryOutcome = DeliveryResult & {
  nowAtFailures: number;
  autoDisabled: boolean;
};

/**
 * Deliver a webhook payload to a single URL.
 *
 * Low-level primitive: validates URL (SSRF guard), enforces 10s timeout, and
 * returns a DeliveryResult without touching the database. For full delivery
 * with audit logging and failure tracking, use deliverAndLog() instead.
 */
export async function deliverWebhook(
  url: string,
  payload: WebhookPayload,
): Promise<DeliveryResult> {
  const urlValidation = validateWebhookUrl(url);
  if (!urlValidation.valid) {
    return { success: false, error: `Blocked: ${urlValidation.error}` };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), DELIVERY_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      return {
        success: false,
        statusCode: response.status,
        error: body.slice(0, 500) || `HTTP ${response.status}`,
      };
    }

    return { success: true, statusCode: response.status };
  } catch (err) {
    clearTimeout(timeoutId);
    const isTimeout =
      err instanceof Error &&
      (err.name === "AbortError" || err.message.includes("aborted"));
    return {
      success: false,
      error: isTimeout
        ? `Delivery timed out after ${DELIVERY_TIMEOUT_MS / 1000}s`
        : err instanceof Error
          ? err.message
          : String(err),
    };
  }
}

/**
 * Deliver a webhook payload, write an audit log entry, and update the failure
 * counter on the webhook_configurations row — all in one call.
 *
 * Returns DeliveryResult enriched with nowAtFailures and autoDisabled. When
 * autoDisabled is true, the caller is responsible for sending the notification
 * email (email logic stays in the caller to keep this module dependency-free).
 */
export async function deliverAndLog(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  serviceClient: any,
  ctx: DeliveryContext,
  payload: WebhookPayload,
): Promise<DeliveryOutcome> {
  const result = await deliverWebhook(ctx.url, payload);
  const now = new Date().toISOString();

  // Audit log — best-effort; never let a log failure abort delivery accounting.
  // Use try/catch — Supabase query builders are thenable but don't expose .catch().
  try {
    await serviceClient
      .from("webhook_delivery_log")
      .insert({
        webhook_id: ctx.webhookId,
        filter_id: ctx.filterId,
        run_id: ctx.runId,
        job_count: ctx.jobCount,
        status_code: result.statusCode ?? null,
        response_body: result.error?.slice(0, 500) ?? null,
      });
  } catch (err) {
    console.error("[deliver] failed to write delivery log:", err);
  }

  let nowAtFailures = 0;
  let autoDisabled = false;

  if (result.success) {
    try {
      await serviceClient
        .from("webhook_configurations")
        .update({ consecutive_failures: 0, updated_at: now })
        .eq("id", ctx.webhookId);
    } catch (err) {
      console.error("[deliver] failed to reset failure counter:", err);
    }
  } else {
    nowAtFailures = (ctx.consecutiveFailures ?? 0) + 1;
    autoDisabled = nowAtFailures >= FAILURE_THRESHOLD;

    const updates: Record<string, unknown> = {
      consecutive_failures: nowAtFailures,
      last_failure_at: now,
      updated_at: now,
    };
    if (autoDisabled) {
      updates.is_active = false;
    }

    try {
      await serviceClient
        .from("webhook_configurations")
        .update(updates)
        .eq("id", ctx.webhookId);
    } catch (err) {
      console.error("[deliver] failed to update failure counter:", err);
    }
  }

  return { ...result, nowAtFailures, autoDisabled };
}
