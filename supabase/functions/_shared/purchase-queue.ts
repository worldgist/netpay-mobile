import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sanitizeIdempotencyKey } from "./airtime-flow.ts";

export const QUEUED_USER_HEADER = "x-queued-user-id";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REFERENCE_RE = /^NP-(DATA|CABLE|ELEC|EDU|BET)-[A-F0-9]{12}$/;

export type BillService = "data" | "cable" | "electricity" | "education" | "betting";

const PREFIX: Record<BillService, string> = {
  data: "NP-DATA",
  cable: "NP-CABLE",
  electricity: "NP-ELEC",
  education: "NP-EDU",
  betting: "NP-BET",
};

const TARGET: Record<BillService, string> = {
  data: "purchase-data",
  cable: "purchase-cable-tv",
  electricity: "purchase-electricity",
  education: "purchase-education",
  betting: "purchase-ebills-betting",
};

const SERVICE_TABLE: Record<BillService, string> = {
  data: "data_transactions",
  cable: "cable_tv_transactions",
  electricity: "electricity_transactions",
  education: "education_transactions",
  betting: "betting_transactions",
};

const LABEL: Record<BillService, string> = {
  data: "data",
  cable: "cable TV",
  electricity: "electricity",
  education: "education",
  betting: "betting",
};

export function readPurchaseLimits(env: { get(name: string): string | undefined }) {
  const concurrency = Number(env.get("PURCHASE_MAX_CONCURRENCY") || env.get("AIRTIME_MAX_CONCURRENCY") || "8");
  const timeout = Number(env.get("PURCHASE_REQUEST_TIMEOUT") || "55000");
  const retries = Number(env.get("PURCHASE_MAX_RETRIES") || env.get("AIRTIME_MAX_RETRIES") || "4");
  return {
    maxConcurrency: Number.isFinite(concurrency) ? Math.min(Math.max(Math.floor(concurrency), 1), 50) : 8,
    requestTimeoutMs: Number.isFinite(timeout) ? Math.min(Math.max(Math.floor(timeout), 3000), 60000) : 55000,
    maxRetries: Number.isFinite(retries) ? Math.min(Math.max(Math.floor(retries), 1), 8) : 4,
  };
}

function bearer(req: Request): string {
  return (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
}

export function isServiceRoleRequest(req: Request): boolean {
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const token = bearer(req);
  return key.length > 20 && token === key;
}

/** Set only for the worker replay. A user JWT cannot impersonate another account. */
export function queuedUserId(req: Request): string {
  if (!isServiceRoleRequest(req)) return "";
  const userId = (req.headers.get(QUEUED_USER_HEADER) || "").trim();
  return UUID_RE.test(userId) ? userId : "";
}

export function purchaseReference(
  req: Request,
  body: { __queued_reference?: unknown } | null | undefined,
  generated: string,
): string {
  if (!queuedUserId(req)) return generated;
  const queued = typeof body?.__queued_reference === "string" ? body.__queued_reference.trim() : "";
  return REFERENCE_RE.test(queued) ? queued : generated;
}

export function forwardPurchaseHeaders(req: Request, authorization: string): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: authorization,
    "Content-Type": "application/json",
  };
  const userId = queuedUserId(req);
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (userId && serviceKey) {
    headers.Authorization = `Bearer ${serviceKey}`;
    headers.apikey = serviceKey;
    headers[QUEUED_USER_HEADER] = userId;
  }
  return headers;
}

export function forwardPurchaseFields(
  req: Request,
  source: { __queued_reference?: unknown } | null | undefined,
  fields: Record<string, unknown>,
): Record<string, unknown> {
  const userId = queuedUserId(req);
  const reference = typeof source?.__queued_reference === "string" ? source.__queued_reference.trim() : "";
  if (!userId || !REFERENCE_RE.test(reference)) return fields;
  return { ...fields, __queued_reference: reference, __process_now: true };
}

