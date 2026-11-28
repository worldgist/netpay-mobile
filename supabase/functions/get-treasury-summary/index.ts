import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  corsHeaders,
  createServiceClient,
  errorResponse,
  jsonResponse,
  requireAdmin,
} from "../_shared/admin-auth.ts";
import { fetchSmeplugWalletBalance } from "../_shared/smeplug-balance.ts";
import { flutterwaveJson } from "../_shared/flutterwave-http.ts";

type VendorKey = "smeplug" | "plustive" | "mobilenig";

type BalanceStatus = "ok" | "low" | "critical" | "error" | "unconfigured";

type LiquidityStatus = "healthy" | "moderate" | "low" | "critical" | "unknown";

const DEFAULT_LOW = 5000;
const DEFAULT_CRITICAL = 2000;
const DEFAULT_LIQUIDITY = {
  healthy_min_pct: 100,
  moderate_min_pct: 75,
  low_min_pct: 50,
};

function num(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function startOfUtcDay(d = new Date()): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
}

function resolveRange(preset: string, startDate?: string, endDate?: string): { start: string; end: string; label: string } {
  const now = new Date();
  const end = endDate ? new Date(endDate) : now;
  let start: Date;
  let label = preset || "today";

  switch (preset) {
    case "yesterday": {
      const y = startOfUtcDay(now);
      y.setUTCDate(y.getUTCDate() - 1);
      start = y;
      end.setTime(y.getTime() + 86_400_000 - 1);
      break;
    }
    case "7d":
      start = new Date(now.getTime() - 7 * 86_400_000);
      break;
    case "30d":
      start = new Date(now.getTime() - 30 * 86_400_000);
      break;
    case "this_month":
      start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
      break;
    case "last_month": {
      start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
      end.setTime(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).getTime() - 1);
      label = "last_month";
      break;
    }
    case "custom":
      start = startDate ? new Date(startDate) : startOfUtcDay(now);
      break;
    case "today":
    default:
      start = startOfUtcDay(now);
      label = "today";
      break;
  }

  return {
    start: start.toISOString(),
    end: end.toISOString(),
    label,
  };
}

function parseThresholds(settingValue: unknown): { low: number; critical: number } {
  if (settingValue && typeof settingValue === "object") {
    const v = settingValue as Record<string, unknown>;
    return {
      low: num(v.threshold ?? v.low, DEFAULT_LOW),
      critical: num(v.critical_threshold ?? v.critical, DEFAULT_CRITICAL),
    };
  }
  return { low: DEFAULT_LOW, critical: DEFAULT_CRITICAL };
}

function parseLiquidityBands(settingValue: unknown) {
  const v = (settingValue && typeof settingValue === "object"
    ? settingValue
    : {}) as Record<string, unknown>;
  return {
    healthy_min_pct: num(v.healthy_min_pct, DEFAULT_LIQUIDITY.healthy_min_pct),
    moderate_min_pct: num(v.moderate_min_pct, DEFAULT_LIQUIDITY.moderate_min_pct),
    low_min_pct: num(v.low_min_pct, DEFAULT_LIQUIDITY.low_min_pct),
    bank_gateway_source: String(v.bank_gateway_source || "flutterwave"),
  };
}

function statusForBalance(amount: number | null, low: number, critical: number, syncOk: boolean, configured: boolean): BalanceStatus {
  if (!configured) return "unconfigured";
  if (!syncOk || amount == null) return "error";
  if (amount < critical) return "critical";
  if (amount < low) return "low";
  return "ok";
}

function liquidityStatus(coveragePct: number | null, bands: ReturnType<typeof parseLiquidityBands>): LiquidityStatus {
  if (coveragePct == null) return "unknown";
  if (coveragePct >= bands.healthy_min_pct) return "healthy";
  if (coveragePct >= bands.moderate_min_pct) return "moderate";
  if (coveragePct >= bands.low_min_pct) return "low";
  return "critical";
}

