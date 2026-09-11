import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  findEbillsTransaction,
  isWalletStillDebited,
  reconcileEbillsTransactionRow,
} from "../_shared/ebills-reconcile.ts";
import { getEbillsOrderStatus } from "../_shared/purchase-refund.ts";
import {
  buildEbillsEventId,
  claimWebhookEvent,
  completeWebhookEvent,
  failWebhookEvent,
  scheduleWebhookWork,
  webhookJsonResponse,
} from "../_shared/webhook-idempotency.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-signature",
};

async function verifyEbillsWebhookSignature(
  rawBody: string,
  signature: string,
  userPin: string,
): Promise<boolean> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(userPin),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  const computed = Array.from(new Uint8Array(mac))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return computed === signature.toLowerCase();
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ success: false, error: "Method not allowed" }), {
      status: 405,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const rawBody = await req.text();
    const signature = req.headers.get("x-signature") || req.headers.get("X-Signature") || "";
    const userPin = Deno.env.get("EBILLS_WEBHOOK_PIN") || Deno.env.get("EBILLS_USER_PIN") || "";

    if (userPin) {
      if (!signature) {
        return webhookJsonResponse({ success: false, error: "Missing X-Signature header" }, 401, CORS_HEADERS);
      }
      const valid = await verifyEbillsWebhookSignature(rawBody, signature, userPin);
      if (!valid) {
        console.error("eBills webhook signature mismatch");
        return webhookJsonResponse({ success: false, error: "Invalid signature" }, 401, CORS_HEADERS);
      }
    }

    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return new Response(JSON.stringify({ success: false, error: "Invalid JSON" }), {
        status: 400,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const eventId = buildEbillsEventId(payload);
    const claim = await claimWebhookEvent(supabase, "ebills", eventId, payload);

    if (claim.action === "skip") {
      return webhookJsonResponse({
        success: true,
        duplicate: true,
        reason: claim.reason,
      }, 200, CORS_HEADERS);
    }

    scheduleWebhookWork((async () => {
      try {
        const orderId = payload.order_id;
        const status = String(payload.status ?? "").toLowerCase();
        const requestId = typeof payload.request_id === "string" ? payload.request_id : undefined;

        const match = await findEbillsTransaction(supabase, {
          reference: requestId,
          orderId: orderId != null ? Number(orderId) : undefined,
        });

        if (!match) {
          await completeWebhookEvent(supabase, claim.rowId, {
            action: "ignored",
            reason: "transaction not found",
          });
          return;
        }

        const { config, row } = match;
        const syntheticResult = {
          code: "success",
          message: status === "refunded"
            ? "ORDER REFUNDED"
            : status === "completed-api" || status === "completed"
              ? "ORDER COMPLETED"
              : status === "failed" || status === "failed-api"
                ? "ORDER FAILED"
                : "ORDER PROCESSING",
          data: {
            order_id: orderId,
            status,
          },
        };

        const orderStatus = getEbillsOrderStatus(syntheticResult);
        let result: Record<string, unknown> = { action: "ignored", reference: row.reference, status };

        if (orderStatus.isCompleted) {
          result = await reconcileEbillsTransactionRow(supabase, config, row, syntheticResult, "WEBHOOK-REF");
        } else if (orderStatus.shouldRefund && isWalletStillDebited(row)) {
          result = await reconcileEbillsTransactionRow(supabase, config, row, syntheticResult, "WEBHOOK-REF");
        } else if (orderStatus.shouldRefund) {
          await supabase.from(config.table).update({
            status: orderStatus.isRefunded ? config.refundedStatus : config.failedStatus,
            api_response: {
              ...(typeof row.api_response === "object" && row.api_response ? row.api_response : {}),
              webhook: payload,
              webhook_at: new Date().toISOString(),
            },
          }).eq("id", row.id);
          result = {
            action: "status_updated",
            reference: row.reference,
            wallet_refunded: false,
          };
        }

        await completeWebhookEvent(supabase, claim.rowId, { success: true, ...result });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Webhook processing failed";
        await failWebhookEvent(supabase, claim.rowId, message);
        console.error("eBills webhook background error:", error);
      }
    })());

    return webhookJsonResponse({
      success: true,
      received: true,
      event_id: eventId,
    }, 200, CORS_HEADERS);
  } catch (error) {
    console.error("ebills-webhook error:", error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : "Webhook processing failed",
    }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
});
