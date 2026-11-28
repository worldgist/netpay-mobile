import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  corsHeaders,
  createServiceClient,
  jsonResponse,
  requireAdmin,
} from "../_shared/admin-auth.ts";
import {
  getPlustiveTransaction,
  mapPlustiveStatus,
  type PlustiveTransaction,
} from "../_shared/plustive-api.ts";
import { refundPurchaseWallet } from "../_shared/purchase-refund.ts";

type ServiceConfig = {
  key: string;
  table: string;
  successStatus: string;
  failedStatus: string;
  label: string;
};

const SERVICES: ServiceConfig[] = [
  { key: "airtime", table: "airtime_transactions", successStatus: "success", failedStatus: "refunded", label: "Airtime" },
  { key: "data", table: "data_transactions", successStatus: "success", failedStatus: "failed", label: "Data" },
  { key: "electricity", table: "electricity_transactions", successStatus: "completed", failedStatus: "failed", label: "Electricity" },
  { key: "cable", table: "cable_tv_transactions", successStatus: "completed", failedStatus: "failed", label: "Cable TV" },
  { key: "education", table: "education_transactions", successStatus: "completed", failedStatus: "failed", label: "Education" },
];

function serviceKey(value: unknown): string {
  const key = String(value || "").toLowerCase().replace(/[^a-z]/g, "");
  if (key.includes("cable")) return "cable";
  if (key.includes("elect")) return "electricity";
  if (key.includes("educ")) return "education";
  if (key.includes("data")) return "data";
  if (key.includes("air")) return "airtime";
  return "";
}

function lookupRefs(row: Record<string, unknown>): string[] {
  const api = row.api_response && typeof row.api_response === "object"
    ? row.api_response as Record<string, unknown>
    : {};
  const refs = [api.clientReference, row.reference, api.reference, row.provider_reference]
    .map((value) => String(value || "").trim())
    .filter(Boolean);
  return [...new Set(refs)];
}

function providerStatusOf(row: Record<string, unknown>): string {
  const api = row.api_response && typeof row.api_response === "object"
    ? row.api_response as Record<string, unknown>
    : {};
  return String(api.status || "");
}

function needsLaterCheck(row: Record<string, unknown>): boolean {
  const status = String(row.status || "").toLowerCase();
  if (status === "failed" || status === "refunded") return false;
  const providerStatus = providerStatusOf(row).toLowerCase();
  if (status === "pending" || status === "processing" || status === "requires_review") return true;
  return providerStatus === "processing" || providerStatus === "pending";
}

async function findRows(
  supabase: SupabaseClient,
  reference: string,
  service: string,
): Promise<Array<{ config: ServiceConfig; row: Record<string, unknown> }>> {
  const configs = service
    ? SERVICES.filter((item) => item.key === service)
    : SERVICES;
  if (reference) {
    const found: Array<{ config: ServiceConfig; row: Record<string, unknown> }> = [];
    for (const config of configs) {
      const { data } = await supabase
        .from(config.table)
        .select("*")
        .eq("reference", reference)
        .limit(5);
      for (const row of data || []) found.push({ config, row: row as Record<string, unknown> });
      if (config.table === "airtime_transactions") {
        const { data: byProvider } = await supabase
          .from(config.table)
          .select("*")
          .eq("provider_reference", reference)
          .limit(5);
        for (const row of byProvider || []) {
          if (!found.some((item) => item.row.id === (row as { id: string }).id)) {
            found.push({ config, row: row as Record<string, unknown> });
          }
        }
      }
    }
    return found;
  }

  const found: Array<{ config: ServiceConfig; row: Record<string, unknown> }> = [];
  for (const config of configs) {
    const { data } = await supabase
      .from(config.table)
      .select("*")
      .eq("vending_provider", "plustive")
      .order("created_at", { ascending: false })
      .limit(80);
    for (const row of data || []) {
      const record = row as Record<string, unknown>;
      if (needsLaterCheck(record)) found.push({ config, row: record });
    }
  }
  return found.slice(0, 40);
}

async function lookupTransaction(refs: string[]): Promise<PlustiveTransaction | null> {
  for (const ref of refs) {
    const found = await getPlustiveTransaction(ref);
    if (found) return found;
  }
  return null;
}

