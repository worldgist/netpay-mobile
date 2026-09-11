import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { EBillsPurchaseResponse } from "./ebills-api.ts";
import { requeryEBillsOrder } from "./ebills-api.ts";
import { getEbillsOrderStatus, refundPurchaseWallet, type EbillsOrderStatus } from "./purchase-refund.ts";
import { sendPushNotification } from "./push-notifications.ts";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export type EbillsPurchaseResolution = {
  purchaseResult: EBillsPurchaseResponse;
  orderStatus: EbillsOrderStatus;
  polled: boolean;
  timedOut: boolean;
};

/** Poll eBills requery until order completes, fails, refunds, or timeout. */
export async function resolveEbillsPurchaseResult(
  token: string,
  requestId: string,
  initialResult: EBillsPurchaseResponse,
  options?: { maxWaitMs?: number; intervalMs?: number },
): Promise<EbillsPurchaseResolution> {
  let purchaseResult = initialResult;
  let orderStatus = getEbillsOrderStatus(purchaseResult);

  if (orderStatus.isCompleted || orderStatus.shouldRefund || !orderStatus.isProcessing) {
    return { purchaseResult, orderStatus, polled: false, timedOut: false };
  }

  const maxWaitMs = options?.maxWaitMs ?? 90_000;
  const intervalMs = options?.intervalMs ?? 3_000;
  const deadline = Date.now() + maxWaitMs;
  let polled = false;

  while (Date.now() < deadline) {
    await sleep(intervalMs);
    polled = true;
    try {
      purchaseResult = await requeryEBillsOrder(token, requestId);
      orderStatus = getEbillsOrderStatus(purchaseResult);
      if (orderStatus.isCompleted || orderStatus.shouldRefund || !orderStatus.isProcessing) {
        return { purchaseResult, orderStatus, polled, timedOut: false };
      }
    } catch (pollError) {
      console.warn("eBills requery poll failed:", pollError);
    }
  }

  return { purchaseResult, orderStatus, polled, timedOut: true };
}

export type EbillsTableConfig = {
  table: string;
  productLabel: string;
  completedStatus: string;
  failedStatus: string;
  refundedStatus: string;
};

export const EBILLS_TABLES: EbillsTableConfig[] = [
  {
    table: "cable_tv_transactions",
    productLabel: "Cable TV purchase",
    completedStatus: "success",
    failedStatus: "failed",
    refundedStatus: "refunded",
  },
  {
    table: "data_transactions",
    productLabel: "Data purchase",
    completedStatus: "success",
    failedStatus: "failed",
    refundedStatus: "refunded",
  },
  {
    table: "airtime_transactions",
    productLabel: "Airtime purchase",
    completedStatus: "success",
    failedStatus: "failed",
    refundedStatus: "refunded",
  },
  {
    table: "electricity_transactions",
    productLabel: "Electricity purchase",
    completedStatus: "completed",
    failedStatus: "failed",
    refundedStatus: "refunded",
  },
  {
    table: "betting_transactions",
    productLabel: "Betting purchase",
    completedStatus: "completed",
    failedStatus: "failed",
    refundedStatus: "refunded",
  },
];

const REFUND_REF_SUFFIXES = ["REQUERY-REF", "REF", "VENDOR-FAIL", "STALE-REF", "WEBHOOK-REF", "POLL-REF"];

export function isEbillsRow(row: Record<string, unknown>): boolean {
  const vendor = String(row.vending_provider ?? row.provider ?? "").toLowerCase();
  if (vendor === "ebills" || vendor === "ebills.africa") return true;
  const reference = String(row.reference ?? "");
  return /ebills/i.test(reference) || reference.startsWith("req_");
}

export async function hasWalletRefundForPurchase(
  supabase: SupabaseClient,
  userId: string,
  purchaseReference: string,
): Promise<boolean> {
  for (const suffix of REFUND_REF_SUFFIXES) {
    const { data } = await supabase
      .from("user_transactions")
      .select("id")
      .eq("user_id", userId)
      .eq("reference", `${purchaseReference}-${suffix}`)
      .maybeSingle();
    if (data) return true;
  }
  return false;
}

/** User was debited and not yet credited back via a refund ledger entry. */
export function isWalletStillDebited(row: Record<string, unknown>): boolean {
  const balanceBefore = Number(row.balance_before);
  const balanceAfter = Number(row.balance_after);
  const amount = Number(row.amount);
  if (!Number.isFinite(balanceBefore) || !Number.isFinite(balanceAfter) || amount <= 0) {
    return true;
  }
  return balanceAfter <= balanceBefore - amount + 0.001;
}

export type EbillsReconcileResult = {
  reference: string;
  table: string;
  action: "completed" | "refunded" | "already_refunded" | "still_processing" | "skipped";
  wallet_refunded?: boolean;
  reason?: string;
};

