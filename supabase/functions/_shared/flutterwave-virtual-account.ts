import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { processFlutterwaveFunding } from "./flutterwave-funding.ts";
import { getFlutterwaveSecretKeyOptional } from "./flutterwave-bills.ts";
import {
  flutterwaveFetch,
  verifyFlutterwaveTransactionWithProvider,
} from "./flutterwave-http.ts";
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

export function getTransactionCustomerEmail(transaction: FlutterwaveChargeData): string {
  const customer = (transaction.customer || {}) as Record<string, unknown>;
  return String(customer.email || transaction.customer_email || "")
    .trim()
    .toLowerCase();
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
    customerEmail: getTransactionCustomerEmail(data),
    accountNumber: account.nuban || account.account_number || data.account_number || metaData.originatoraccountnumber,
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

  const secretKey = getFlutterwaveSecretKeyOptional();
  if (!secretKey) {
    throw new Error("Flutterwave credentials not configured");
  }

  const verifiedCharge = await verifyFlutterwaveTransactionWithProvider(secretKey, data);
  if (!verifiedCharge || !isSuccessfulFlutterwaveStatus(verifiedCharge.status)) {
    console.warn("Skipping Flutterwave credit: provider verification failed", {
      reference: getFlutterwaveFundingReference(data),
      id: data.id,
    });
    return { processed: false, reason: "provider_verify_failed" as const };
  }

  const reference = getFlutterwaveFundingReference(verifiedCharge);
  const creditAmount = getFlutterwaveCreditAmount(verifiedCharge);

  if (!reference || creditAmount <= 0) {
    throw new Error("Missing Flutterwave payment reference or amount");
  }

  if (isFlutterwaveCheckoutFunding(verifiedCharge)) {
    return { processed: false as const, reason: "checkout_handled_by_verify_endpoint" as const };
  }

  const knownUserId = typeof payload?.knownUserId === "string" ? payload.knownUserId : null;
  const userId = knownUserId ?? await resolveFlutterwaveChargeUserId(supabase, verifiedCharge, payload);
  if (!userId) {
    throw new Error("Unable to resolve user for Flutterwave payment");
  }

  const { data: virtualAccount } = await supabase
    .from("virtual_accounts")
    .select("account_number, tracking_reference")
    .eq("user_id", userId)
    .eq("provider", "flutterwave")
    .maybeSingle();

  if (!virtualAccount || !isVirtualAccountFundingTransaction(verifiedCharge, virtualAccount)) {
    return { processed: false as const, reason: "not_virtual_account_funding" as const };
  }

  const customer = (verifiedCharge.customer || {}) as Record<string, unknown>;
  const account = (verifiedCharge.account || {}) as Record<string, unknown>;

  const result = await processFlutterwaveFunding({
    supabase,
    userId,
    grossAmount: creditAmount,
    reference,
    bankName: String(verifiedCharge.payment_type || verifiedCharge.bankname || "Flutterwave"),
    accountNumber: account.nuban
      ? String(account.nuban)
      : verifiedCharge.account_number
      ? String(verifiedCharge.account_number)
      : null,
    accountName: String(customer.name || "Bank Transfer"),
    apiResponse: { webhook: payload ?? data, verified: verifiedCharge },
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

  const response = await flutterwaveFetch(secretKey, url.toString(), { method: "GET" });

  const body = await response.json();
  if (!response.ok || body.status !== "success") {
    throw new Error(body.message || "Failed to fetch Flutterwave transactions");
  }

  return Array.isArray(body.data) ? body.data as FlutterwaveChargeData[] : [];
}

export async function fetchAllFlutterwaveTransactions(
  secretKey: string,
  params: Record<string, string>,
  maxPages = 5,
) {
  const merged: FlutterwaveChargeData[] = [];
  const seenIds = new Set<string>();

  for (let page = 1; page <= maxPages; page += 1) {
    const rows = await fetchFlutterwaveTransactions(secretKey, {
      ...params,
      page: String(page),
    });

    if (rows.length === 0) {
      break;
    }

    for (const row of rows) {
      const id = String(row.id ?? getFlutterwaveFundingReference(row) ?? "");
      if (id && seenIds.has(id)) {
        continue;
      }
      if (id) {
        seenIds.add(id);
      }
      merged.push(row);
    }

    if (rows.length < 20) {
      break;
    }
  }

  return merged;
}

async function tryFetchAllFlutterwaveTransactions(
  secretKey: string,
  params: Record<string, string>,
  maxPages: number,
  label: string,
): Promise<FlutterwaveChargeData[]> {
  try {
    return await fetchAllFlutterwaveTransactions(secretKey, params, maxPages);
  } catch (error) {
    console.warn(`Flutterwave transaction fetch failed (${label}):`, error);
    return [];
  }
}

export function isVirtualAccountCreationEvent(
  transaction: FlutterwaveChargeData,
  virtualAccount: { tracking_reference?: string | null },
): boolean {
  const amount = getFlutterwaveCreditAmount(transaction);
  if (amount <= 0) {
    return true;
  }

  const narration = String(transaction.narration || transaction.meta || "").toLowerCase();
  if (
    narration.includes("virtual account created") ||
    narration.includes("account creation") ||
    narration.includes("va creation")
  ) {
    return true;
  }

  const paymentEntity = String(transaction.payment_entity || "").toLowerCase();
  if (paymentEntity === "card" || transaction.card) {
    return true;
  }

  return false;
}

export function transactionMatchesVirtualAccount(
  transaction: FlutterwaveChargeData,
  virtualAccountNumber: string,
): boolean {
  const account = (transaction.account || {}) as Record<string, unknown>;
  const metaData = (transaction.meta_data || {}) as Record<string, unknown>;
  const expected = normalizeAccountNumber(virtualAccountNumber);

  if (!expected) {
    return false;
  }

  const candidates = [
    account.nuban,
    account.account_number,
    transaction.account_number,
    metaData.originatoraccountnumber,
    metaData.account_number,
  ];

  for (const raw of candidates) {
    const txnAccountNumber = normalizeAccountNumber(raw);
    if (!txnAccountNumber) {
      continue;
    }

    if (txnAccountNumber === expected) {
      return true;
    }

    const withoutLeadingZeros = txnAccountNumber.replace(/^0+/, "");
    const expectedWithoutZeros = expected.replace(/^0+/, "");
    if (withoutLeadingZeros && withoutLeadingZeros === expectedWithoutZeros) {
      return true;
    }
  }

  return false;
}

export function transactionBelongsToUserVirtualAccount(
  transaction: FlutterwaveChargeData,
  virtualAccount: { account_number: string; tracking_reference?: string | null },
  customerEmail?: string,
): boolean {
  if (!isVirtualAccountFundingTransaction(transaction, virtualAccount)) {
    return false;
  }

  if (transactionMatchesVirtualAccount(transaction, virtualAccount.account_number)) {
    return true;
  }

  const txnEmail = getTransactionCustomerEmail(transaction);
  const normalizedEmail = String(customerEmail || "").trim().toLowerCase();
  return Boolean(txnEmail && normalizedEmail && txnEmail === normalizedEmail);
}

export function isVirtualAccountFundingTransaction(
  transaction: FlutterwaveChargeData,
  virtualAccount: { account_number: string; tracking_reference?: string | null },
): boolean {
  if (isVirtualAccountCreationEvent(transaction, virtualAccount)) {
    return false;
  }

  if (isFlutterwaveCheckoutFunding(transaction)) {
    return false;
  }

  const paymentType = String(transaction.payment_type || "").toLowerCase().replace(/[\s-]+/g, "_");
  const allowedPaymentTypes = new Set(["bank_transfer", "account", "ussd", "banktransfer"]);
  const isBankFundingType = !paymentType || allowedPaymentTypes.has(paymentType) || paymentType.includes("bank");
  const accountMatched = transactionMatchesVirtualAccount(transaction, virtualAccount.account_number);
  const amount = getFlutterwaveCreditAmount(transaction);

  if (!accountMatched && !isBankFundingType) {
    return false;
  }

  if (!accountMatched && isBankFundingType && amount <= 0) {
    return false;
  }

  const paymentEntity = String(transaction.payment_entity || "").toLowerCase();
  if (paymentEntity === "card" || transaction.card) {
    return false;
  }

  const narration = String(transaction.narration || transaction.meta || "").toLowerCase();
  if (
    narration.includes("card transaction") ||
    narration.includes("card payment")
  ) {
    return false;
  }

  return true;
}

export async function fetchVirtualAccountFundingCandidates(
  secretKey: string,
  options: {
    virtualAccount: { account_number: string; tracking_reference?: string | null };
    customerEmail?: string;
    fromDate: string;
    toDate: string;
    maxPages?: number;
  },
): Promise<FlutterwaveChargeData[]> {
  const baseQuery = {
    from: options.fromDate,
    to: options.toDate,
    status: "successful",
    currency: "NGN",
  };
  const maxPages = options.maxPages ?? 5;
  const customerEmail = String(options.customerEmail || "").trim().toLowerCase();
  const seenReferences = new Set<string>();
  const merged: FlutterwaveChargeData[] = [];

  const addRows = (rows: FlutterwaveChargeData[]) => {
    for (const row of rows) {
      const reference = getFlutterwaveFundingReference(row);
      if (!reference || seenReferences.has(reference)) {
        continue;
      }
      seenReferences.add(reference);
      merged.push(row);
    }
  };

  const addMatchingRows = (rows: FlutterwaveChargeData[]) => {
    for (const row of rows) {
      if (!transactionBelongsToUserVirtualAccount(row, options.virtualAccount, customerEmail)) {
        continue;
      }

      const reference = getFlutterwaveFundingReference(row);
      if (!reference || seenReferences.has(reference)) {
        continue;
      }

      seenReferences.add(reference);
      merged.push(row);
    }
  };

  if (customerEmail) {
    addMatchingRows(await tryFetchAllFlutterwaveTransactions(secretKey, {
      ...baseQuery,
      customer_email: customerEmail,
    }, maxPages, "customer_email"));
  }

  if (options.virtualAccount.tracking_reference) {
    addMatchingRows(await tryFetchAllFlutterwaveTransactions(secretKey, {
      ...baseQuery,
      tx_ref: options.virtualAccount.tracking_reference,
    }, 2, "tracking_reference"));
  }

  if (merged.length === 0) {
    const broadRows = await tryFetchAllFlutterwaveTransactions(secretKey, baseQuery, maxPages, "broad_scan");
    addMatchingRows(broadRows);
  }

  return merged;
}
