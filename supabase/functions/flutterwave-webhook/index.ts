import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  isSuccessfulFlutterwaveStatus,
  processFlutterwaveChargeData,
} from "../_shared/flutterwave-virtual-account.ts";
import {
  buildFallbackEventId,
  buildFlutterwaveEventId,
  claimWebhookEvent,
  completeWebhookEvent,
  failWebhookEvent,
  scheduleWebhookWork,
  webhookJsonResponse,
} from "../_shared/webhook-idempotency.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, verif-hash",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const bodyText = await req.text();

  try {
    const secretHash = Deno.env.get("FLUTTERWAVE_SECRET_HASH");
    const signature = req.headers.get("verif-hash");
    const requireSignature = Deno.env.get("WEBHOOK_REQUIRE_SIGNATURES") !== "false";

    if (requireSignature && !secretHash) {
      return webhookJsonResponse(
        { error: "Flutterwave webhook secret not configured" },
        503,
        corsHeaders,
      );
    }

    if (secretHash) {
      if (!signature || signature !== secretHash) {
        console.error("Flutterwave webhook secret hash mismatch");
        return webhookJsonResponse({ error: "Invalid webhook signature" }, 401, corsHeaders);
      }
    } else if (signature) {
      console.warn("Flutterwave webhook sent verif-hash but FLUTTERWAVE_SECRET_HASH is not configured");
    }

    const payload = JSON.parse(bodyText) as Record<string, unknown>;
    const event = String(payload.event || payload.type || "").toLowerCase();
    const nestedEvent = payload.event && typeof payload.event === "object"
      ? payload.event as Record<string, unknown>
      : null;
    const nestedEventType = String(nestedEvent?.type || "").toLowerCase();
    const data = (payload.data || {}) as Record<string, unknown>;

    const isChargeCompleted = event === "charge.completed";
    const isBankTransferEvent =
      event === "bank_transfer_transaction" ||
      nestedEventType === "bank_transfer_transaction";

    if ((!isChargeCompleted && !isBankTransferEvent) || !isSuccessfulFlutterwaveStatus(data.status)) {
      console.log("Ignoring Flutterwave webhook event:", event, nestedEventType, data.status);
      return webhookJsonResponse({ message: "Event ignored" }, 200, corsHeaders);
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const fallbackId = await buildFallbackEventId(bodyText);
    const eventId = buildFlutterwaveEventId(payload, fallbackId);
    const claim = await claimWebhookEvent(supabaseClient, "flutterwave", eventId, payload);

    if (claim.action === "skip") {
      return webhookJsonResponse({
        success: true,
        duplicate: true,
        reason: claim.reason,
      }, 200, corsHeaders);
    }

    scheduleWebhookWork((async () => {
      try {
        const outcome = await processFlutterwaveChargeData(supabaseClient, data, payload);

        if (!outcome.processed) {
          await completeWebhookEvent(supabaseClient, claim.rowId, {
            processed: false,
            reason: outcome.reason,
          });
          return;
        }

        await completeWebhookEvent(supabaseClient, claim.rowId, {
          processed: true,
          alreadyProcessed: outcome.result.alreadyProcessed,
          netCreditAmount: outcome.result.netCreditAmount,
          userId: outcome.userId,
          reference: outcome.reference,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Webhook processing failed";
        await failWebhookEvent(supabaseClient, claim.rowId, message);
        console.error("Flutterwave webhook background error:", error);
      }
    })());

    return webhookJsonResponse({
      success: true,
      received: true,
      event_id: eventId,
    }, 200, corsHeaders);
  } catch (error) {
    console.error("Flutterwave webhook error:", error);
    return webhookJsonResponse(
      { error: error instanceof Error ? error.message : "Webhook processing failed" },
      500,
      corsHeaders,
    );
  }
});
