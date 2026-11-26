import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { readPurchaseLimits, settleServicePlaceholder } from "../_shared/purchase-queue.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type PurchaseJob = {
  id: string;
  user_id: string;
  target_function: string;
  service_table: string | null;
  transaction_id: string | null;
  reference: string;
  payload: Record<string, unknown> | null;
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

async function finishJob(
  supabase: SupabaseClient,
  job: PurchaseJob,
  status: "succeeded" | "failed" | "review",
  lastError: string | null,
) {
  await supabase.from("purchase_jobs").update({
    status,
    locked_at: null,
    last_error: lastError,
    updated_at: new Date().toISOString(),
  }).eq("id", job.id).eq("status", "running");
  await settleServicePlaceholder(supabase, job.service_table, job.transaction_id, status);
}

async function handleJob(supabase: SupabaseClient, job: PurchaseJob, timeoutMs: number) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/${job.target_function}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        apikey: serviceKey,
        "Content-Type": "application/json",
        "x-queued-user-id": job.user_id,
      },
      body: JSON.stringify({
        ...(job.payload || {}),
        __process_now: true,
        __queued_reference: job.reference,
        __queued_user_id: job.user_id,
      }),
      signal: controller.signal,
    });
    const text = await response.text();
    let parsed: Record<string, unknown> = {};
    try {
      parsed = text ? JSON.parse(text) as Record<string, unknown> : {};
    } catch {
      parsed = { success: false, error: text.slice(0, 300) };
    }

    if (response.ok && parsed.success === true) {
      await finishJob(supabase, job, "succeeded", null);
      return;
    }

    if (parsed.success === false) {
      const message = typeof parsed.error === "string"
        ? parsed.error
        : typeof parsed.message === "string"
        ? parsed.message
        : "purchase_failed";
      await finishJob(supabase, job, "failed", message.slice(0, 500));
      return;
    }

    await finishJob(supabase, job, "review", `http_${response.status}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "provider_timeout";
    console.error("Purchase job outcome uncertain:", job.reference, message);
    await finishJob(supabase, job, "review", message.slice(0, 500));
  } finally {
    clearTimeout(timer);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, serviceKey);
    const limits = readPurchaseLimits(Deno.env);
    const { data, error } = await supabase.rpc("claim_purchase_jobs", {
      p_limit: limits.maxConcurrency,
      p_max_running: limits.maxConcurrency,
      p_stale_seconds: Math.ceil(limits.requestTimeoutMs / 1000) + 30,
    });

    if (error) {
      console.error("claim_purchase_jobs failed:", error);
      return json({ success: false, error: "Unable to claim purchase jobs" }, 500);
    }

    const jobs = (data || []) as PurchaseJob[];
    await Promise.all(jobs.map((job) => handleJob(supabase, job, limits.requestTimeoutMs)));

    if (jobs.length >= limits.maxConcurrency) {
      const kick = fetch(`${supabaseUrl}/functions/v1/process-purchase-queue`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${serviceKey}`,
          apikey: serviceKey,
          "Content-Type": "application/json",
        },
        body: "{}",
      }).catch((kickError) => console.error("Purchase worker chain failed:", kickError));
      const runtime = (globalThis as { EdgeRuntime?: { waitUntil: (promise: Promise<unknown>) => void } }).EdgeRuntime;
      if (runtime?.waitUntil) runtime.waitUntil(kick);
    }

    return json({ success: true, claimed: jobs.length });
  } catch (error) {
    console.error("process-purchase-queue error:", error);
    return json({ success: false, error: "Purchase worker failed" }, 500);
  }
});
