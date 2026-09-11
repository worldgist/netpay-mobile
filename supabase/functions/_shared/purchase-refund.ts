import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { creditUserWallet } from "./wallet.ts";

export type RefundPurchaseOptions = {
  supabase: SupabaseClient;
  userId: string;
  amount: number;
  purchaseReference: string;
  productLabel: string;
  reason: string;
  refSuffix?: string;
  performedBy?: string;
};

/** Credit wallet when a pay-bill purchase failed after the user was debited. Idempotent per ref suffix. */
export async function refundPurchaseWallet(options: RefundPurchaseOptions): Promise<boolean> {
  const {
    supabase,
    userId,
    amount,
    purchaseReference,
    productLabel,
    reason,
    refSuffix = "REF",
    performedBy,
  } = options;

  try {
    await creditUserWallet({
      supabase,
      userId,
      amount,
      transactionType: "refund",
      description: `${productLabel} refunded — ${reason}`,
      reference: `${purchaseReference}-${refSuffix}`,
      performedBy: performedBy ?? userId,
    });
    return true;
  } catch (refundError) {
    console.error("CRITICAL: purchase refund failed; manual reconciliation required.", {
      refundError,
      userId,
      purchaseReference,
      amount,
      productLabel,
      reason,
    });
    return false;
  }
}

export type EbillsOrderStatus = {
  isProcessing: boolean;
  isCompleted: boolean;
  isRefunded: boolean;
  isFailed: boolean;
  shouldRefund: boolean;
};

/** eBills order statuses: refund when failed/refunded; keep debit when processing or completed. */
export function getEbillsOrderStatus(purchaseResult: {
  data?: { status?: string | null };
  message?: string | null;
}): EbillsOrderStatus {
  const orderData = purchaseResult.data || {};
  const statusLower = String(orderData.status ?? "").toLowerCase();
  const messageLower = String(purchaseResult.message ?? "").toLowerCase();

  const isProcessing =
    statusLower === "processing-api" ||
    statusLower === "queued-api" ||
    statusLower === "initiated-api" ||
    purchaseResult.message === "ORDER PROCESSING" ||
    purchaseResult.message === "ORDER QUEUED" ||
    purchaseResult.message === "ORDER INITIATED" ||
    messageLower.includes("order processing") ||
    messageLower.includes("order queued");

  const isCompleted =
    statusLower === "completed-api" ||
    statusLower === "completed" ||
    purchaseResult.message === "ORDER COMPLETED" ||
    messageLower.includes("order completed");

  const isRefunded =
    statusLower === "refunded" ||
    purchaseResult.message === "ORDER REFUNDED" ||
    messageLower.includes("order refunded");

  const isFailed =
    statusLower === "failed" ||
    statusLower === "failed-api" ||
    statusLower === "cancelled" ||
    purchaseResult.message === "ORDER FAILED" ||
    purchaseResult.message === "ORDER CANCELLED" ||
    messageLower.includes("order failed") ||
    messageLower.includes("order cancelled");

  const isPendingLike =
    statusLower === "pending" ||
    statusLower === "on-hold" ||
    messageLower.includes("order pending") ||
    messageLower.includes("on-hold");

  const shouldRefund =
    isRefunded ||
    isFailed ||
    (!isProcessing && !isCompleted && !isPendingLike);

  return { isProcessing, isCompleted, isRefunded, isFailed, shouldRefund };
}
