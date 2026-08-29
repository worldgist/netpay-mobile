import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { processFlutterwaveFunding } from "./flutterwave-funding.ts";
import {
  type FlutterwaveChargeData,
  getFlutterwaveFundingReference,
  isFlutterwaveCheckoutFunding,
} from "./flutterwave-references.ts";

export type { FlutterwaveChargeData };
export {
  getFlutterwaveFundingReference,
  getFlutterwaveReferenceCandidates,
  isFlutterwaveFundingAlreadyRecorded,
  isFlutterwaveCheckoutFunding,
} from "./flutterwave-references.ts";

export function isSuccessfulFlutterwaveStatus(status: unknown): boolean {
  const normalized = String(status || "").toLowerCase();
  return normalized === "successful" || normalized === "succeeded" || normalized === "success";
}

export function normalizeAccountNumber(value: unknown): string {
  return String(value || "").replace(/\D/g, "").trim();
}

export function getFlutterwaveCreditAmount(data: FlutterwaveChargeData): number {
  return Number(data.amount || data.charged_amount || 0);
}

export async function findVirtualAccountUserId(
  supabase: SupabaseClient,
  options: {
    txRef?: string | null;
    customerEmail?: string | null;
    accountNumber?: string | null;
    accountId?: string | number | null;
  },
): Promise<string | null> {
  const txRef = String(options.txRef || "").trim();
  const customerEmail = String(options.customerEmail || "").trim().toLowerCase();
  const accountNumber = normalizeAccountNumber(options.accountNumber);
  const accountId = options.accountId != null ? String(options.accountId) : "";

  if (txRef) {
    const { data: byTrackingRef } = await supabase
      .from("virtual_accounts")
      .select("user_id")
      .eq("provider", "flutterwave")
      .eq("tracking_reference", txRef)
      .maybeSingle();

    if (byTrackingRef?.user_id) {
      return byTrackingRef.user_id;
    }
  }

  if (customerEmail) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .ilike("email", customerEmail)
      .maybeSingle();

    if (profile?.id) {
      const { data: byUser } = await supabase
        .from("virtual_accounts")
        .select("user_id")
        .eq("user_id", profile.id)
        .eq("provider", "flutterwave")
        .maybeSingle();

      if (byUser?.user_id) {
        return byUser.user_id;
      }
    }
  }

  if (accountNumber) {
    const candidates = [accountNumber];
    const withoutLeadingZeros = accountNumber.replace(/^0+/, "");
    if (withoutLeadingZeros && !candidates.includes(withoutLeadingZeros)) {
      candidates.push(withoutLeadingZeros);
    }
    if (accountNumber.length < 10) {
      const padded = accountNumber.padStart(10, "0");
      if (!candidates.includes(padded)) {
        candidates.push(padded);
      }
    }

    for (const candidate of candidates) {
      const { data: byAccount } = await supabase
        .from("virtual_accounts")
        .select("user_id")
        .eq("account_number", candidate)
        .eq("provider", "flutterwave")
        .maybeSingle();

      if (byAccount?.user_id) {
        return byAccount.user_id;
      }
    }
  }

  if (accountId) {
    const { data: byAccountId } = await supabase
      .from("virtual_accounts")
      .select("user_id")
      .eq("provider", "flutterwave")
      .filter("tracking_reference", "ilike", `%${accountId}%`)
      .maybeSingle();

    if (byAccountId?.user_id) {
      return byAccountId.user_id;
    }
  }

  return null;
}

export async function resolveFlutterwaveChargeUserId(
  supabase: SupabaseClient,
  data: FlutterwaveChargeData,
  payload?: Record<string, unknown>,
): Promise<string | null> {
  const metaUserId = (data.meta as Record<string, unknown> | undefined)?.user_id;
  if (typeof metaUserId === "string" && metaUserId) {
    return metaUserId;
  }

  const customer = (data.customer || {}) as Record<string, unknown>;
  const account = (data.account || {}) as Record<string, unknown>;
  const metaData = (payload?.meta_data || data.meta_data || {}) as Record<string, unknown>;

  const txRef = String(data.tx_ref || "").trim();
  const reference = getFlutterwaveFundingReference(data);

  const { data: pendingFunding } = reference
    ? await supabase
      .from("funding_transactions")
      .select("user_id")
      .eq("reference", reference)
      .maybeSingle()
    : { data: null };

  if (pendingFunding?.user_id) {
    return pendingFunding.user_id;
  }

  if (txRef) {
    const { data: pendingByTxRef } = await supabase
      .from("funding_transactions")
      .select("user_id")
      .eq("reference", txRef)
      .maybeSingle();

    if (pendingByTxRef?.user_id) {
      return pendingByTxRef.user_id;
    }
  }

  return findVirtualAccountUserId(supabase, {
    txRef,
    customerEmail: String(customer.email || "").trim(),
    accountNumber: account.nuban || data.account_number || metaData.originatoraccountnumber,
    accountId: data.account_id,
  });
}

