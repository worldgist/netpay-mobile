import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { creditUserWallet } from "./wallet.ts";

export const FUNDING_FEE_PERCENTAGE = 0.05;
export const MIN_FUNDING_FEE = 10;

export const calculateFundingFee = (amount: number): number => {
  const percentageFee = amount * FUNDING_FEE_PERCENTAGE;
  return Math.max(MIN_FUNDING_FEE, Math.round(percentageFee * 100) / 100);
};

type ProcessFundingOptions = {
  supabase: SupabaseClient;
  userId: string;
  grossAmount: number;
  reference: string;
  bankName?: string;
  accountNumber?: string | null;
  accountName?: string;
  apiResponse?: unknown;
  sendNotification?: boolean;
};

export type ProcessFundingResult = {
  alreadyProcessed: boolean;
  grossAmount: number;
  fundingFee: number;
  netCreditAmount: number;
  finalBalance: number;
};

async function backfillFundingLedger(
  supabase: SupabaseClient,
  userId: string,
  reference: string,
  creditAmount: number,
  netCreditAmount: number,
  fundingFee: number,
) {
  const { data: existingLedger } = await supabase
    .from("user_transactions")
    .select("id")
    .eq("user_id", userId)
    .eq("reference", reference)
    .maybeSingle();

  if (existingLedger) {
    return;
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("balance")
    .eq("id", userId)
    .single();

  const balanceAfter = Number(profile?.balance || 0);
  const balanceBefore = Math.max(0, balanceAfter - netCreditAmount);

  const { error } = await supabase.from("user_transactions").insert({
    user_id: userId,
    amount: netCreditAmount,
    balance_before: balanceBefore,
    balance_after: balanceAfter,
    transaction_type: "credit",
    description: `Wallet funding via Flutterwave (₦${creditAmount} received, ₦${fundingFee} fee)`,
    reference,
    performed_by: userId,
  });

  if (error) {
    console.error("Failed to backfill Flutterwave funding ledger:", error);
    throw error;
  }
}

export async function processFlutterwaveFunding({
  supabase,
  userId,
  grossAmount,
  reference,
  bankName = "Flutterwave",
  accountNumber = null,
  accountName = "Card/Bank Payment",
  apiResponse,
  sendNotification = true,
}: ProcessFundingOptions): Promise<ProcessFundingResult> {
  const creditAmount = Number(grossAmount);
  if (!userId || !reference || !Number.isFinite(creditAmount) || creditAmount <= 0) {
    throw new Error("Invalid funding parameters");
  }

  const fundingFee = calculateFundingFee(creditAmount);
  const netCreditAmount = creditAmount - fundingFee;

  const { data: existingTransaction } = await supabase
    .from("funding_transactions")
    .select("id, status")
    .eq("reference", reference)
    .maybeSingle();

  if (existingTransaction?.status === "completed") {
    await backfillFundingLedger(supabase, userId, reference, creditAmount, netCreditAmount, fundingFee);

    const { data: profile } = await supabase
      .from("profiles")
      .select("balance")
      .eq("id", userId)
      .single();

    return {
      alreadyProcessed: true,
      grossAmount: creditAmount,
      fundingFee,
      netCreditAmount,
      finalBalance: Number(profile?.balance || 0),
    };
  }

  const creditResult = await creditUserWallet({
    supabase,
    userId,
    amount: netCreditAmount,
    transactionType: "credit",
    description: `Wallet funding via Flutterwave (₦${creditAmount} received, ₦${fundingFee} fee)`,
    reference,
    performedBy: userId,
    notification: sendNotification
      ? {
          title: "Wallet Funded Successfully",
          message: `₦${creditAmount.toFixed(2)} added to your wallet. Net credit: ₦${netCreditAmount.toFixed(2)}.`,
        }
      : undefined,
  });

  const fundingPayload = {
    user_id: userId,
    amount: creditAmount,
    status: "completed",
    reference,
    bank_name: bankName,
    account_number: accountNumber,
    account_name: accountName,
    api_response: apiResponse ?? null,
    updated_at: new Date().toISOString(),
  };

  const { error: fundingError } = existingTransaction
    ? await supabase.from("funding_transactions").update(fundingPayload).eq("id", existingTransaction.id)
    : await supabase.from("funding_transactions").insert(fundingPayload);

  if (fundingError) {
    console.error("Failed to update funding_transactions after wallet credit:", fundingError);
    throw fundingError;
  }

  return {
    alreadyProcessed: false,
    grossAmount: creditAmount,
    fundingFee,
    netCreditAmount,
    finalBalance: creditResult.balanceAfter,
  };
}
