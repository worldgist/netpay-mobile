import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export type FlutterwaveChargeData = Record<string, unknown>;

function isCheckoutFunding(data: FlutterwaveChargeData): boolean {
  const meta = (data.meta || {}) as Record<string, unknown>;
  return meta.purpose === "wallet_funding";
}

/** Stable reference for idempotency. Checkout uses tx_ref; virtual-account transfers use Flutterwave id. */
export function getFlutterwaveFundingReference(data: FlutterwaveChargeData): string | null {
  const txRef = String(data.tx_ref || "").trim();
  if (txRef && isCheckoutFunding(data)) {
    return txRef;
  }

  const id = data.id;
  if (id !== undefined && id !== null && String(id).trim()) {
    return `flw-txn-${id}`;
  }

  const flwRef = String(data.flw_ref || "").trim();
  if (flwRef && flwRef.toLowerCase() !== "n/a") {
    return flwRef;
  }

  return txRef || null;
}

export function getFlutterwaveReferenceCandidates(data: FlutterwaveChargeData): string[] {
  const candidates = new Set<string>();
  const canonical = getFlutterwaveFundingReference(data);
  if (canonical) {
    candidates.add(canonical);
  }

  const flwRef = String(data.flw_ref || "").trim();
  if (flwRef && flwRef.toLowerCase() !== "n/a") {
    candidates.add(flwRef);
  }

  const txRef = String(data.tx_ref || "").trim();
  if (txRef) {
    candidates.add(txRef);
  }

  const id = data.id;
  if (id !== undefined && id !== null && String(id).trim()) {
    candidates.add(`flw-${id}`);
    candidates.add(`flw-txn-${id}`);
  }

  return [...candidates];
}

export async function isFlutterwaveFundingAlreadyRecorded(
  supabase: SupabaseClient,
  userId: string,
  data: FlutterwaveChargeData,
): Promise<boolean> {
  const references = getFlutterwaveReferenceCandidates(data);
  if (references.length === 0) {
    return false;
  }

  const { data: fundingRows } = await supabase
    .from("funding_transactions")
    .select("id")
    .eq("user_id", userId)
    .in("status", ["completed", "processing"])
    .in("reference", references)
    .limit(1);

  if (fundingRows && fundingRows.length > 0) {
    return true;
  }

  const { data: ledgerRows } = await supabase
    .from("user_transactions")
    .select("id")
    .eq("user_id", userId)
    .in("transaction_type", ["credit", "refund"])
    .in("reference", references)
    .limit(1);

  return Boolean(ledgerRows && ledgerRows.length > 0);
}

export function isFlutterwaveCheckoutFunding(data: FlutterwaveChargeData): boolean {
  return isCheckoutFunding(data);
}
