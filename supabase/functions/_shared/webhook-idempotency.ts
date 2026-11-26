import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const STALE_PROCESSING_MS = 3 * 60 * 1000;
const MAX_EVENT_ID_LENGTH = 512;

export type WebhookClaimResult =
  | { action: "process"; rowId: string }
  | { action: "skip"; reason: "already_completed" | "in_flight"; rowId: string };

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function normalizeWebhookEventId(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "unknown";
  return trimmed.length > MAX_EVENT_ID_LENGTH
    ? trimmed.slice(0, MAX_EVENT_ID_LENGTH)
    : trimmed;
}

export async function buildFallbackEventId(rawBody: string): Promise<string> {
  const hash = await sha256Hex(rawBody);
  return `body:${hash.slice(0, 32)}`;
}

export function buildFlutterwaveEventId(
  payload: Record<string, unknown>,
  fallbackId: string,
): string {
  const event = String(payload.event || payload.type || "event");
  const data = (payload.data || {}) as Record<string, unknown>;
  const stable = data.id ?? data.tx_ref ?? data.flw_ref ?? data.transaction_id;
  return normalizeWebhookEventId(`${event}:${stable ?? fallbackId}`);
}

export function buildEbillsEventId(payload: Record<string, unknown>): string {
  const orderId = payload.order_id ?? "na";
  const requestId = payload.request_id ?? "na";
  const status = payload.status ?? "na";
  return normalizeWebhookEventId(`ebills:${orderId}:${requestId}:${status}`);
}

export function buildSmeplugEventId(
  payload: Record<string, unknown>,
  reference: string,
): string {
  const data = payload.data && typeof payload.data === "object"
    ? payload.data as Record<string, unknown>
    : null;
  const status = String(payload.status ?? data?.status ?? "na");
  const stableId =
    payload.id ??
    payload.transaction_id ??
    payload.transId ??
    data?.id ??
    data?.transaction_id ??
    reference;
  return normalizeWebhookEventId(`smeplug:${stableId}:${reference}:${status}`);
}

export function buildPayvesselEventId(
  payload: Record<string, unknown>,
  reference: string | null | undefined,
  amount: number | null | undefined,
): string {
  const event = String(payload.event || payload.event_type || payload.type || "event");
  const nested = payload.data && typeof payload.data === "object"
    ? payload.data as Record<string, unknown>
    : null;
  const stableId =
    payload.id ??
    payload.transaction_id ??
    nested?.id ??
    nested?.transaction_id ??
    reference;
  const amountPart = amount != null && Number.isFinite(amount) ? String(amount) : "na";
  return normalizeWebhookEventId(`${event}:${stableId ?? amountPart}:${reference ?? "na"}`);
}

export async function claimWebhookEvent(
  supabase: SupabaseClient,
  provider: string,
  eventId: string,
  payload: unknown,
): Promise<WebhookClaimResult> {
  const normalizedProvider = provider.trim().toLowerCase();
  const normalizedEventId = normalizeWebhookEventId(eventId);

  const { data: inserted, error: insertError } = await supabase
    .from("provider_webhook_events")
    .insert({
      provider: normalizedProvider,
      event_id: normalizedEventId,
      payload,
      status: "processing",
    })
    .select("id")
    .maybeSingle();

  if (!insertError && inserted?.id) {
    return { action: "process", rowId: inserted.id };
  }

  if (insertError?.code !== "23505") {
    console.error("provider_webhook_events insert failed:", insertError);
    throw insertError ?? new Error("Failed to claim webhook event");
  }

  const { data: existing, error: selectError } = await supabase
    .from("provider_webhook_events")
    .select("id, status, created_at")
    .eq("provider", normalizedProvider)
    .eq("event_id", normalizedEventId)
    .maybeSingle();

  if (selectError || !existing) {
    return { action: "process", rowId: "" };
  }

  if (existing.status === "completed") {
    return { action: "skip", reason: "already_completed", rowId: existing.id };
  }

  const ageMs = Date.now() - new Date(String(existing.created_at)).getTime();
  if (existing.status === "processing" && ageMs < STALE_PROCESSING_MS) {
    return { action: "skip", reason: "in_flight", rowId: existing.id };
  }

  await supabase
    .from("provider_webhook_events")
    .update({
      status: "processing",
      payload,
      error_message: null,
      processed_at: null,
    })
    .eq("id", existing.id);

  return { action: "process", rowId: existing.id };
}

export async function completeWebhookEvent(
  supabase: SupabaseClient,
  rowId: string,
  result: Record<string, unknown>,
): Promise<void> {
  if (!rowId) return;
  await supabase
    .from("provider_webhook_events")
    .update({
      status: "completed",
      result,
      processed_at: new Date().toISOString(),
      error_message: null,
    })
    .eq("id", rowId);
}

export async function failWebhookEvent(
  supabase: SupabaseClient,
  rowId: string,
  errorMessage: string,
  result?: Record<string, unknown>,
): Promise<void> {
  if (!rowId) return;
  await supabase
    .from("provider_webhook_events")
    .update({
      status: "failed",
      error_message: errorMessage.slice(0, 2000),
      result: result ?? null,
      processed_at: new Date().toISOString(),
    })
    .eq("id", rowId);
}

/** Acknowledge webhook quickly; run heavy work in the background when supported. */
export function scheduleWebhookWork(work: Promise<void>): void {
  const runtime = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } })
    .EdgeRuntime;
  if (runtime?.waitUntil) {
    runtime.waitUntil(work);
    return;
  }
  work.catch((error) => console.error("Webhook background work failed:", error));
}

export function webhookJsonResponse(
  body: Record<string, unknown>,
  status = 200,
  extraHeaders: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...extraHeaders,
    },
  });
}