export async function reconcileEbillsTransactionRow(
  supabase: SupabaseClient,
  config: EbillsTableConfig,
  row: Record<string, unknown>,
  requeryResult: EBillsPurchaseResponse,
  refSuffix = "REQUERY-REF",
): Promise<EbillsReconcileResult> {
  const reference = String(row.reference ?? "");
  const userId = String(row.user_id ?? "");
  const amount = Number(row.amount) || 0;
  const orderStatus = getEbillsOrderStatus(requeryResult);

  if (orderStatus.isCompleted) {
    const updatePayload: Record<string, unknown> = {
      status: config.completedStatus,
      api_response: {
        ...(typeof row.api_response === "object" && row.api_response ? row.api_response : {}),
        requery: requeryResult,
        requeried_at: new Date().toISOString(),
      },
    };

    if (config.table === "electricity_transactions" && requeryResult.data?.token) {
      updatePayload.token = String(requeryResult.data.token);
    }

    await supabase.from(config.table).update(updatePayload).eq("id", row.id);

    await sendPushNotification(
      supabase,
      userId,
      `${config.productLabel} completed`,
      `Your ${config.productLabel.toLowerCase()} (${reference}) has been delivered successfully.`,
      { type: "purchase_completed", reference, table: config.table },
    );

    return { reference, table: config.table, action: "completed" };
  }

  if (orderStatus.shouldRefund) {
    const newStatus = orderStatus.isRefunded ? config.refundedStatus : config.failedStatus;
    const reason = orderStatus.isRefunded
      ? "provider refunded order"
      : orderStatus.isFailed
        ? "provider reported order failed"
        : "provider rejected order";

    const alreadyRefunded = await hasWalletRefundForPurchase(supabase, userId, reference);
    let walletRefunded = alreadyRefunded;

    if (!alreadyRefunded && isWalletStillDebited(row)) {
      walletRefunded = await refundPurchaseWallet({
        supabase,
        userId,
        amount,
        purchaseReference: reference,
        productLabel: config.productLabel,
        reason,
        refSuffix,
      });
    }

    await supabase.from(config.table).update({
      status: newStatus,
      balance_after: walletRefunded || alreadyRefunded
        ? Number(row.balance_before) || row.balance_after
        : row.balance_after,
      api_response: {
        ...(typeof row.api_response === "object" && row.api_response ? row.api_response : {}),
        requery: requeryResult,
        requeried_at: new Date().toISOString(),
        wallet_refunded: walletRefunded || alreadyRefunded,
      },
    }).eq("id", row.id);

    if (walletRefunded && !alreadyRefunded) {
      await sendPushNotification(
        supabase,
        userId,
        `${config.productLabel} refunded`,
        `₦${amount.toFixed(2)} has been credited back. ${config.productLabel} (${reference}) did not complete.`,
        { type: "purchase_refund", reference, table: config.table },
      );
    }

    return {
      reference,
      table: config.table,
      action: alreadyRefunded ? "already_refunded" : "refunded",
      wallet_refunded: walletRefunded || alreadyRefunded,
      reason,
    };
  }

  await supabase.from(config.table).update({
    api_response: {
      ...(typeof row.api_response === "object" && row.api_response ? row.api_response : {}),
      requery: requeryResult,
      requeried_at: new Date().toISOString(),
    },
  }).eq("id", row.id);

  return {
    reference,
    table: config.table,
    action: "still_processing",
    reason: requeryResult.message ?? requeryResult.data?.status ?? undefined,
  };
}

export async function findEbillsTransaction(
  supabase: SupabaseClient,
  options: { reference?: string; orderId?: number | string },
): Promise<{ config: EbillsTableConfig; row: Record<string, unknown> } | null> {
  const reference = options.reference?.trim();
  const orderId = options.orderId != null ? String(options.orderId) : "";

  for (const config of EBILLS_TABLES) {
    if (reference) {
      const { data } = await supabase.from(config.table).select("*").eq("reference", reference).maybeSingle();
      if (data && isEbillsRow(data as Record<string, unknown>)) {
        return { config, row: data as Record<string, unknown> };
      }
    }

    if (orderId) {
      const { data: rows } = await supabase.from(config.table).select("*").limit(20);
      for (const row of rows || []) {
        const record = row as Record<string, unknown>;
        if (!isEbillsRow(record)) continue;
        const api = record.api_response as Record<string, unknown> | null;
        const apiData = api?.data as Record<string, unknown> | undefined;
        const storedOrderId = String(apiData?.order_id ?? api?.order_id ?? "");
        if (storedOrderId === orderId) {
          return { config, row: record };
        }
      }
    }
  }

  return null;
}
