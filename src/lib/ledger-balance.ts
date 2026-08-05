export const LEDGER_CREDIT_TYPES = new Set(["credit", "refund"]);

export function isLedgerCreditType(type: string): boolean {
  return LEDGER_CREDIT_TYPES.has(type);
}

export function formatLedgerTypeLabel(type: string): string {
  return type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export interface LedgerBalanceSummary {
  total_ledger_liability: number;
  total_profile_balance: number;
  total_drift: number;
  mismatch_count: number;
  users_with_ledger: number;
  total_users: number;
}

export interface LedgerBalanceMismatch {
  user_id: string;
  full_name: string | null;
  email: string | null;
  ledger_balance: number;
  profile_balance: number;
  drift: number;
}

export function parseLedgerSummary(raw: unknown): LedgerBalanceSummary {
  const data = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    total_ledger_liability: Number(data.total_ledger_liability) || 0,
    total_profile_balance: Number(data.total_profile_balance) || 0,
    total_drift: Number(data.total_drift) || 0,
    mismatch_count: Number(data.mismatch_count) || 0,
    users_with_ledger: Number(data.users_with_ledger) || 0,
    total_users: Number(data.total_users) || 0,
  };
}

const LEDGER_BALANCE_TOLERANCE = 0.009;

export function balancesMatch(ledgerBalance: number, profileBalance: number): boolean {
  return Math.abs(ledgerBalance - profileBalance) <= LEDGER_BALANCE_TOLERANCE;
}

/** Latest ledger balance for a user; falls back to profile cache. */
export async function fetchUserLedgerBalance(
  supabase: { rpc: (fn: string, args: { p_user_id: string }) => PromiseLike<{ data: unknown; error: { message?: string } | null }> },
  userId: string,
  profileFallback = 0,
): Promise<number> {
  const { data, error } = await supabase.rpc("get_user_ledger_balance", { p_user_id: userId });
  if (!error && data != null) {
    return Number(data) || 0;
  }
  return profileFallback;
}
