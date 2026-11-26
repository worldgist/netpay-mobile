import type { LedgerBalanceMismatch } from "@/lib/ledger-balance";

export type TreasuryDatePreset =
  | "today"
  | "yesterday"
  | "7d"
  | "30d"
  | "this_month"
  | "last_month"
  | "custom";

export type TreasuryBalanceStatus = "ok" | "low" | "critical" | "error" | "unconfigured";
export type TreasuryLiquidityStatus = "healthy" | "moderate" | "low" | "critical" | "unknown";

export type TreasuryVendorKey = "smeplug" | "ebills" | "mobilenig" | "payvessel";

export type TreasuryVendorBalance = {
  key: TreasuryVendorKey;
  label: string;
  balance: number | null;
  status: TreasuryBalanceStatus;
  role: string;
  detailPath: string;
  estimatedDaysRemaining: number | null;
};

export type TreasuryAlert = {
  severity: "critical" | "warning" | "info";
  code: string;
  message: string;
  vendor?: string;
};

export type TreasurySummaryResponse = {
  success: boolean;
  error?: string;
  synced_at?: string;
  range?: { start: string; end: string; label: string };
  settings?: {
    low_balance_threshold: number;
    critical_balance_threshold: number;
    liquidity_bands: {
      healthy_min_pct: number;
      moderate_min_pct: number;
      low_min_pct: number;
      bank_gateway_source: string;
    };
  };
  bank_gateway?: {
    source: string;
    label: string;
    available: number | null;
    ledger: number | null;
    status: TreasuryBalanceStatus;
    detail_path: string;
    role: string;
  };
  vendors?: TreasuryVendorBalance[];
  metrics?: {
    total_treasury_assets: number;
    bank_gateway_balance: number | null;
    vendor_wallet_total: number;
    customer_wallet_liability: number;
    profile_balance_total: number;
    wallet_count: number;
    pending_refund_obligations: number;
    available_liquidity: number;
    liquidity_coverage_pct: number | null;
    liquidity_status: TreasuryLiquidityStatus;
    platform_revenue_period: number;
    platform_revenue_all_time: number;
    platform_expenses_period: number;
    net_profit_period: number;
    txn_count_period: number;
    txn_volume_period: number;
    funding_volume_period: number;
    funding_count_period: number;
    vendor_spend_volume_period: number;
    vendor_spend_count_period: number;
    avg_daily_vendor_spend_7d: number;
    ledger_mismatch_count: number;
    ledger_summary_available: boolean;
  };
  mismatches?: LedgerBalanceMismatch[];
  alerts?: TreasuryAlert[];
};

export const TREASURY_DATE_PRESETS: Array<{ value: TreasuryDatePreset; label: string }> = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "this_month", label: "This month" },
  { value: "last_month", label: "Last month" },
  { value: "custom", label: "Custom range" },
];