export async function processFlutterwaveChargeData(
  supabase: SupabaseClient,
  data: FlutterwaveChargeData,
  payload?: Record<string, unknown>,
  sendNotification = true,
) {
  if (!isSuccessfulFlutterwaveStatus(data.status)) {
    return { processed: false, reason: "not_successful" as const };
  }

  const reference = getFlutterwaveFundingReference(data);
  const creditAmount = getFlutterwaveCreditAmount(data);

  if (!reference || creditAmount <= 0) {
    throw new Error("Missing Flutterwave payment reference or amount");
  }

  if (isFlutterwaveCheckoutFunding(data)) {
    return { processed: false as const, reason: "checkout_handled_by_verify_endpoint" as const };
  }

  const userId = await resolveFlutterwaveChargeUserId(supabase, data, payload);
  if (!userId) {
    throw new Error("Unable to resolve user for Flutterwave payment");
  }

  const { data: virtualAccount } = await supabase
    .from("virtual_accounts")
    .select("account_number, tracking_reference")
    .eq("user_id", userId)
    .eq("provider", "flutterwave")
    .maybeSingle();

  if (!virtualAccount || !isVirtualAccountFundingTransaction(data, virtualAccount)) {
    return { processed: false as const, reason: "not_virtual_account_funding" as const };
  }

  const customer = (data.customer || {}) as Record<string, unknown>;
  const account = (data.account || {}) as Record<string, unknown>;

  const result = await processFlutterwaveFunding({
    supabase,
    userId,
    grossAmount: creditAmount,
    reference,
    bankName: String(data.payment_type || data.bankname || "Flutterwave"),
    accountNumber: account.nuban
      ? String(account.nuban)
      : data.account_number
      ? String(data.account_number)
      : null,
    accountName: String(customer.name || "Bank Transfer"),
    apiResponse: payload ?? data,
    sendNotification,
  });

  return {
    processed: true as const,
    userId,
    reference,
    result,
  };
}

export async function fetchFlutterwaveTransactions(
  secretKey: string,
  params: Record<string, string>,
) {
  const url = new URL("https://api.flutterwave.com/v3/transactions");
  for (const [key, value] of Object.entries(params)) {
    if (value) {
      url.searchParams.set(key, value);
    }
  }

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${secretKey}`,
      Accept: "application/json",
    },
  });

  const body = await response.json();
  if (!response.ok || body.status !== "success") {
    throw new Error(body.message || "Failed to fetch Flutterwave transactions");
  }

  return Array.isArray(body.data) ? body.data as FlutterwaveChargeData[] : [];
}

export function transactionMatchesVirtualAccount(
  transaction: FlutterwaveChargeData,
  virtualAccountNumber: string,
): boolean {
  const account = (transaction.account || {}) as Record<string, unknown>;
  const txnAccountNumber = normalizeAccountNumber(account.nuban || transaction.account_number);
  const expected = normalizeAccountNumber(virtualAccountNumber);

  if (!expected || !txnAccountNumber) {
    return false;
  }

  return txnAccountNumber === expected;
}

export function isVirtualAccountFundingTransaction(
  transaction: FlutterwaveChargeData,
  virtualAccount: { account_number: string; tracking_reference?: string | null },
): boolean {
  if (!transactionMatchesVirtualAccount(transaction, virtualAccount.account_number)) {
    return false;
  }

  const txRef = String(transaction.tx_ref || "").trim();
  const trackingRef = String(virtualAccount.tracking_reference || "").trim();
  if (trackingRef && txRef === trackingRef) {
    return false;
  }

  const paymentEntity = String(transaction.payment_entity || "").toLowerCase();
  if (paymentEntity === "card") {
    return false;
  }

  if (transaction.card) {
    return false;
  }

  const paymentType = String(transaction.payment_type || "").toLowerCase().replace(/\s+/g, "_");
  const allowedPaymentTypes = new Set(["bank_transfer", "account", "ussd"]);
  if (!allowedPaymentTypes.has(paymentType)) {
    return false;
  }

  const narration = String(transaction.narration || transaction.meta || "").toLowerCase();
  if (
    narration.includes("card transaction") ||
    narration.includes("card payment") ||
    narration.includes("virtual account created")
  ) {
    return false;
  }

  return true;
}
