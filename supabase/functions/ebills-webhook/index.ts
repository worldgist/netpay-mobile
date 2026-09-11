import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  findEbillsTransaction,
  isWalletStillDebited,
  reconcileEbillsTransactionRow,
} from "../_shared/ebills-reconcile.ts";
import { getEbillsOrderStatus } from "../_shared/purchase-refund.ts";

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

    if (userPin && signature) {
      const valid = await verifyEbillsWebhookSignature(rawBody, signature, userPin);
      if (!valid) {
        console.error("eBills webhook signature mismatch");
        return new Response(JSON.stringify({ success: false, error: "Invalid signature" }), {
          status: 401,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
      }
    } else if (userPin) {
      console.warn("eBills webhook missing X-Signature header");
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

    console.log("eBills webhook received:", JSON.stringify(payload));

    const orderId = payload.order_id;
    const status = String(payload.status ?? "").toLowerCase();
    const requestId = typeof payload.request_id === "string" ? payload.request_id : undefined;

    const match = await findEbillsTransaction(supabase, {
      reference: requestId,
      orderId: orderId != null ? Number(orderId) : undefined,
    });

    if (!match) {
      console.warn("eBills webhook: no matching transaction", { orderId, requestId, status });
      return new Response(JSON.stringify({ success: true, action: "ignored", reason: "transaction not found" }), {
        status: 200,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
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

    if (orderStatus.isCompleted) {
      const result = await reconcileEbillsTransactionRow(supabase, config, row, syntheticResult, "WEBHOOK-REF");
      return new Response(JSON.stringify({ success: true, ...result }), {
        status: 200,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    if (orderStatus.shouldRefund && isWalletStillDebited(row)) {
      const result = await reconcileEbillsTransactionRow(supabase, config, row, syntheticResult, "WEBHOOK-REF");
      return new Response(JSON.stringify({ success: true, ...result }), {
        status: 200,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    if (orderStatus.shouldRefund) {
      await supabase.from(config.table).update({
        status: orderStatus.isRefunded ? config.refundedStatus : config.failedStatus,
        api_response: {
          ...(typeof row.api_response === "object" && row.api_response ? row.api_response : {}),
          webhook: payload,
          webhook_at: new Date().toISOString(),
        },
      }).eq("id", row.id);

      return new Response(JSON.stringify({
        success: true,
        action: "status_updated",
        reference: row.reference,
        wallet_refunded: false,
      }), {
        status: 200,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      success: true,
      action: "ignored",
      reference: row.reference,
      status,
    }), {
      status: 200,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
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