async function sumPurchaseSpend(
  supabase: ReturnType<typeof createServiceClient>,
  table: string,
  start: string,
  end: string,
): Promise<{ volume: number; count: number }> {
  const { data, error } = await supabase
    .from(table)
    .select("amount, status, created_at")
    .gte("created_at", start)
    .lte("created_at", end)
    .limit(5000);

  if (error) {
    console.warn(`treasury spend query failed for ${table}:`, error.message);
    return { volume: 0, count: 0 };
  }

  let volume = 0;
  let count = 0;
  for (const row of data || []) {
    const status = String(row.status || "").toLowerCase();
    if (status && !["success", "successful", "completed", "delivered"].includes(status)) continue;
    volume += num(row.amount);
    count += 1;
  }
  return { volume, count };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const supabase = createServiceClient();
    await requireAdmin(req, supabase);

    let preset = "today";
    let startDate: string | undefined;
    let endDate: string | undefined;
    try {
      const body = req.method === "POST" ? await req.json() : {};
      if (body?.preset) preset = String(body.preset);
      if (body?.startDate) startDate = String(body.startDate);
      if (body?.endDate) endDate = String(body.endDate);
    } catch {
      // empty body
    }

    const range = resolveRange(preset, startDate, endDate);
    const syncedAt = new Date().toISOString();

    const { data: settingsRows } = await supabase
      .from("app_settings")
      .select("setting_key, setting_value")
      .in("setting_key", [
        "treasury_low_balance_threshold",
        "treasury_liquidity_thresholds",
        "treasury_vendor_thresholds",
      ]);

    const settingsMap = new Map<string, unknown>();
    for (const row of settingsRows || []) {
      settingsMap.set(row.setting_key, row.setting_value);
    }

    const globalThresholds = parseThresholds(settingsMap.get("treasury_low_balance_threshold"));
    const liquidityBands = parseLiquidityBands(settingsMap.get("treasury_liquidity_thresholds"));
    const vendorThresholdMap = (settingsMap.get("treasury_vendor_thresholds") &&
      typeof settingsMap.get("treasury_vendor_thresholds") === "object"
      ? settingsMap.get("treasury_vendor_thresholds")
      : {}) as Record<string, { low?: number; critical?: number }>;

    const vendorThreshold = (key: VendorKey) => ({
      low: num(vendorThresholdMap[key]?.low, globalThresholds.low),
      critical: num(vendorThresholdMap[key]?.critical, globalThresholds.critical),
    });

    // Ledger liability
    let { data: ledgerSummary, error: ledgerError } = await supabase.rpc("get_ledger_balance_summary");
    if (ledgerError) {
      console.error("get_ledger_balance_summary:", ledgerError);
    }
    const mismatchCount = num((ledgerSummary as { mismatch_count?: number })?.mismatch_count);
    if (mismatchCount > 0) {
      await supabase.rpc("sync_profile_balances_from_ledger");
      const refreshed = await supabase.rpc("get_ledger_balance_summary");
      if (!refreshed.error && refreshed.data) ledgerSummary = refreshed.data;
    }

    const { data: mismatches } = await supabase.rpc("get_ledger_balance_mismatches", { p_limit: 20 });
    const { count: walletCount } = await supabase
      .from("profiles")
      .select("id", { count: "exact", head: true });
    const { data: profileBalances } = await supabase.from("profiles").select("balance");
    const profileBalanceTotal = (profileBalances || []).reduce((s, r) => s + num(r.balance), 0);

    const customerLiability = num(
      (ledgerSummary as { total_ledger_liability?: number })?.total_ledger_liability,
      profileBalanceTotal,
    );

    // Period KPIs
    let fundingQuery = supabase
      .from("funding_transactions")
      .select("amount, status, created_at")
      .gte("created_at", range.start)
      .lte("created_at", range.end)
      .limit(5000);
    const { data: fundingRows } = await fundingQuery;
    let fundingVolume = 0;
    let fundingCount = 0;
    for (const row of fundingRows || []) {
      const status = String(row.status || "").toLowerCase();
      if (status && !["completed", "success", "successful"].includes(status)) continue;
      fundingVolume += num(row.amount);
      fundingCount += 1;
    }

    const { data: periodLedger } = await supabase
      .from("user_transactions")
      .select("amount, transaction_type, created_at")
      .gte("created_at", range.start)
      .lte("created_at", range.end)
      .limit(8000);

    let txnCount = 0;
    let txnVolume = 0;
    let fundingFeeRevenue = 0;
    const debitTypes = new Set([
      "debit",
      "purchase",
      "airtime_purchase",
      "data_purchase",
      "electricity_purchase",
      "cable_purchase",
      "cable_tv",
      "education_purchase",
      "betting_purchase",
      "transfer_fee",
    ]);
    for (const row of periodLedger || []) {
      txnCount += 1;
      const amount = num(row.amount);
      txnVolume += amount;
      const t = String(row.transaction_type || "");
      if (t === "funding_fee") fundingFeeRevenue += amount;
      if (debitTypes.has(t)) {
        // counted in volume already
      }
    }

    const { data: revenueRows } = await supabase
      .from("platform_revenue")
      .select("revenue_amount, transaction_status, created_at")
      .eq("transaction_status", "completed")
      .gte("created_at", range.start)
      .lte("created_at", range.end)
      .limit(5000);

    const periodRevenue =
      (revenueRows || []).reduce((s, r) => s + num(r.revenue_amount), 0) + fundingFeeRevenue;

    const { data: allTimeRevenueRows } = await supabase
      .from("platform_revenue")
      .select("revenue_amount")
      .eq("transaction_status", "completed");
    const { data: allTimeFees } = await supabase
      .from("user_transactions")
      .select("amount")
      .eq("transaction_type", "funding_fee");
    const allTimeRevenue =
      (allTimeRevenueRows || []).reduce((s, r) => s + num(r.revenue_amount), 0) +
      (allTimeFees || []).reduce((s, r) => s + num(r.amount), 0);

    const purchaseTables = [
      "airtime_transactions",
      "data_transactions",
      "electricity_transactions",
      "cable_tv_transactions",
      "education_transactions",
      "betting_transactions",
    ];
    const spendResults = await Promise.all(
      purchaseTables.map((table) => sumPurchaseSpend(supabase, table, range.start, range.end)),
    );
    const vendorSpendVolume = spendResults.reduce((s, r) => s + r.volume, 0);
    const vendorSpendCount = spendResults.reduce((s, r) => s + r.count, 0);

    // Avg daily spend over last 7 days for runway
    const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
    const nowIso = new Date().toISOString();
    const runwaySpend = await Promise.all(
      purchaseTables.map((table) => sumPurchaseSpend(supabase, table, sevenDaysAgo, nowIso)),
    );
    const avgDailyVendorSpend = runwaySpend.reduce((s, r) => s + r.volume, 0) / 7;

    // Pending refunds / obligations proxy: refunds pending or requires_review in purchase tables
    let pendingRefundObligation = 0;
    for (const table of purchaseTables) {
      const { data } = await supabase
        .from(table)
        .select("amount, status")
        .in("status", ["requires_review", "pending_refund", "refund_pending"])
        .limit(1000);
      for (const row of data || []) pendingRefundObligation += num(row.amount);
    }

    // Balances: Flutterwave (bank/gateway) + vending vendors
    const balanceFetches = await Promise.allSettled([
      (async () => {
        const { resolveFlutterwaveSecretKey } = await import("../_shared/flutterwave-secrets.ts");
        const secretKey = await resolveFlutterwaveSecretKey();
        if (!secretKey) return { key: "flutterwave" as const, configured: false, amount: null as number | null, ledger: null as number | null };
        const balanceData = await flutterwaveJson(secretKey, "/balances/NGN", { method: "GET" });
        const available = num(balanceData?.data?.available_balance ?? balanceData?.data?.ledger_balance);
        const ledger = num(balanceData?.data?.ledger_balance, available);
        return { key: "flutterwave" as const, configured: true, amount: available, ledger };
      })(),
      (async () => {
        const { resolveSmeplugSecretKey } = await import("../_shared/vendor-secrets.ts");
        const key = await resolveSmeplugSecretKey();
        if (!key) return { key: "smeplug" as const, configured: false, amount: null as number | null };
        const result = await fetchSmeplugWalletBalance(key);
        return { key: "smeplug" as const, configured: true, amount: result.balance };
      })(),
      (async () => {
        try {
          const { getPlustiveBalance } = await import("../_shared/plustive-api.ts");
          const balance = await getPlustiveBalance();
          return { key: "plustive" as const, configured: true, amount: num(balance.balance) };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          if (/not configured|missing/i.test(message)) {
            return { key: "plustive" as const, configured: false, amount: null as number | null };
          }
          throw error;
        }
      })(),
      (async () => {
        try {
          const { getMobilenigBalance } = await import("../_shared/mobilenig-api.ts");
          const balance = await getMobilenigBalance();
          return { key: "mobilenig" as const, configured: true, amount: num(balance.balance) };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          if (/not configured|missing/i.test(message)) {
            return { key: "mobilenig" as const, configured: false, amount: null as number | null };
          }
          throw error;
        }
      })(),
    ]);

    let flutterwaveAvailable: number | null = null;
    let flutterwaveLedger: number | null = null;
    let flutterwaveStatus: BalanceStatus = "error";

    const vendors: Array<{
      key: VendorKey;
      label: string;
      balance: number | null;
      status: BalanceStatus;
      role: string;
      detailPath: string;
      estimatedDaysRemaining: number | null;
    }> = [];

    const vendorMeta: Record<VendorKey, { label: string; role: string; detailPath: string }> = {
      smeplug: { label: "SMEPLUG", role: "Airtime & data vending", detailPath: "/smeplug" },
      plustive: { label: "Plustive Impact", role: "Airtime, data, and bill vending", detailPath: "/plustive" },
      mobilenig: { label: "MobileNig", role: "Cable & electricity vending", detailPath: "/mobilenig" },
    };

    for (const settled of balanceFetches) {
      if (settled.status === "rejected") {
        console.error("treasury balance fetch failed:", settled.reason);
        continue;
      }
      const value = settled.value;
      if (value.key === "flutterwave") {
        flutterwaveAvailable = value.amount;
        flutterwaveLedger = value.ledger ?? value.amount;
        flutterwaveStatus = statusForBalance(
          value.amount,
          globalThresholds.low,
          globalThresholds.critical,
          value.amount != null,
          value.configured,
        );
        continue;
      }

      const key = value.key as VendorKey;
      const th = vendorThreshold(key);
      const amount = value.amount;
      const status = statusForBalance(amount, th.low, th.critical, amount != null, value.configured);
      const days =
        amount != null && avgDailyVendorSpend > 0
          ? Math.round((amount / avgDailyVendorSpend) * 10) / 10
          : null;
      vendors.push({
        key,
        label: vendorMeta[key].label,
        balance: amount,
        status,
        role: vendorMeta[key].role,
        detailPath: vendorMeta[key].detailPath,
        estimatedDaysRemaining: days,
      });
    }

    // Ensure all vendors appear even if fetch rejected
    for (const key of Object.keys(vendorMeta) as VendorKey[]) {
      if (!vendors.find((v) => v.key === key)) {
        vendors.push({
          key,
          label: vendorMeta[key].label,
          balance: null,
          status: "error",
          role: vendorMeta[key].role,
          detailPath: vendorMeta[key].detailPath,
          estimatedDaysRemaining: null,
        });
      }
    }

    const syncedVendorTotal = vendors
      .filter((v) => v.balance != null && (v.status === "ok" || v.status === "low" || v.status === "critical"))
      .reduce((s, v) => s + num(v.balance), 0);

    const bankGatewayBalance = flutterwaveAvailable;
    const liquidAssets =
      (bankGatewayBalance != null && flutterwaveStatus !== "error" && flutterwaveStatus !== "unconfigured"
        ? bankGatewayBalance
        : 0) + syncedVendorTotal;

    const obligations = customerLiability + pendingRefundObligation;
    const availableLiquidity = liquidAssets - obligations;
    const coveragePct = customerLiability > 0 ? (liquidAssets / customerLiability) * 100 : null;
    const liqStatus = liquidityStatus(coveragePct, liquidityBands);

    const totalTreasuryAssets = liquidAssets;

    return jsonResponse({
      success: true,
      synced_at: syncedAt,
      range,
      settings: {
        low_balance_threshold: globalThresholds.low,
        critical_balance_threshold: globalThresholds.critical,
        liquidity_bands: liquidityBands,
      },
      bank_gateway: {
        source: "flutterwave",
        label: "Flutterwave",
        available: bankGatewayBalance,
        ledger: flutterwaveLedger,
        status: flutterwaveStatus,
        detail_path: "/flutterwave",
        role: "Bank & payment gateway float",
      },
      vendors,
      metrics: {
        total_treasury_assets: totalTreasuryAssets,
        bank_gateway_balance: bankGatewayBalance,
        vendor_wallet_total: syncedVendorTotal,
        customer_wallet_liability: customerLiability,
        profile_balance_total: profileBalanceTotal,
        wallet_count: walletCount ?? 0,
        pending_refund_obligations: pendingRefundObligation,
        available_liquidity: availableLiquidity,
        liquidity_coverage_pct: coveragePct,
        liquidity_status: liqStatus,
        platform_revenue_period: periodRevenue,
        platform_revenue_all_time: allTimeRevenue,
        platform_expenses_period: 0,
        net_profit_period: periodRevenue,
        txn_count_period: txnCount,
        txn_volume_period: txnVolume,
        funding_volume_period: fundingVolume,
        funding_count_period: fundingCount,
        vendor_spend_volume_period: vendorSpendVolume,
        vendor_spend_count_period: vendorSpendCount,
        avg_daily_vendor_spend_7d: avgDailyVendorSpend,
        ledger_mismatch_count: num((ledgerSummary as { mismatch_count?: number })?.mismatch_count),
        ledger_summary_available: !ledgerError && !!ledgerSummary,
      },
      mismatches: mismatches || [],
      alerts: [
        ...(liqStatus === "critical" || liqStatus === "low"
          ? [{
            severity: liqStatus === "critical" ? "critical" : "warning",
            code: "liquidity",
            message: `Liquidity coverage is ${liqStatus}${coveragePct != null ? ` (${coveragePct.toFixed(1)}%)` : ""}.`,
          }]
          : []),
        ...vendors
          .filter((v) => v.status === "critical" || v.status === "low")
          .map((v) => ({
            severity: v.status === "critical" ? "critical" : "warning",
            code: "vendor_balance",
            message: `${v.label} balance is ${v.status.replace("_", " ")} (${v.balance != null ? `₦${v.balance.toLocaleString("en-NG")}` : "n/a"}).`,
            vendor: v.key,
          })),
        ...vendors
          .filter((v) => v.status === "error")
          .map((v) => ({
            severity: "warning",
            code: "vendor_sync",
            message: `${v.label} balance could not be synchronized.`,
            vendor: v.key,
          })),
        ...(flutterwaveStatus === "error" || flutterwaveStatus === "unconfigured"
          ? [{
            severity: "warning",
            code: "bank_gateway_sync",
            message: flutterwaveStatus === "unconfigured"
              ? "Flutterwave credentials are not configured."
              : "Flutterwave (bank/gateway) balance could not be synchronized.",
          }]
          : []),
      ],
    });
  } catch (error) {
    console.error("get-treasury-summary error:", error);
    return errorResponse(error instanceof Error ? error : new Error("Unexpected error"), 500);
  }
});
