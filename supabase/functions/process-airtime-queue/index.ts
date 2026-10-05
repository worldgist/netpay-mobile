import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { airtimeBackoffMs, canTransitionAirtimeStatus, readAirtimeLimits } from "../_shared/airtime-flow.ts";
import { fulfillAirtimeJob, type AirtimeJob } from "../_shared/airtime-fulfill.ts";
import { creditUserWallet } from "../_shared/wallet.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function updateTransaction(
  supabase: SupabaseClient,
  job: AirtimeJob,
  nextStatus: string,
  patch: Record<string, unknown>,
) {
  const { data: current } = await supabase
    .from("airtime_transactions")
    .select("status")
    .eq("id", job.transaction_id)
    .maybeSingle();
  const from = String(current?.status || "processing");
  if (!canTransitionAirtimeStatus(from, nextStatus)) {
    console.error("Rejected airtime status transition", { reference: job.reference, from, nextStatus });
    return false;
  }
  const { error } = await supabase
    .from("airtime_transactions")
    .update({ status: nextStatus, updated_at: new Date().toISOString(), ...patch })
    .eq("id", job.transaction_id)
    .eq("status", from);
  if (error) console.error("Airtime transaction update failed:", error);
  return !error;
}

async function refundOnce(supabase: SupabaseClient, job: AirtimeJob, reason: string) {
  await creditUserWallet({
    supabase,
    userId: job.user_id,
    amount: Number(job.amount),
    transactionType: "refund",
    description: `Airtime purchase refunded — ${reason}`,
    reference: `${job.reference}-REFUND`,
    performedBy: job.user_id,
  });
}

async function finishJob(
  supabase: SupabaseClient,
  job: AirtimeJob,
  status: "succeeded" | "failed" | "review" | "queued",
  patch: Record<string, unknown>,
) {
  await supabase.from("airtime_purchase_jobs").update({
    status,
    locked_at: null,
    updated_at: new Date().toISOString(),
    ...patch,
  }).eq("id", job.id).eq("status", "running");
}

async function handleJob(supabase: SupabaseClient, job: AirtimeJob, timeoutMs: number) {
  const result = await fulfillAirtimeJob(job, timeoutMs);
  if (result.outcome === "success") {
    const moved = await updateTransaction(supabase, job, "success", {
      provider_reference: result.providerReference || job.provider_reference,
      api_response: result.response ?? { success: true },
    });
    await finishJob(supabase, job, moved ? "succeeded" : "review", {
      provider_reference: result.providerReference || job.provider_reference,
      last_error: null,
    });
    return;
  }

  if (result.outcome === "failed") {
    try {
      await refundOnce(supabase, job, result.error || "provider rejected the purchase");
      await updateTransaction(supabase, job, "refunded", {
        api_response: result.response ?? { error: result.error },
      });
    } catch (error) {
      console.error("Airtime refund failed; leaving purchase for review:", error);
      await updateTransaction(supabase, job, "requires_review", {
        api_response: { error: result.error, refund_error: true },
      });
      await finishJob(supabase, job, "review", { last_error: result.error || "refund_failed" });
      return;
    }
    await finishJob(supabase, job, "failed", { last_error: result.error || "provider_failed" });
    return;
  }

  const nextRetry = job.retry_count + 1;
  if (result.outcome === "retry" && nextRetry <= job.max_retries) {
    await supabase.from("airtime_purchase_jobs").update({
      status: "queued",
      retry_count: nextRetry,
      locked_at: null,
      next_attempt_at: new Date(Date.now() + airtimeBackoffMs(nextRetry)).toISOString(),
      last_error: result.error || "retry",
      updated_at: new Date().toISOString(),
    }).eq("id", job.id).eq("status", "running");
    await supabase.from("airtime_transactions").update({
      retry_count: nextRetry,
      status: "processing",
      updated_at: new Date().toISOString(),
    }).eq("id", job.transaction_id).in("status", ["pending", "processing"]);
    return;
  }

  await updateTransaction(supabase, job, "requires_review", {
    api_response: result.response ?? { error: result.error || "provider_timeout" },
    provider_reference: result.providerReference || job.provider_reference,
  });
  await finishJob(supabase, job, "review", { last_error: result.error || "requires_review" });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const supabase = createClient(supabaseUrl, serviceKey);
  const limits = readAirtimeLimits({ get: (name) => Deno.env.get(name) });

  const { data: claimed, error } = await supabase.rpc("claim_airtime_purchase_jobs", {
    p_limit: limits.maxConcurrency,
    p_max_running: limits.maxConcurrency,
    p_stale_seconds: Math.ceil(limits.requestTimeoutMs / 1000) * 2,
  });

  if (error) {
    console.error("Airtime claim failed:", error);
    return new Response(JSON.stringify({ success: false, error: "Queue unavailable" }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  const jobs = (Array.isArray(claimed) ? claimed : []) as AirtimeJob[];
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limits.maxConcurrency, jobs.length) }, async () => {
    while (cursor < jobs.length) {
      const index = cursor;
      cursor += 1;
      const row = jobs[index];
      if (!row) return;
      const job: AirtimeJob = {
        ...row,
        amount: Number(row.amount),
        payload: (row.payload && typeof row.payload === "object" ? row.payload : {}) as Record<string, unknown>,
      };
      try {
        await handleJob(supabase, job, limits.requestTimeoutMs);
      } catch (jobError) {
        console.error("Airtime job crashed:", job.reference, jobError);
        await finishJob(supabase, job, "review", {
          last_error: jobError instanceof Error ? jobError.message : "worker_error",
        });
        await updateTransaction(supabase, job, "requires_review", {});
      }
    }
  });
  await Promise.all(workers);

  if (jobs.length >= limits.maxConcurrency) {
    const kick = fetch(`${supabaseUrl}/functions/v1/process-airtime-queue`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        apikey: serviceKey,
        "Content-Type": "application/json",
      },
      body: "{}",
    }).catch((kickError) => console.error("Airtime worker chain failed:", kickError));
    const runtime = (globalThis as { EdgeRuntime?: { waitUntil: (promise: Promise<unknown>) => void } }).EdgeRuntime;
    if (runtime?.waitUntil) runtime.waitUntil(kick);
  }

  return new Response(JSON.stringify({ success: true, claimed: jobs.length }), {
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
});
