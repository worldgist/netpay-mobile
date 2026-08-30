import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { creditUserWallet } from "./wallet.ts";
import { getFlutterwaveReferenceCandidates } from "./flutterwave-references.ts";

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
  /** Demo / review flows: credit the full gross amount with no processing fee. */
  waiveFee?: boolean;
};

export type ProcessFundingResult = {
  alreadyProcessed: boolean;
  grossAmount: number;
  fundingFee: number;
  netCreditAmount: number;
  finalBalance: number;
};

type ClaimResult =
  | { kind: "already_processed"; ledgerReference: string }
  | { kind: "claimed"; fundingId: string; ledgerReference: string }
  | { kind: "no_pending" };

async function findExistingFundingCredit(
  supabase: SupabaseClient,
  userId: string,
  uniqueReferences: string[],
) {
  const { data: existingLedger } = await supabase
    .from("user_transactions")
    .select("id, reference")
    .eq("user_id", userId)
    .eq("transaction_type", "credit")
    .in("reference", uniqueReferences)
    .limit(1)
    .maybeSingle();

  if (existingLedger) {
    return { ledgerReference: existingLedger.reference || uniqueReferences[0] };
  }

  const { data: completedFunding } = await supabase
    .from("funding_transactions")
    .select("id, reference")
    .eq("user_id", userId)
    .eq("status", "completed")
    .in("reference", uniqueReferences)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (completedFunding) {
    return { ledgerReference: completedFunding.reference || uniqueReferences[0] };
  }

  return null;
}

async function claimPendingFundingTransaction(
  supabase: SupabaseClient,
  userId: string,
  uniqueReferences: string[],
): Promise<ClaimResult> {
  const existing = await findExistingFundingCredit(supabase, userId, uniqueReferences);
  if (existing) {
    return { kind: "already_processed", ledgerReference: existing.ledgerReference };
  }

  const { data: claimedRows, error: claimError } = await supabase
    .from("funding_transactions")
    .update({
      status: "processing",
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq("status", "pending")
    .in("reference", uniqueReferences)
    .select("id, reference");

  if (claimError) {
    throw claimError;
  }

  const claimed = claimedRows?.[0];
  if (claimed) {
    return {
      kind: "claimed",
      fundingId: claimed.id,
      ledgerReference: claimed.reference || uniqueReferences[0],
    };
  }

  const existingAfterClaim = await findExistingFundingCredit(supabase, userId, uniqueReferences);
  if (existingAfterClaim) {
    return { kind: "already_processed", ledgerReference: existingAfterClaim.ledgerReference };
  }

  const { data: inFlightFunding } = await supabase
    .from("funding_transactions")
    .select("id, reference")
    .eq("user_id", userId)
    .eq("status", "processing")
    .in("reference", uniqueReferences)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (inFlightFunding) {
    return {
      kind: "already_processed",
      ledgerReference: inFlightFunding.reference || uniqueReferences[0],
    };
  }

  return { kind: "no_pending" };
}

async function claimFundingWithoutPendingRow(
  supabase: SupabaseClient,
  userId: string,
  ledgerReference: string,
  creditAmount: number,
  bankName: string,
  accountNumber: string | null,
  accountName: string,
): Promise<ClaimResult> {
  const existing = await findExistingFundingCredit(supabase, userId, [ledgerReference]);
  if (existing) {
    return { kind: "already_processed", ledgerReference: existing.ledgerReference };
  }

  const { data: inserted, error: insertError } = await supabase
    .from("funding_transactions")
    .insert({
      user_id: userId,
      amount: creditAmount,
      status: "processing",
      reference: ledgerReference,
      bank_name: bankName,
      account_number: accountNumber,
      account_name: accountName,
      updated_at: new Date().toISOString(),
    })
    .select("id, reference")
    .maybeSingle();

  if (insertError) {
    if (insertError.code === "23505") {
      const existingAfterConflict = await findExistingFundingCredit(supabase, userId, [ledgerReference]);
      return {
        kind: "already_processed",
        ledgerReference: existingAfterConflict?.ledgerReference || ledgerReference,
      };
    }
    throw insertError;
  }

  if (!inserted) {
    return { kind: "already_processed", ledgerReference };
  }

  return {
    kind: "claimed",
    fundingId: inserted.id,
    ledgerReference: inserted.reference || ledgerReference,
  };
}

async function backfillFundingLedger(
  supabase: SupabaseClient,
  userId: string,
  reference: string,
  creditAmount: number,
  netCreditAmount: number,
  fundingFee: number,
) {
  const feeLabel = fundingFee > 0 ? `₦${fundingFee} fee` : "₦0 fee";

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
    description: `Wallet funding via Flutterwave (₦${creditAmount} received, ${feeLabel})`,
    reference,
    performed_by: userId,
  });

  if (error) {
    console.error("Failed to backfill Flutterwave funding ledger:", error);
    throw error;
  }
}