async function applyTransaction(
  supabase: SupabaseClient,
  config: ServiceConfig,
  row: Record<string, unknown>,
  transaction: PlustiveTransaction | null,
): Promise<Record<string, unknown>> {
  const current = String(row.status || "").toLowerCase();
  const previousApi = row.api_response && typeof row.api_response === "object"
    ? row.api_response as Record<string, unknown>
    : {};
  const reference = String(row.reference || "");

  if (!transaction) {
    const createdAt = new Date(String(row.created_at || 0)).getTime();
    const oldEnough = Number.isFinite(createdAt) && Date.now() - createdAt > 2 * 60 * 1000;
    const open = current === "pending" || current === "processing" || current === "requires_review";
    if (open && oldEnough) {
      const refunded = await refundPurchaseWallet({
        supabase,
        userId: String(row.user_id),
        amount: Number(row.amount),
        purchaseReference: reference,
        productLabel: config.label,
        reason: "Plustive has no transaction for this purchase",
        refSuffix: "PLS-REF",
        performedBy: String(row.user_id),
      });
      const status = refunded ? config.failedStatus : "requires_review";
      await supabase.from(config.table).update({
        status,
        api_response: { ...previousApi, checked_at: new Date().toISOString(), provider_status: "not_found" },
      }).eq("id", row.id);
      return {
        reference,
        service: config.label,
        previousStatus: current,
        status,
        providerStatus: "not_found",
        refunded,
        message: refunded ? "No Plustive transaction. Wallet refunded." : "No Plustive transaction. Refund needs review.",
      };
    }
    return {
      reference,
      service: config.label,
      previousStatus: current,
      status: current,
      providerStatus: "not_found",
      refunded: false,
      message: "Plustive has no matching transaction yet.",
    };
  }

  const mapped = mapPlustiveStatus(transaction.status);
  const update: Record<string, unknown> = {
    api_response: {
      ...previousApi,
      ...transaction,
      clientReference: transaction.clientReference || previousApi.clientReference || reference,
      checked_at: new Date().toISOString(),
    },
  };

  if (mapped === "pending") {
    await supabase.from(config.table).update(update).eq("id", row.id);
    return {
      reference,
      service: config.label,
      previousStatus: current,
      status: current,
      providerStatus: "Processing",
      refunded: false,
      message: "Still processing at Plustive.",
    };
  }

  if (mapped === "failed") {
    const alreadyFailed = current === "failed" || current === "refunded";
    const refunded = alreadyFailed ? false : await refundPurchaseWallet({
      supabase,
      userId: String(row.user_id),
      amount: Number(row.amount),
      purchaseReference: reference,
      productLabel: config.label,
      reason: transaction.failureReason || "Plustive reported the purchase failed",
      refSuffix: "PLS-REF",
      performedBy: String(row.user_id),
    });
    update.status = alreadyFailed ? current : refunded ? config.failedStatus : "requires_review";
    await supabase.from(config.table).update(update).eq("id", row.id);
    if (config.table === "airtime_transactions") {
      await supabase.from("airtime_purchase_jobs").update({
        status: refunded || alreadyFailed ? "failed" : "review",
        locked_at: null,
        updated_at: new Date().toISOString(),
      }).eq("reference", reference);
    }
    return {
      reference,
      service: config.label,
      previousStatus: current,
      status: update.status,
      providerStatus: "Failed",
      refunded,
      message: alreadyFailed
        ? "Already marked failed."
        : refunded
        ? "Plustive failed this purchase. Wallet refunded."
        : "Plustive failed this purchase. Refund needs review.",
    };
  }

  update.status = config.successStatus;
  if (config.table === "airtime_transactions" && transaction.reference) {
    update.provider_reference = transaction.reference;
  }
  if (config.table === "electricity_transactions" && transaction.token) {
    update.token = transaction.token;
  }
  if (config.table === "education_transactions" && transaction.token && !row.pin) {
    update.pin = transaction.token;
  }
  await supabase.from(config.table).update(update).eq("id", row.id);
  return {
    reference,
    service: config.label,
    previousStatus: current,
    status: config.successStatus,
    providerStatus: "Success",
    refunded: false,
    message: "Plustive confirmed this purchase.",
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const supabase = createServiceClient();
    await requireAdmin(req, supabase);
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const reference = String(body.reference || "").trim();
    const service = serviceKey(body.service);
    const rows = await findRows(supabase, reference, service);
    if (reference && rows.length === 0) {
      return jsonResponse({ success: false, error: "Plustive transaction not found in NetPay" });
    }

    const results = [];
    for (const item of rows) {
      const transaction = await lookupTransaction(lookupRefs(item.row));
      results.push(await applyTransaction(supabase, item.config, item.row, transaction));
    }

    return jsonResponse({
      success: true,
      data: reference ? results[0] : { checked: results.length, results },
    });
  } catch (error) {
    console.error("check-plustive-transaction error:", error);
    const message = error instanceof Error ? error.message : "Failed to check Plustive transaction";
    return jsonResponse({ success: false, error: message });
  }
});
