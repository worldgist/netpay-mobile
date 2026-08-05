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

export interface LedgerLatestEntry {
  id: string;
  balance_before: number;
  balance_after: number;
  amount: number;
  transaction_type: string;
  reference: string | null;
  description: string | null;
  created_at: string;
}

export interface UserBalanceReconcileDetail {
  user_id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  status: string;
  profile_balance: number;
  ledger_balance: number;
  drift: number;
  needs_reconcile: boolean;
  has_ledger_entries: boolean;
  latest_entry: LedgerLatestEntry | null;
  profile_updated_at: string | null;
  reconcile_action: string;
}

export interface UserBalanceReconcileTransaction {
  id: string;
  amount: number;
  balance_before: number;
  balance_after: number;
  transaction_type: string;
  description: string | null;
  reference: string | null;
  created_at: string;
}

export function parseUserBalanceReconcileDetail(raw: unknown): UserBalanceReconcileDetail | null {
  if (!raw || typeof raw !== "object") return null;
  const data = raw as Record<string, unknown>;
  const latest = data.latest_entry;
  return {
    user_id: String(data.user_id || ""),
    full_name: (data.full_name as string | null) ?? null,
    email: (data.email as string | null) ?? null,
    phone: (data.phone as string | null) ?? null,
    status: String(data.status || "active"),
    profile_balance: Number(data.profile_balance) || 0,
    ledger_balance: Number(data.ledger_balance) || 0,
    drift: Number(data.drift) || 0,
    needs_reconcile: Boolean(data.needs_reconcile),
    has_ledger_entries: Boolean(data.has_ledger_entries),
    latest_entry:
      latest && typeof latest === "object"
        ? {
            id: String((latest as Record<string, unknown>).id || ""),
            balance_before: Number((latest as Record<string, unknown>).balance_before) || 0,
            balance_after: Number((latest as Record<string, unknown>).balance_after) || 0,
            amount: Number((latest as Record<string, unknown>).amount) || 0,
            transaction_type: String((latest as Record<string, unknown>).transaction_type || ""),
            reference: ((latest as Record<string, unknown>).reference as string | null) ?? null,
            description: ((latest as Record<string, unknown>).description as string | null) ?? null,
            created_at: String((latest as Record<string, unknown>).created_at || ""),
          }
        : null,
    profile_updated_at: (data.profile_updated_at as string | null) ?? null,
    reconcile_action: String(data.reconcile_action || ""),
  };
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