export async function referenceFor(service: BillService, userId: string, idempotencyKey: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`${service}:${userId}:${idempotencyKey}`),
  );
  const hex = Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${PREFIX[service]}-${hex.slice(0, 12).toUpperCase()}`;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function stablePayload(body: Record<string, unknown>): Record<string, unknown> {
  const copy: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body)) {
    if (key.startsWith("__")) continue;
    copy[key] = value;
  }
  return copy;
}

function fingerprint(body: Record<string, unknown>): string {
  const copy = stablePayload(body);
  delete copy.idempotency_key;
  delete copy.request_id;
  const keys = Object.keys(copy).sort();
  return JSON.stringify(keys.map((key) => [key, copy[key]]));
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, idempotency-key, x-queued-user-id",
};

export function purchaseJson(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function processingBody(service: BillService, reference: string, status: string) {
  const label = LABEL[service];
  const normalized = status.trim().toLowerCase();
  const publicStatus = normalized === "succeeded"
    ? "SUCCESS"
    : normalized === "failed"
    ? "FAILED"
    : normalized === "review"
    ? "REQUIRES_REVIEW"
    : "PROCESSING";
  const message = publicStatus === "SUCCESS"
    ? `Your ${label} purchase is complete.`
    : publicStatus === "FAILED"
    ? `Your ${label} purchase could not be completed. If your wallet was debited, it has been refunded.`
    : publicStatus === "REQUIRES_REVIEW"
    ? `Your ${label} purchase is being verified. You can leave this screen. Reference: ${reference}`
    : `Processing ${label} purchase... You can leave this screen. Reference: ${reference}`;
  return {
    success: publicStatus !== "FAILED",
    status: publicStatus,
    pending: publicStatus === "PROCESSING" || publicStatus === "REQUIRES_REVIEW",
    reference,
    message,
    data: { reference, status: publicStatus },
  };
}

function serviceClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL") || "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
  );
}

async function kickPurchaseWorker() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!supabaseUrl || !serviceKey) return;
  const kick = fetch(`${supabaseUrl}/functions/v1/process-purchase-queue`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
      "Content-Type": "application/json",
    },
    body: "{}",
  }).catch((error) => {
    console.error("Purchase worker kick failed:", error);
  });
  const runtime = (globalThis as { EdgeRuntime?: { waitUntil: (promise: Promise<unknown>) => void } }).EdgeRuntime;
  if (runtime?.waitUntil) runtime.waitUntil(kick);
  else await kick;
}

export async function enqueueBillPurchase(options: {
  req: Request;
  supabase: SupabaseClient;
  userId: string;
  service: BillService;
  body: Record<string, unknown>;
  amount: number;
  pendingRow?: Record<string, unknown> | null;
}): Promise<Response> {
  const { req, userId, service, body, pendingRow } = options;
  const supabase = serviceClient();
  const amount = roundMoney(Number(options.amount));
  if (!Number.isFinite(amount) || amount <= 0) {
    return purchaseJson({ success: false, error: "Enter a valid amount." });
  }

  const idempotencyKey = sanitizeIdempotencyKey(
    req.headers.get("Idempotency-Key") || body.idempotency_key || body.request_id,
  ) || `srv-${crypto.randomUUID()}`;
  const reference = await referenceFor(service, userId, idempotencyKey);
  const print = fingerprint(body);
  const limits = readPurchaseLimits(Deno.env);
  const payload = stablePayload(body);

  const { data: existing } = await supabase
    .from("purchase_jobs")
    .select("reference, status, fingerprint, amount")
    .eq("user_id", userId)
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();

  if (existing) {
    if (existing.fingerprint !== print || Math.abs(Number(existing.amount) - amount) > 0.01) {
      return purchaseJson({ success: false, error: "This purchase request was already used with different details." });
    }
    return purchaseJson(processingBody(service, String(existing.reference), String(existing.status)));
  }

  let transactionId: string | null = null;
  if (pendingRow) {
    const { data: inserted, error } = await supabase
      .from(SERVICE_TABLE[service])
      .insert({
        ...pendingRow,
        user_id: userId,
        reference,
        status: "processing",
        amount,
      })
      .select("id")
      .single();
    if (error) console.error("Pending purchase row insert failed:", error.message);
    else transactionId = inserted?.id ?? null;
  }

  const { error: jobError } = await supabase.from("purchase_jobs").insert({
    user_id: userId,
    service,
    target_function: TARGET[service],
    service_table: SERVICE_TABLE[service],
    transaction_id: transactionId,
    reference,
    idempotency_key: idempotencyKey,
    fingerprint: print,
    amount,
    payload,
    max_retries: limits.maxRetries,
  });

  if (jobError) {
    const { data: raced } = await supabase
      .from("purchase_jobs")
      .select("reference, status, fingerprint, amount")
      .eq("user_id", userId)
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();
    if (raced) {
      if (raced.fingerprint !== print || Math.abs(Number(raced.amount) - amount) > 0.01) {
        return purchaseJson({ success: false, error: "This purchase request was already used with different details." });
      }
      return purchaseJson(processingBody(service, String(raced.reference), String(raced.status)));
    }
    console.error("purchase job insert failed:", jobError);
    return purchaseJson({ success: false, error: "Unable to queue this purchase. Please try again." });
  }

  await kickPurchaseWorker();
  return purchaseJson(processingBody(service, reference, "queued"));
}

/** Returns a response when the request should stop. Null means the worker should run the purchase. */
export async function beginBillPurchase(options: {
  req: Request;
  supabase: SupabaseClient;
  userId: string;
  service: BillService;
  body: Record<string, unknown>;
  amount: number;
  pendingRow?: Record<string, unknown> | null;
}): Promise<Response | null> {
  if (options.body.__process_now === true) {
    if (!queuedUserId(options.req)) {
      return purchaseJson({ success: false, error: "Unauthorized" }, 401);
    }
    return null;
  }
  return enqueueBillPurchase(options);
}

export async function settleServicePlaceholder(
  supabase: SupabaseClient,
  table: string | null,
  transactionId: string | null,
  outcome: "succeeded" | "failed" | "review",
) {
  const allowed = new Set(Object.values(SERVICE_TABLE));
  if (!table || !transactionId || !allowed.has(table)) return;
  if (outcome === "succeeded") {
    const { error } = await supabase
      .from(table)
      .delete()
      .eq("id", transactionId)
      .in("status", ["pending", "processing"]);
    if (error) console.error("Placeholder delete failed:", error.message);
    return;
  }
  const status = outcome === "failed" ? "failed" : "requires_review";
  const { error } = await supabase
    .from(table)
    .update({ status })
    .eq("id", transactionId)
    .in("status", ["pending", "processing"]);
  if (error) console.error("Placeholder status update failed:", error.message);
}
