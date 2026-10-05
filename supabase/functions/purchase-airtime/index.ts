import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  isValidAirtimePhone,
  normalizeAirtimePhone,
  parseAirtimeAmount,
  publicAirtimeStatus,
  resolveAirtimeNetwork,
  sanitizeIdempotencyKey,
} from "../_shared/airtime-flow.ts";
import { creditUserWallet, debitUserWallet } from "../_shared/wallet.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, idempotency-key",
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function normalizeProvider(raw: unknown): string {
  if (typeof raw !== "string" || !raw.trim()) return "smeplug";
  let normalized = raw.toLowerCase().trim();
  if (normalized === "ebill") normalized = "ebills";
  if (normalized === "mobile_nig" || normalized === "mobile-nig") normalized = "mobilenig";
  if (normalized === "flutter-wave" || normalized === "flw") normalized = "flutterwave";
  return normalized;
}

async function referenceFor(userId: string, idempotencyKey: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${userId}:${idempotencyKey}`));
  const hex = Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `NP-AIR-${hex.slice(0, 12).toUpperCase()}`;
}

function processingBody(reference: string, status: string, message?: string) {
  const publicStatus = publicAirtimeStatus(status);
  const success = publicStatus === "PROCESSING" || publicStatus === "SUCCESS" || publicStatus === "REQUIRES_REVIEW";
  return {
    success,
    status: publicStatus,
    reference,
    message: message || (
      publicStatus === "SUCCESS"
        ? "Airtime purchase completed."
        : publicStatus === "REFUNDED"
        ? "This airtime purchase was refunded."
        : publicStatus === "FAILED"
        ? "Airtime purchase failed."
        : publicStatus === "REQUIRES_REVIEW"
        ? "Airtime purchase is being verified."
        : "Airtime purchase is being processed."
    ),
    data: { reference, status: publicStatus },
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, serviceKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ success: false, error: "Unauthorized" }, 401);
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return json({ success: false, error: "Unauthorized" }, 401);

    let body: Record<string, unknown> = {};
    try {
      const text = await req.text();
      body = text ? JSON.parse(text) : {};
    } catch {
      return json({ success: false, error: "Invalid request." });
    }

    const phone = normalizeAirtimePhone(body.phone_number);
    if (!isValidAirtimePhone(phone)) {
      return json({ success: false, error: "Enter a valid 11-digit phone number." });
    }

    const network = resolveAirtimeNetwork(body.network_id ?? body.service_id, body.network_name ?? body.network);
    if (!network) return json({ success: false, error: "Select a valid network." });

    const amount = parseAirtimeAmount(body.amount);
    if (amount === null) {
      return json({ success: false, error: "Enter an airtime amount between 50 and 50,000." });
    }

    const idempotencyKey = sanitizeIdempotencyKey(
      req.headers.get("Idempotency-Key") || body.idempotency_key || body.request_id,
    ) || `srv-${crypto.randomUUID()}`;
    const reference = await referenceFor(user.id, idempotencyKey);

    const { data: existing } = await supabase
      .from("airtime_transactions")
      .select("reference, status, amount, phone_number")
      .eq("user_id", user.id)
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();

    if (existing) {
      if (Number(existing.amount) !== amount || existing.phone_number !== phone) {
        return json({ success: false, error: "This purchase request was already used with different details." });
      }
      return json(processingBody(String(existing.reference), String(existing.status)));
    }

    const { data: providerSetting } = await supabase
      .from("app_settings")
      .select("setting_value")
      .eq("setting_key", "airtime_provider")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const rawProvider = typeof providerSetting?.setting_value === "string"
      ? providerSetting.setting_value
      : String((providerSetting?.setting_value as { provider?: string } | null)?.provider || "smeplug");
    const provider = normalizeProvider(rawProvider);

    const { data: profile } = await supabase.from("profiles").select("email").eq("id", user.id).maybeSingle();
    const demo = profile?.email === "demo@netppay.com";
    const providerRequestId = `req_${Date.now()}_${user.id.slice(0, 6)}_${crypto.randomUUID().replace(/-/g, "").slice(0, 6)}`.slice(0, 50);
    const providerTransId = String(Date.now());
    const serviceId = String(body.service_id || body.network_id || network);

    let debit;
    try {
      debit = await debitUserWallet({
        supabase,
        userId: user.id,
        amount,
        transactionType: "airtime_purchase",
        description: `Airtime purchase — ${phone} (${network})`,
        reference,
        performedBy: user.id,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to debit wallet";
      if (/insufficient balance/i.test(message)) {
        return json({ success: false, error: "Insufficient balance" });
      }
      console.error("Airtime wallet debit failed:", message);
      return json({ success: false, error: "Unable to start this airtime purchase. Please try again." });
    }

    const { data: raced } = await supabase
      .from("airtime_transactions")
      .select("reference, status")
      .eq("reference", reference)
      .maybeSingle();
    if (raced) return json(processingBody(String(raced.reference), String(raced.status)));

    const { data: transaction, error: insertError } = await supabase
      .from("airtime_transactions")
      .insert({
        user_id: user.id,
        phone_number: phone,
        amount,
        network,
        service_id: serviceId,
        balance_before: debit.balanceBefore,
        balance_after: debit.balanceAfter,
        status: "pending",
        reference,
        idempotency_key: idempotencyKey,
        provider_reference: provider === "ebills" ? providerRequestId : provider === "mobilenig" ? providerTransId : reference,
        vending_provider: provider,
        performed_by: user.id,
        api_response: { queued: true },
      })
      .select("id, reference, status")
      .single();

    if (insertError || !transaction) {
      const { data: afterRace } = await supabase
        .from("airtime_transactions")
        .select("reference, status")
        .eq("reference", reference)
        .maybeSingle();
      if (afterRace) return json(processingBody(String(afterRace.reference), String(afterRace.status)));

      console.error("Airtime transaction insert failed:", insertError);
      try {
        await creditUserWallet({
          supabase,
          userId: user.id,
          amount,
          transactionType: "refund",
          description: "Airtime purchase refunded — could not queue purchase",
          reference: `${reference}-REFUND`,
          performedBy: user.id,
        });
      } catch (refundError) {
        console.error("Airtime refund after queue failure failed:", refundError);
      }
      return json({ success: false, error: "Unable to start this airtime purchase. Please try again." });
    }

    const { error: jobError } = await supabase.from("airtime_purchase_jobs").insert({
      transaction_id: transaction.id,
      user_id: user.id,
      reference,
      idempotency_key: idempotencyKey,
      provider,
      phone_number: phone,
      network,
      service_id: serviceId,
      amount,
      provider_reference: provider === "ebills" ? providerRequestId : provider === "mobilenig" ? providerTransId : reference,
      max_retries: Number(Deno.env.get("AIRTIME_MAX_RETRIES") || "4"),
      payload: {
        demo,
        item_code: typeof body.item_code === "string" ? body.item_code : "",
        service_id: serviceId,
        provider_request_id: providerRequestId,
        provider_trans_id: providerTransId,
        created_at: new Date().toISOString(),
      },
    });

    if (jobError) {
      const { data: existingJob } = await supabase
        .from("airtime_purchase_jobs")
        .select("reference")
        .eq("user_id", user.id)
        .eq("idempotency_key", idempotencyKey)
        .maybeSingle();
      if (!existingJob) {
        console.error("Airtime job insert failed:", jobError);
        try {
          await creditUserWallet({
            supabase,
            userId: user.id,
            amount,
            transactionType: "refund",
            description: "Airtime purchase refunded — could not queue purchase",
            reference: `${reference}-REFUND`,
            performedBy: user.id,
          });
          await supabase.from("airtime_transactions").update({
            status: "refunded",
            updated_at: new Date().toISOString(),
          }).eq("id", transaction.id).eq("status", "pending");
        } catch (refundError) {
          console.error("Airtime refund after queue failure failed:", refundError);
        }
        return json({ success: false, error: "Unable to queue this airtime purchase. Please try again." });
      }
    }

    const kick = fetch(`${supabaseUrl}/functions/v1/process-airtime-queue`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        apikey: serviceKey,
        "Content-Type": "application/json",
      },
      body: "{}",
    }).catch((error) => {
      console.error("Airtime worker kick failed:", error);
    });
    const runtime = (globalThis as { EdgeRuntime?: { waitUntil: (promise: Promise<unknown>) => void } }).EdgeRuntime;
    if (runtime?.waitUntil) runtime.waitUntil(kick);
    else await kick;

    return json(processingBody(reference, "pending"));
  } catch (error) {
    console.error("purchase-airtime error:", error);
    return json({ success: false, error: "Unable to start this airtime purchase. Please try again." });
  }
});
