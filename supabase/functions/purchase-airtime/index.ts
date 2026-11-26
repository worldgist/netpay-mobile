import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  ebillsAirtimeServiceId,
  isProviderTemporarilyUnavailable,
  isValidAirtimePhone,
  normalizeAirtimePhone,
  parseAirtimeAmount,
  publicAirtimeStatus,
  readAirtimeLimits,
  resolveAirtimeNetwork,
  sanitizeIdempotencyKey,
  smeplugNetworkId,
} from "../_shared/airtime-flow.ts";
import { fulfillAirtimeJob, type AirtimeJob, type FulfillmentResult } from "../_shared/airtime-fulfill.ts";
import { resolveMobilenigAirtimeServiceId } from "../_shared/mobilenig-api.ts";
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

function completedBody(reference: string) {
  return {
    success: true,
    status: "SUCCESS",
    reference,
    message: "Airtime purchase completed.",
    data: { reference, status: "SUCCESS" },
  };
}

function isConfigFailure(result: FulfillmentResult): boolean {
  return /not configured|missing .*key|provider credentials/i.test(result.error || "");
}

async function applyFulfillmentResult(
  supabase: SupabaseClient,
  job: AirtimeJob,
  result: FulfillmentResult,
) {
  const now = new Date().toISOString();
  if (result.outcome === "success") {
    const { error } = await supabase.from("airtime_transactions").update({
      status: "success",
      provider_reference: result.providerReference || job.provider_reference,
      api_response: result.response ?? { success: true },
      updated_at: now,
    }).eq("id", job.transaction_id).in("status", ["pending", "processing"]);
    if (error) console.error("Airtime success update failed:", error);
    return json(completedBody(job.reference));
  }

  // Missing vendor secrets must refund — nothing was sent to a provider.
  const treatAsFailed = result.outcome === "failed" || isConfigFailure(result);
  if (treatAsFailed) {
    try {
      await creditUserWallet({
        supabase,
        userId: job.user_id,
        amount: Number(job.amount),
        transactionType: "refund",
        description: `Airtime purchase refunded — ${result.error || "provider rejected the purchase"}`,
        reference: `${job.reference}-REFUND`,
        performedBy: job.user_id,
      });
      await supabase.from("airtime_transactions").update({
        status: "refunded",
        api_response: result.response ?? { error: result.error },
        updated_at: now,
      }).eq("id", job.transaction_id).in("status", ["pending", "processing"]);
    } catch (refundError) {
      console.error("Airtime refund failed:", refundError);
      await supabase.from("airtime_transactions").update({
        status: "requires_review",
        api_response: { error: result.error, refund_error: true },
        updated_at: now,
      }).eq("id", job.transaction_id).in("status", ["pending", "processing"]);
      return json({
        success: false,
        status: "REQUIRES_REVIEW",
        reference: job.reference,
        error: "Airtime purchase could not be confirmed. Check Transactions before trying again.",
      });
    }
    const refundMessage = result.error
      ? `${result.error} Your wallet has been refunded.`
      : "Airtime purchase failed. Your wallet has been refunded.";
    return json({
      success: false,
      status: "REFUNDED",
      reference: job.reference,
      error: refundMessage,
    });
  }

  await supabase.from("airtime_transactions").update({
    status: "requires_review",
    provider_reference: result.providerReference || job.provider_reference,
    api_response: result.response ?? { error: result.error || "provider_timeout" },
    updated_at: now,
  }).eq("id", job.transaction_id).in("status", ["pending", "processing"]);
  return json({
    success: false,
    status: "REQUIRES_REVIEW",
    reference: job.reference,
    error: "We could not confirm this airtime purchase. Check Transactions before trying again.",
  });
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

    const { fetchVendingProvider } = await import("../_shared/vending-settings.ts");
    const provider = await fetchVendingProvider(supabase, "airtime_provider");

    const { data: profile } = await supabase.from("profiles").select("email").eq("id", user.id).maybeSingle();
    const demo = profile?.email === "demo@netppay.com";
    const providerRequestId = `req_${Date.now()}_${user.id.slice(0, 6)}_${crypto.randomUUID().replace(/-/g, "").slice(0, 6)}`.slice(0, 50);
    const providerTransId = String(Date.now());
    const requestedCode = typeof body.item_code === "string" && body.item_code.trim()
      ? body.item_code
      : String(body.service_id || body.network_id || "");
    const serviceId = provider === "mobilenig"
      ? resolveMobilenigAirtimeServiceId(network, requestedCode)
      : String(body.service_id || body.network_id || network);

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
        api_response: { instant: true },
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

    await supabase.from("airtime_transactions").update({
      status: "processing",
      updated_at: new Date().toISOString(),
    }).eq("id", transaction.id).eq("status", "pending");

    const limits = readAirtimeLimits({ get: (name) => Deno.env.get(name) });
    const providerReference = provider === "ebills" ? providerRequestId : provider === "mobilenig" ? providerTransId : reference;
    const job: AirtimeJob = {
      id: transaction.id,
      transaction_id: transaction.id,
      user_id: user.id,
      reference,
      provider,
      phone_number: phone,
      network,
      service_id: serviceId,
      amount,
      retry_count: 0,
      max_retries: 0,
      provider_reference: providerReference,
      payload: {
        demo,
        item_code: provider === "mobilenig"
          ? serviceId
          : (typeof body.item_code === "string" ? body.item_code : ""),
        service_id: serviceId,
        provider_request_id: providerRequestId,
        provider_trans_id: providerTransId,
        created_at: new Date().toISOString(),
      },
    };

    let result = await fulfillAirtimeJob(job, limits.requestTimeoutMs);

    // If MobileNig (or another preferred vendor) says the network is offline, try a backup
    // provider against the same wallet debit so the customer still gets airtime.
    if (
      result.outcome === "failed" &&
      isProviderTemporarilyUnavailable(result.error, result.response)
    ) {
      const fallbackProviders = ["ebills", "smeplug", "flutterwave"].filter((name) => name !== provider);
      for (const fallback of fallbackProviders) {
        const fallbackRequestId =
          `req_${Date.now()}_${user.id.slice(0, 6)}_${crypto.randomUUID().replace(/-/g, "").slice(0, 6)}`.slice(0, 50);
        const fallbackServiceId = fallback === "ebills"
          ? ebillsAirtimeServiceId(network)
          : fallback === "smeplug"
          ? String(smeplugNetworkId(network) || "")
          : network;
        if (!fallbackServiceId) continue;

        const fallbackJob: AirtimeJob = {
          ...job,
          provider: fallback,
          service_id: fallbackServiceId,
          provider_reference: fallback === "ebills"
            ? fallbackRequestId
            : fallback === "mobilenig"
            ? providerTransId
            : reference,
          payload: {
            ...job.payload,
            service_id: fallbackServiceId,
            item_code: typeof body.item_code === "string" ? body.item_code : "",
            provider_request_id: fallbackRequestId,
            fallback_from: provider,
            primary_error: result.error || null,
          },
        };

        console.log(`Airtime ${provider} unavailable for ${network}; trying ${fallback}`);
        const fallbackResult = await fulfillAirtimeJob(fallbackJob, limits.requestTimeoutMs);
        if (fallbackResult.outcome === "success") {
          await supabase.from("airtime_transactions").update({
            vending_provider: fallback,
            service_id: fallbackServiceId,
            api_response: {
              success: true,
              fallback_from: provider,
              primary_error: result.error || null,
              provider_response: fallbackResult.response ?? null,
            },
            updated_at: new Date().toISOString(),
          }).eq("id", transaction.id);
          return await applyFulfillmentResult(supabase, fallbackJob, fallbackResult);
        }

        result = {
          ...fallbackResult,
          error: fallbackResult.error || result.error,
          response: {
            primary: result.response,
            fallback_provider: fallback,
            fallback: fallbackResult.response,
          },
        };
        if (fallbackResult.outcome !== "failed") break;
      }
    }

    return await applyFulfillmentResult(supabase, job, result);
  } catch (error) {
    console.error("purchase-airtime error:", error);
    return json({ success: false, error: "Unable to start this airtime purchase. Please try again." });
  }
});