async function readWalletBalance(supabase: SupabaseClient, userId: string): Promise<number> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("balance")
    .eq("id", userId)
    .single();

  return Number(profile?.balance || 0);
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
  waiveFee = false,
}: ProcessFundingOptions): Promise<ProcessFundingResult> {
  const creditAmount = Number(grossAmount);
  if (!userId || !reference || !Number.isFinite(creditAmount) || creditAmount <= 0) {
    throw new Error("Invalid funding parameters");
  }

  const fundingFee = waiveFee ? 0 : calculateFundingFee(creditAmount);
  const netCreditAmount = waiveFee ? creditAmount : creditAmount - fundingFee;
  const feeLabel = waiveFee ? "₦0 demo fee" : `₦${fundingFee} fee`;

  const referenceCandidates = [reference];
  const apiResponseData = (apiResponse && typeof apiResponse === "object")
    ? apiResponse as Record<string, unknown>
    : null;
  const nestedData = (apiResponseData?.data && typeof apiResponseData.data === "object")
    ? apiResponseData.data as Record<string, unknown>
    : apiResponseData;

  if (nestedData) {
    for (const candidate of getFlutterwaveReferenceCandidates(nestedData)) {
      referenceCandidates.push(candidate);
    }
  }

  const uniqueReferences = [...new Set(referenceCandidates.filter(Boolean))];
  let claim = await claimPendingFundingTransaction(supabase, userId, uniqueReferences);

  if (claim.kind === "no_pending") {
    const primaryReference = uniqueReferences.find((candidate) => candidate.startsWith("netpay-fund-"))
      || uniqueReferences.find((candidate) => candidate.startsWith("flw-txn-"))
      || reference;
    claim = await claimFundingWithoutPendingRow(
      supabase,
      userId,
      primaryReference,
      creditAmount,
      bankName,
      accountNumber,
      accountName,
    );
  }

  if (claim.kind === "already_processed") {
    await backfillFundingLedger(
      supabase,
      userId,
      claim.ledgerReference,
      creditAmount,
      netCreditAmount,
      fundingFee,
    );

    return {
      alreadyProcessed: true,
      grossAmount: creditAmount,
      fundingFee,
      netCreditAmount,
      finalBalance: await readWalletBalance(supabase, userId),
    };
  }

  const ledgerReference = claim.kind === "claimed" ? claim.ledgerReference : reference;
  let fundingId = claim.kind === "claimed" ? claim.fundingId : null;

  try {
    const creditResult = await creditUserWallet({
      supabase,
      userId,
      amount: netCreditAmount,
      transactionType: "credit",
      description: `Wallet funding via Flutterwave (₦${creditAmount} received, ${feeLabel})`,
      reference: ledgerReference,
      performedBy: userId,
      notification: sendNotification
        ? {
          title: "Wallet Funded Successfully",
          message: waiveFee
            ? `₦${creditAmount.toLocaleString("en-NG")} added to your wallet.`
            : `₦${creditAmount.toFixed(2)} added to your wallet. Net credit: ₦${netCreditAmount.toFixed(2)}.`,
        }
        : undefined,
    });

    const fundingPayload = {
      user_id: userId,
      amount: creditAmount,
      status: "completed",
      reference: ledgerReference,
      bank_name: bankName,
      account_number: accountNumber,
      account_name: accountName,
      api_response: apiResponse ?? null,
      updated_at: new Date().toISOString(),
    };

    const { error: fundingError } = fundingId
      ? await supabase.from("funding_transactions").update(fundingPayload).eq("id", fundingId)
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
  } catch (error) {
    if (fundingId) {
      await supabase
        .from("funding_transactions")
        .update({
          status: "pending",
          updated_at: new Date().toISOString(),
        })
        .eq("id", fundingId)
        .eq("status", "processing");
    }
    throw error;
  }
}
