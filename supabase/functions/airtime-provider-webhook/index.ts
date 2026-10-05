import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { canTransitionAirtimeStatus, publicAirtimeStatus } from "../_shared/airtime-flow.ts";
import { creditUserWallet } from "../_shared/wallet.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-airtime-webhook-secret",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  const expected = Deno.env.get("AIRTIME_WEBHOOK_SECRET") || "";
  const provided = req.headers.get("x-airtime-webhook-secret") || "";
  if (!expected || provided !== expected) {
    return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), {
      status: 401,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ success: false, error: "Invalid request" }), {
      status: 400,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  const reference = String(body.reference || body.customer_reference || "").trim();
  const eventId = String(body.event_id || body.eventId || body.id || "").trim();
  const incoming = String(body.status || "").trim().toLowerCase();
  if (!reference) {
    return new Response(JSON.stringify({ success: false, error: "Missing reference" }), {
      status: 400,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );
  const { data: transaction } = await supabase
    .from("airtime_transactions")
    .select("id, user_id, amount, status, reference, api_response")
    .eq("reference", reference)
    .maybeSingle();

  if (!transaction) {
    return new Response(JSON.stringify({ success: true, ignored: true }), {
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  const apiResponse = (transaction.api_response && typeof transaction.api_response === "object")
    ? transaction.api_response as Record<string, unknown>
    : {};
  const seen = Array.isArray(apiResponse.webhook_event_ids)
    ? apiResponse.webhook_event_ids.map(String)
    : [];
  if (eventId && seen.includes(eventId)) {
    return new Response(JSON.stringify({
      success: true,
      duplicate: true,
      status: publicAirtimeStatus(String(transaction.status)),
    }), { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
  }

  const current = String(transaction.status);
  if (current === "success" || current === "refunded") {
    return new Response(JSON.stringify({
      success: true,
      duplicate: true,
      status: publicAirtimeStatus(current),
    }), { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
  }

  let next = current;
  if (/success|complete|delivered|approved/.test(incoming)) next = "success";
  else if (/fail|reject|cancel/.test(incoming)) next = "refunded";
  else next = "requires_review";

  if (!canTransitionAirtimeStatus(current, next)) {
    return new Response(JSON.stringify({
      success: true,
      ignored: true,
      status: publicAirtimeStatus(current),
    }), { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
  }

  if (next === "refunded") {
    try {
      await creditUserWallet({
        supabase,
        userId: transaction.user_id,
        amount: Number(transaction.amount),
        transactionType: "refund",
        description: "Airtime purchase refunded — provider webhook",
        reference: `${reference}-REFUND`,
        performedBy: transaction.user_id,
      });
    } catch (error) {
      console.error("Airtime webhook refund failed:", error);
      next = "requires_review";
    }
  }

  const eventIds = eventId ? [...seen, eventId] : seen;
  const { data: updated } = await supabase
    .from("airtime_transactions")
    .update({
      status: next,
      provider_reference: String(body.provider_reference || body.providerReference || "") || undefined,
      api_response: { ...apiResponse, webhook_event_ids: eventIds, last_webhook: body },
      updated_at: new Date().toISOString(),
    })
    .eq("id", transaction.id)
    .eq("status", current)
    .select("status")
    .maybeSingle();

  if (updated) {
    await supabase.from("airtime_purchase_jobs").update({
      status: next === "success" ? "succeeded" : next === "refunded" ? "failed" : "review",
      locked_at: null,
      updated_at: new Date().toISOString(),
    }).eq("reference", reference).in("status", ["queued", "running", "review"]);
  }

  return new Response(JSON.stringify({
    success: true,
    status: publicAirtimeStatus(String(updated?.status || current)),
  }), { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
});
