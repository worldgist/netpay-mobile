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
  shouldRefund: boolean;
};

/** eBills order statuses: refund when rejected/refunded; keep debit when processing or completed. */
export function getEbillsOrderStatus(purchaseResult: {
  data?: { status?: string | null };
  message?: string | null;
}): EbillsOrderStatus {
  const orderData = purchaseResult.data || {};
  const isProcessing =
    orderData.status === "processing-api" ||
    purchaseResult.message === "ORDER PROCESSING";
  const isCompleted =
    orderData.status === "completed-api" ||
    purchaseResult.message === "ORDER COMPLETED";
  const isRefunded =
    orderData.status === "refunded" ||
    purchaseResult.message === "ORDER REFUNDED";
  const shouldRefund = isRefunded || (!isProcessing && !isCompleted);
  return { isProcessing, isCompleted, isRefunded, shouldRefund };
}
