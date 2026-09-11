import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  buildSmeplugEventId,
  claimWebhookEvent,
  completeWebhookEvent,
  failWebhookEvent,
  scheduleWebhookWork,
  webhookJsonResponse,
} from "../_shared/webhook-idempotency.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-smeplug-signature",
};

async function verifySmeplugWebhookSignature(
  payload: string,
  signature: string,
  secret: string,
): Promise<boolean> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  const computed = Array.from(new Uint8Array(mac))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const normalized = signature.replace(/^sha256=/i, "").trim().toLowerCase();
  return computed === normalized;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return webhookJsonResponse({ error: "Method not allowed" }, 405, CORS_HEADERS);
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const bodyText = await req.text();
    const signature = req.headers.get("x-smeplug-signature") || "";
    const secret = Deno.env.get("SMEPLUG_WEBHOOK_SECRET") || "";
    const requireSignature = Deno.env.get("WEBHOOK_REQUIRE_SIGNATURES") !== "false";

    if (requireSignature && !secret) {
      return webhookJsonResponse(
        { error: "SMEPlug webhook secret not configured" },
        503,
        CORS_HEADERS,
      );
    }

    if (secret) {
      if (!signature) {
        return webhookJsonResponse({ error: "Missing x-smeplug-signature header" }, 401, CORS_HEADERS);
      }
      const valid = await verifySmeplugWebhookSignature(bodyText, signature, secret);
      if (!valid) {
        console.error("Invalid SMEPlug webhook signature");
        return webhookJsonResponse({ error: "Invalid signature" }, 401, CORS_HEADERS);
      }
    } else if (signature) {
      console.warn("SMEPlug webhook sent signature but SMEPLUG_WEBHOOK_SECRET is not configured");
    }

    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(bodyText);
    } catch {
      return webhookJsonResponse({ error: "Invalid JSON payload" }, 400, CORS_HEADERS);
    }

    console.log("SMEPlug webhook received:", JSON.stringify(payload, null, 2));

    const transactionReference =
      payload.reference ||
      payload.customer_reference ||
      payload.transaction_id ||
      payload.transId ||
      (payload.data as Record<string, unknown> | undefined)?.reference ||
      (payload.data as Record<string, unknown> | undefined)?.customer_reference;

    if (!transactionReference || typeof transactionReference !== "string") {
      console.error("No transaction reference found in webhook payload");
      return webhookJsonResponse({ error: "Missing transaction reference" }, 400, CORS_HEADERS);
    }

    const eventId = buildSmeplugEventId(payload, transactionReference);
    const claim = await claimWebhookEvent(supabase, "smeplug", eventId, payload);
    if (claim.action === "skip") {
      return webhookJsonResponse(
        { success: true, duplicate: true, reason: claim.reason },
        200,
        CORS_HEADERS,
      );
    }
    const webhookRowId = claim.rowId;

    scheduleWebhookWork((async () => {
      try {
        const status = String(payload.status || (payload.data as Record<string, unknown> | undefined)?.status || "");
        const statusLower = status.toLowerCase();

        const isSuccess =
          statusLower === "success" ||
          statusLower === "delivered" ||
          statusLower === "completed" ||
          payload.success === true ||
          (payload.data as Record<string, unknown> | undefined)?.success === true;

        const isFailed =
          statusLower === "failed" ||
          statusLower === "error" ||
          payload.success === false ||
          (payload.data as Record<string, unknown> | undefined)?.success === false;

        const transactionStatus = isSuccess
          ? "success"
          : isFailed
          ? "failed"
          : statusLower === "pending" || statusLower === "processing"
          ? "pending"
          : "pending";

        const { data: dataTransaction, error: dataTxnError } = await supabase
          .from("data_transactions")
          .select("id, user_id, reference, status, provider")
          .eq("reference", transactionReference)
          .maybeSingle();

        if (dataTxnError) {
          console.error("Error fetching data transaction:", dataTxnError);
          throw dataTxnError;
        }

        if (dataTransaction && dataTransaction.provider !== "smeplug") {
          console.log(`Transaction ${transactionReference} is not from SMEPlug, ignoring`);
          await completeWebhookEvent(supabase, webhookRowId, {
            success: true,
            message: "Transaction not from SMEPlug",
          });
          return;
        }

        if (!dataTransaction) {
          console.log(`Transaction not found: ${transactionReference}`);
          await completeWebhookEvent(supabase, webhookRowId, {
            success: true,
            message: "Transaction not found, webhook acknowledged",
          });
          return;
        }

        if (dataTransaction.status === transactionStatus) {
          console.log(`Transaction ${transactionReference} already has status: ${transactionStatus}`);
          await completeWebhookEvent(supabase, webhookRowId, {
            success: true,
            message: "Transaction status already updated",
            reference: transactionReference,
            status: transactionStatus,
          });
          return;
        }

        console.log(
          `Updating transaction ${transactionReference} from ${dataTransaction.status} to ${transactionStatus}`,
        );

        const updateData: Record<string, unknown> = {
          status: transactionStatus,
          updated_at: new Date().toISOString(),
        };

        const { data: currentTransaction } = await supabase
          .from("data_transactions")
          .select("api_response")
          .eq("id", dataTransaction.id)
          .single();

        updateData.api_response = {
          ...(currentTransaction?.api_response || {}),
          webhook: payload,
          webhook_received_at: new Date().toISOString(),
        };

        const { error: updateError } = await supabase
          .from("data_transactions")
          .update(updateData)
          .eq("id", dataTransaction.id);

        if (updateError) {
          console.error("Error updating transaction:", updateError);
          throw updateError;
        }

        if (dataTransaction.user_id && transactionStatus !== dataTransaction.status) {
          try {
            const notificationTitle =
              transactionStatus === "success"
                ? "Data purchase successful"
                : transactionStatus === "failed"
                ? "Data purchase failed"
                : "Data purchase status updated";

            const notificationMessage =
              transactionStatus === "success"
                ? `Your data purchase (${transactionReference}) has been delivered successfully.`
                : transactionStatus === "failed"
                ? `Your data purchase (${transactionReference}) has failed.`
                : `Your data purchase (${transactionReference}) status has been updated.`;

            await supabase.functions.invoke("send-push-notification", {
              body: {
                user_id: dataTransaction.user_id,
                title: notificationTitle,
                body: notificationMessage,
                data: {
                  transaction_id: dataTransaction.id,
                  reference: transactionReference,
                  status: transactionStatus,
                },
              },
            });
          } catch (notifError) {
            console.error("Error sending notification:", notifError);
          }
        }

        if (transactionStatus === "failed" && dataTransaction.status === "pending") {
          console.log(`Transaction ${transactionReference} failed - may need refund processing`);
        }

        await completeWebhookEvent(supabase, webhookRowId, {
          success: true,
          message: "Transaction status updated",
          reference: transactionReference,
          status: transactionStatus,
        });
      } catch (backgroundError) {
        const message = backgroundError instanceof Error
          ? backgroundError.message
          : "SMEPlug webhook background processing failed";
        await failWebhookEvent(supabase, webhookRowId, message);
        console.error("SMEPlug webhook background error:", backgroundError);
      }
    })());

    return webhookJsonResponse(
      { success: true, received: true, event_id: eventId },
      200,
      CORS_HEADERS,
    );
  } catch (error) {
    console.error("Error in smeplug-webhook:", error);
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
    return webhookJsonResponse({ error: errorMessage }, 500, CORS_HEADERS);
  }
});
