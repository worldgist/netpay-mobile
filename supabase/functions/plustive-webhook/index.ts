import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { canTransitionAirtimeStatus } from "../_shared/airtime-flow.ts";
import { refundPurchaseWallet } from "../_shared/purchase-refund.ts";
import {
  buildPlustiveEventId,
  claimWebhookEvent,
  completeWebhookEvent,
  failWebhookEvent,
  scheduleWebhookWork,
  webhookJsonResponse,
} from "../_shared/webhook-idempotency.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-plustive-signature",
};

type ServiceConfig = {
  table: string;
  successStatus: string;
  failedStatus: string;
  label: string;
};

const SERVICES: Record<string, ServiceConfig> = {
  data: {
    table: "data_transactions",
    successStatus: "success",
    failedStatus: "failed",
    label: "Data",
  },
  airtime: {
    table: "airtime_transactions",
    successStatus: "success",
    failedStatus: "refunded",
    label: "Airtime",
  },
  cabletv: {
    table: "cable_tv_transactions",
    successStatus: "completed",
    failedStatus: "failed",
    label: "Cable TV",
  },
  electricity: {
    table: "electricity_transactions",
    successStatus: "completed",
    failedStatus: "failed",
    label: "Electricity",
  },
  education: {
    table: "education_transactions",
    successStatus: "completed",
    failedStatus: "failed",
    label: "Education",
  },
};

function timingSafeEqual(left: string, right: string): boolean {
  const a = new TextEncoder().encode(left);
  const b = new TextEncoder().encode(right);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function verifySignature(rawBody: string, header: string, secret: string): Promise<boolean> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  const computed = Array.from(new Uint8Array(mac))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  const provided = header.replace(/^sha256=/i, "").trim().toLowerCase();
  return timingSafeEqual(computed, provided);
}

function serviceConfig(service: unknown): ServiceConfig | null {
  const key = String(service || "").replace(/[^a-z]/gi, "").toLowerCase();
  return SERVICES[key] || null;
}

async function findTransaction(
  supabase: SupabaseClient,
  config: ServiceConfig,
  refs: string[],
): Promise<Record<string, unknown> | null> {
  const columns = "id, user_id, amount, status, reference, api_response";
  for (const ref of refs) {
    const { data } = await supabase
      .from(config.table)
      .select(columns)
      .eq("reference", ref)
      .maybeSingle();
    if (data) return data as Record<string, unknown>;

    if (config.table === "airtime_transactions") {
      const { data: byProvider } = await supabase
        .from(config.table)
        .select(columns)
        .eq("provider_reference", ref)
        .maybeSingle();
      if (byProvider) return byProvider as Record<string, unknown>;
    }
  }
  return null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return webhookJsonResponse({ success: false, error: "Method not allowed" }, 405, CORS_HEADERS);
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const rawBody = await req.text();
    const signature = req.headers.get("x-plustive-signature") || req.headers.get("X-Plustive-Signature") || "";
    const secret = (Deno.env.get("PLUSTIVE_WEBHOOK_SECRET") || "").trim();
    const requireSignature = Deno.env.get("WEBHOOK_REQUIRE_SIGNATURES") !== "false";

    if (requireSignature && !secret) {
      return webhookJsonResponse(
        { success: false, error: "PLUSTIVE_WEBHOOK_SECRET is not configured" },
        503,
        CORS_HEADERS,
      );
    }

    if (secret) {
      if (!signature) {
        return webhookJsonResponse({ success: false, error: "Missing X-Plustive-Signature header" }, 401, CORS_HEADERS);
      }
      const valid = await verifySignature(rawBody, signature, secret);
      if (!valid) {
        console.error("Plustive webhook signature mismatch");
        return webhookJsonResponse({ success: false, error: "Invalid signature" }, 401, CORS_HEADERS);
      }
    }

    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return webhookJsonResponse({ success: false, error: "Invalid JSON" }, 400, CORS_HEADERS);
    }

    const eventId = buildPlustiveEventId(payload);
    const claim = await claimWebhookEvent(supabase, "plustive", eventId, payload);
    if (claim.action === "skip") {
      return webhookJsonResponse({ success: true, duplicate: true, reason: claim.reason }, 200, CORS_HEADERS);
    }

    scheduleWebhookWork((async () => {
      try {
        const config = serviceConfig(payload.service);
        const plustiveReference = String(payload.reference || "").trim();
        const clientReference = String(payload.clientReference || "").trim();
        const refs = [plustiveReference, clientReference].filter(Boolean);
        const event = String(payload.event || "").toLowerCase();
        const status = String(payload.status || "").toLowerCase();
        const failed = event === "transaction.failed" || status === "failed";
        const succeeded = event === "transaction.success" || status === "success";

        if (!config || refs.length === 0 || (!failed && !succeeded)) {
          await completeWebhookEvent(supabase, claim.rowId, {
            action: "ignored",
            reason: !config ? "unsupported service" : "nothing to apply",
          });
          return;
        }

        const row = await findTransaction(supabase, config, refs);
        if (!row) {
          await completeWebhookEvent(supabase, claim.rowId, {
            action: "ignored",
            reason: "transaction not found",
            reference: clientReference || plustiveReference,
          });
          return;
        }

        const current = String(row.status || "").toLowerCase();
        const terminalSuccess = current === "success" || current === "completed";
        const terminalFailure = current === "failed" || current === "refunded";
        if ((succeeded && terminalSuccess) || (failed && terminalFailure)) {
          await completeWebhookEvent(supabase, claim.rowId, {
            action: "duplicate_status",
            reference: row.reference,
            status: current,
          });
          return;
        }

        const nextStatus = succeeded ? config.successStatus : config.failedStatus;
        // Processing is stored as success for the customer. A later Failed event
        // means Plustive refunded the merchant wallet, so the user debit is reversed too.
        const reversingAcceptedPurchase = failed && terminalSuccess;
        const airtimeAllowed = config.table !== "airtime_transactions" ||
          reversingAcceptedPurchase ||
          canTransitionAirtimeStatus(current, nextStatus) ||
          (current === "pending" && nextStatus === "success");
        if (!airtimeAllowed) {
          await completeWebhookEvent(supabase, claim.rowId, {
            action: "ignored",
            reason: "invalid airtime transition",
            status: current,
          });
          return;
        }

        let refunded = false;
        if (failed) {
          const purchaseReference = String(row.reference || clientReference || plustiveReference);
          refunded = await refundPurchaseWallet({
            supabase,
            userId: String(row.user_id),
            amount: Number(row.amount),
            purchaseReference,
            productLabel: config.label,
            reason: "Plustive reported the purchase failed",
            refSuffix: "PLS-REF",
            performedBy: String(row.user_id),
          });
        }

        const previousApi = row.api_response && typeof row.api_response === "object"
          ? row.api_response as Record<string, unknown>
          : {};
        const update: Record<string, unknown> = {
          status: failed && !refunded && config.table === "airtime_transactions"
            ? "requires_review"
            : nextStatus,
          api_response: {
            ...previousApi,
            webhook: payload,
            webhook_at: new Date().toISOString(),
          },
        };
        if (config.table === "airtime_transactions" && plustiveReference) {
          update.provider_reference = plustiveReference;
        }

        await supabase.from(config.table).update(update).eq("id", row.id);

        if (config.table === "airtime_transactions") {
          await supabase.from("airtime_purchase_jobs").update({
            status: succeeded ? "succeeded" : refunded ? "failed" : "review",
            locked_at: null,
            updated_at: new Date().toISOString(),
          }).eq("reference", String(row.reference)).in("status", ["queued", "running", "review"]);
        }

        await completeWebhookEvent(supabase, claim.rowId, {
          action: succeeded ? "completed" : refunded ? "refunded" : "failed",
          reference: row.reference,
          status: update.status,
        });
      } catch (error) {
        console.error("Plustive webhook processing failed:", error);
        await failWebhookEvent(
          supabase,
          claim.rowId,
          error instanceof Error ? error.message : "Plustive webhook processing failed",
        );
      }
    })());

    return webhookJsonResponse({ success: true }, 200, CORS_HEADERS);
  } catch (error) {
    console.error("plustive-webhook error:", error);
    return webhookJsonResponse(
      { success: false, error: error instanceof Error ? error.message : "Webhook failed" },
      500,
      CORS_HEADERS,
    );
  }
});
