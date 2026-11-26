import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { formatNaira } from "@/lib/currency";
import { fetchEbillsApiTransactions } from "@/lib/ebills-transactions";
import {
  DEFAULT_VENDING_PROVIDERS,
  VENDING_SETTING_KEYS,
  type VendingProviders,
} from "@/lib/vending-settings";
import type { LedgerBalanceMismatch } from "@/lib/ledger-balance";
import { MOBILENIG_GATEWAY_FUNCTION, mobilenigActions } from "@/lib/mobilenig-gateway";
import { invokeAuthedFunction } from "@/lib/invoke-authed-function";
import { UserBalanceReconcileDialog } from "@/components/UserBalanceReconcileDialog";
import {
  TREASURY_DATE_PRESETS,
  type TreasuryAlert,
  type TreasuryBalanceStatus,
  type TreasuryDatePreset,
  type TreasuryLiquidityStatus,
  type TreasurySummaryResponse,
  type TreasuryVendorBalance,
} from "@/lib/treasury-summary";
import { format } from "date-fns";
import {
  AlertCircle,
  ArrowUpRight,
  Banknote,
  CreditCard,
  History,
  RefreshCw,
  Search,
  Settings2,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";

const TREASURY_THRESHOLD_KEY = "treasury_low_balance_threshold";
const TREASURY_LIQUIDITY_KEY = "treasury_liquidity_thresholds";

type VendorTxnKey = "smeplug" | "ebills" | "payvessel" | "mobilenig" | "flutterwave";

interface TreasuryTransaction {
  id: string;
  reference?: string | null;
  transaction_type?: string | null;
  amount?: number | null;
  created_at: string;
  profiles?: {
    full_name?: string | null;
    email?: string | null;
  } | null;
}

interface VendorTransaction {
  id: string;
  vendor: VendorTxnKey;
  reference: string;
  type: "debit" | "credit" | string;
  service?: string;
  description?: string;
  amount: number;
  balanceAfter?: number | null;
  status: string;
  createdAt: string;
  userName?: string | null;
  userEmail?: string | null;
}

const VENDOR_LABELS: Record<VendorTxnKey, string> = {
  smeplug: "SMEPLUG",
  ebills: "eBills Africa",
  mobilenig: "MobileNig",
  payvessel: "PayVessel",
  flutterwave: "Flutterwave",
};

type ServiceKey = keyof VendingProviders;

const SERVICE_LABELS: Record<ServiceKey, string> = {
  airtime: "Airtime",
  data: "Data",
  cable: "Cable TV",
  electricity: "Electricity",
  betting: "Betting",
};

const SERVICE_ADMIN_PATHS: Record<ServiceKey, string> = {
  airtime: "/airtime",
  data: "/data-plans",
  cable: "/cable-tv",
  electricity: "/electricity",
  betting: "/betting",
};

function parseProviderSetting(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "provider" in value) {
    return String((value as { provider?: string }).provider || "");
  }
  return "";
}

function formatVendorLabel(provider: string): string {
  const normalized = provider.toLowerCase();
  if (normalized === "ebills" || normalized === "ebills.africa") return "eBills Africa";
  if (normalized === "smeplug") return "SMEPLUG";
  if (normalized === "mobilenig") return "MobileNig";
  if (normalized === "vtpass") return "VTPass";
  if (normalized === "anyone") return "ANYONE";
  if (normalized === "flutterwave") return "Flutterwave";
  return provider || "N/A";
}

function getEbillsServiceLabel(service: string): string {
  switch (service) {
    case "electricity":
      return "Electricity";
    case "betting":
      return "Betting";
    case "cable_tv":
      return "Cable TV";
    case "education":
      return "Education";
    case "data":
      return "Data";
    case "airtime":
      return "Airtime";
    default:
      return service;
  }
}

function mapWalletHistoryTx(
  vendor: VendorTxnKey,
  tx: Record<string, unknown>,
  index: number,
): VendorTransaction {
  const transId = String(tx.transaction_id || tx.trans_id || tx.id || tx.reference || `${vendor}-${index}`);
  const transType = String(tx.type || "CR");
  const isDebit = transType === "DR" || transType === "debit";
  const amount = Math.abs(parseFloat(String(tx.amount || "0")));
  const date = String(tx.date || tx.created_at || new Date().toISOString());
  const balanceRaw = tx.final_balance ?? tx.balance ?? tx.initial_balance;

  return {
    id: transId,
    vendor,
    reference: transId,
    type: isDebit ? "debit" : "credit",
    service: String(tx.service || ""),
    description: String(tx.description || "Wallet transaction"),
    amount,
    balanceAfter: balanceRaw != null ? parseFloat(String(balanceRaw)) : null,
    status: String(tx.status || "completed"),
    createdAt: date,
  };
}

function mapEbillsDbTx(tx: Record<string, unknown>, serviceType: string): VendorTransaction {
  const profiles = tx.profiles as { full_name?: string | null; email?: string | null } | null | undefined;
  const detail =
    tx.meter_number ||
    tx.phone_number ||
    tx.account_number ||
    tx.smartcard_number ||
    tx.customer_name ||
    tx.plan_name ||
    tx.network ||
    tx.betting_provider;

  return {
    id: String(tx.id),
    vendor: "ebills",
    reference: String(tx.reference || tx.id),
    type: "debit",
    service: serviceType,
    description: detail ? String(detail) : getEbillsServiceLabel(serviceType),
    amount: Number(tx.amount ?? tx.purchase_amount ?? 0),
    balanceAfter: tx.balance_after != null ? Number(tx.balance_after) : null,
    status: String(tx.status || "unknown"),
    createdAt: String(tx.created_at),
    userName: profiles?.full_name,
    userEmail: profiles?.email,
  };
}

async function fetchEbillsVendorTransactions(): Promise<VendorTransaction[]> {
  const rows = await fetchEbillsApiTransactions();
  return rows
    .map((tx) => mapEbillsDbTx(tx as unknown as Record<string, unknown>, tx.service_type))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

function mapFlutterwaveFundingTx(tx: Record<string, unknown>): VendorTransaction {
  const profiles = tx.profiles as { full_name?: string | null; email?: string | null } | null | undefined;

  return {
    id: String(tx.id),
    vendor: "flutterwave",
    reference: String(tx.reference || tx.id),
    type: "credit",
    service: "wallet_funding",
    description: tx.account_name ? String(tx.account_name) : "Flutterwave checkout",
    amount: Number(tx.amount ?? 0),
    balanceAfter: null,
    status: String(tx.status || "unknown"),
    createdAt: String(tx.created_at),
    userName: profiles?.full_name,
    userEmail: profiles?.email,
  };
}

async function fetchFlutterwaveVendorTransactions(): Promise<VendorTransaction[]> {
  const { data, error } = await supabase
    .from("funding_transactions")
    .select(`
      id,
      reference,
      amount,
      status,
      bank_name,
      account_name,
      account_number,
      created_at,
      profiles:user_id (
        full_name,
        email
      )
    `)
    .ilike("bank_name", "%flutterwave%")
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) throw error;

  return (data || []).map((row) => mapFlutterwaveFundingTx(row as Record<string, unknown>));
}

function ledgerTypeLabel(type: string | null | undefined): string {
  return (type || "unknown").replace(/_/g, " ");
}

function activityStatusForType(type: string | null | undefined): { label: string; variant: "default" | "secondary" | "outline" } {
  const t = (type || "").toLowerCase();
  if (t.includes("refund")) return { label: "Refund", variant: "secondary" };
  if (t.includes("fee")) return { label: "Fee", variant: "outline" };
  if (t.includes("credit") || t.includes("funding") || t.includes("fund")) return { label: "Credit", variant: "default" };
  if (t.includes("debit") || t.includes("purchase") || t.includes("transfer")) return { label: "Debit", variant: "secondary" };
  return { label: "Recorded", variant: "outline" };
}

function balanceStatusBadge(status: TreasuryBalanceStatus) {
  switch (status) {
    case "ok":
      return <Badge className="bg-green-100 text-green-800 border-green-200">Healthy</Badge>;
    case "low":
      return <Badge className="bg-amber-100 text-amber-800 border-amber-200">Low Balance</Badge>;
    case "critical":
      return <Badge variant="destructive">Critical</Badge>;
    case "unconfigured":
      return <Badge variant="outline">Not Configured</Badge>;
    default:
      return <Badge variant="destructive">Unavailable</Badge>;
  }
}

function liquidityStatusBadge(status: TreasuryLiquidityStatus) {
  switch (status) {
    case "healthy":
      return <Badge className="bg-green-100 text-green-800 border-green-200">Healthy</Badge>;
    case "moderate":
      return <Badge className="bg-sky-100 text-sky-800 border-sky-200">Moderate</Badge>;
    case "low":
      return <Badge className="bg-amber-100 text-amber-800 border-amber-200">Low Liquidity</Badge>;
    case "critical":
      return <Badge variant="destructive">Critical Liquidity</Badge>;
    default:
      return <Badge variant="outline">Unknown</Badge>;
  }
}

export default function Treasury() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);

  const [datePreset, setDatePreset] = useState<TreasuryDatePreset>("today");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");

  const [summary, setSummary] = useState<TreasurySummaryResponse | null>(null);
  const [alerts, setAlerts] = useState<TreasuryAlert[]>([]);
  const [vendors, setVendors] = useState<TreasuryVendorBalance[]>([]);
  const [ledgerMismatches, setLedgerMismatches] = useState<LedgerBalanceMismatch[]>([]);
  const [reconcileUserId, setReconcileUserId] = useState<string | null>(null);
  const [reconcileDialogOpen, setReconcileDialogOpen] = useState(false);
  const [vendingProviders, setVendingProviders] = useState<VendingProviders>(DEFAULT_VENDING_PROVIDERS);

  const [lowThresholdInput, setLowThresholdInput] = useState("5000");
  const [criticalThresholdInput, setCriticalThresholdInput] = useState("2000");
  const [healthyMinInput, setHealthyMinInput] = useState("100");
  const [moderateMinInput, setModerateMinInput] = useState("75");
  const [lowMinInput, setLowMinInput] = useState("50");
  const [savingSettings, setSavingSettings] = useState(false);

  const [transactions, setTransactions] = useState<TreasuryTransaction[]>([]);
  const [loadingTransactions, setLoadingTransactions] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");

  const [selectedVendor, setSelectedVendor] = useState<VendorTxnKey>("smeplug");
  const [vendorTransactions, setVendorTransactions] = useState<VendorTransaction[]>([]);
  const [loadingVendorTransactions, setLoadingVendorTransactions] = useState(false);
  const [vendorSearchQuery, setVendorSearchQuery] = useState("");
  const [vendorStatusFilter, setVendorStatusFilter] = useState("all");
  const [vendorServiceFilter, setVendorServiceFilter] = useState("all");
  const [vendorPage, setVendorPage] = useState(1);
  const [vendorTransIdSearch, setVendorTransIdSearch] = useState("");
  const [activeTab, setActiveTab] = useState("overview");

  const metrics = summary?.metrics;
  const bankGateway = summary?.bank_gateway;
  const bands = summary?.settings?.liquidity_bands;

  const fetchVendingProviders = useCallback(async () => {
    const { data } = await supabase
      .from("app_settings")
      .select("setting_key, setting_value")
      .in("setting_key", [...VENDING_SETTING_KEYS]);

    const map: Record<string, string> = {};
    for (const row of data || []) {
      map[row.setting_key] = parseProviderSetting(row.setting_value);
    }

    setVendingProviders({
      airtime: map.airtime_provider || DEFAULT_VENDING_PROVIDERS.airtime,
      data: map.data_provider || DEFAULT_VENDING_PROVIDERS.data,
      cable: map.cable_provider || DEFAULT_VENDING_PROVIDERS.cable,
      electricity: map.electricity_provider || DEFAULT_VENDING_PROVIDERS.electricity,
      betting: map.betting_provider || DEFAULT_VENDING_PROVIDERS.betting,
    });
  }, []);

  const fetchRecentTransactions = useCallback(async () => {
    setLoadingTransactions(true);
    try {
      const { data, error } = await supabase
        .from("user_transactions")
        .select(`
          id,
          reference,
          transaction_type,
          amount,
          created_at,
          profiles:user_id (
            full_name,
            email
          )
        `)
        .order("created_at", { ascending: false })
        .limit(100);

      if (error) throw error;
      setTransactions((data as TreasuryTransaction[]) || []);
    } catch (error) {
      console.error("Error fetching treasury transactions:", error);
      toast({
        title: "Activity unavailable",
        description: error instanceof Error ? error.message : "Failed to load recent ledger activity",
        variant: "destructive",
      });
    } finally {
      setLoadingTransactions(false);
    }
  }, [toast]);

  const fetchTreasurySummary = useCallback(async () => {
    const body: Record<string, string> = { preset: datePreset };
    if (datePreset === "custom") {
      if (customStart) body.startDate = new Date(customStart).toISOString();
      if (customEnd) body.endDate = new Date(`${customEnd}T23:59:59`).toISOString();
    }

    const { data, error } = await invokeAuthedFunction("get-treasury-summary", { body });
    if (error) throw error;
    if (!data?.success) throw new Error(data?.error || "Failed to load treasury summary");

    const payload = data as TreasurySummaryResponse;
    setSummary(payload);
    setVendors(payload.vendors || []);
    setAlerts(payload.alerts || []);
    setLedgerMismatches((payload.mismatches as LedgerBalanceMismatch[]) || []);

    if (payload.settings) {
      setLowThresholdInput(String(payload.settings.low_balance_threshold));
      setCriticalThresholdInput(String(payload.settings.critical_balance_threshold));
      setHealthyMinInput(String(payload.settings.liquidity_bands.healthy_min_pct));
      setModerateMinInput(String(payload.settings.liquidity_bands.moderate_min_pct));
      setLowMinInput(String(payload.settings.liquidity_bands.low_min_pct));
    }

    setLastSyncedAt(payload.synced_at ? new Date(payload.synced_at) : new Date());
  }, [customEnd, customStart, datePreset]);

  const fetchVendorTransactions = useCallback(async () => {
    setLoadingVendorTransactions(true);
    try {
      if (selectedVendor === "ebills") {
        const rows = await fetchEbillsVendorTransactions();
        setVendorTransactions(rows);
        return;
      }

      if (selectedVendor === "flutterwave") {
        const rows = await fetchFlutterwaveVendorTransactions();
        setVendorTransactions(rows);
        return;
      }

      const functionByVendor: Record<Exclude<VendorTxnKey, "ebills" | "flutterwave">, string> = {
        smeplug: "fetch-smeplug-wallet-history",
        payvessel: "fetch-payvessel-transactions",
        mobilenig: MOBILENIG_GATEWAY_FUNCTION,
      };

      const payload = selectedVendor === "mobilenig"
        ? mobilenigActions.walletHistory(
            vendorTransIdSearch.trim()
              ? { trans_id: vendorTransIdSearch.trim() }
              : { page: vendorPage, per_page: 15 },
          )
        : vendorTransIdSearch.trim()
          ? { trans_id: vendorTransIdSearch.trim() }
          : { page: vendorPage, per_page: 15 };

      const { data, error } = await invokeAuthedFunction(functionByVendor[selectedVendor], {
        body: payload,
      });

      if (error) throw error;
      if (!data?.success) {
        throw new Error(data?.error || data?.message || "Failed to fetch vendor transactions");
      }

      const rows = (data.transactions || []).map((tx: Record<string, unknown>, index: number) =>
        mapWalletHistoryTx(selectedVendor, tx, index),
      );
      setVendorTransactions(rows);
    } catch (error) {
      console.error("Error fetching vendor transactions:", error);
      setVendorTransactions([]);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to fetch vendor transactions",
        variant: "destructive",
      });
    } finally {
      setLoadingVendorTransactions(false);
    }
  }, [selectedVendor, toast, vendorPage, vendorTransIdSearch]);

  useEffect(() => {
    if (activeTab === "vendor-txns") {
      void fetchVendorTransactions();
    }
  }, [activeTab, fetchVendorTransactions]);

  const loadTreasury = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);

      try {
        await Promise.all([
          fetchTreasurySummary(),
          fetchVendingProviders(),
          fetchRecentTransactions(),
        ]);
      } catch (error) {
        console.error("Treasury load failed:", error);
        toast({
          title: "Error",
          description: error instanceof Error ? error.message : "Failed to load treasury data",
          variant: "destructive",
        });
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [fetchRecentTransactions, fetchTreasurySummary, fetchVendingProviders, toast],
  );

  useEffect(() => {
    const init = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        navigate("/auth");
        return;
      }

      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", session.user.id)
        .eq("role", "admin")
        .maybeSingle();

      if (!roles) {
        toast({
          title: "Access Denied",
          description: "You don't have permission to access this page",
          variant: "destructive",
        });
        navigate("/dashboard");
        return;
      }

      await loadTreasury();
    };

    void init();
  }, [loadTreasury, navigate, toast]);

  const skipNextDateEffect = useRef(true);
  useEffect(() => {
    if (skipNextDateEffect.current) {
      skipNextDateEffect.current = false;
      return;
    }
    void fetchTreasurySummary().catch((error) => {
      console.error(error);
      toast({
        title: "Summary refresh failed",
        description: error instanceof Error ? error.message : "Could not refresh period metrics",
        variant: "destructive",
      });
    });
  }, [datePreset, customStart, customEnd, fetchTreasurySummary, toast]);

  const saveTreasurySettings = async () => {
    const low = Number(lowThresholdInput);
    const critical = Number(criticalThresholdInput);
    const healthy = Number(healthyMinInput);
    const moderate = Number(moderateMinInput);
    const lowBand = Number(lowMinInput);

    if (![low, critical, healthy, moderate, lowBand].every((n) => Number.isFinite(n) && n >= 0)) {
      toast({
        title: "Invalid settings",
        description: "Enter valid non-negative numbers",
        variant: "destructive",
      });
      return;
    }
    if (!(healthy >= moderate && moderate >= lowBand)) {
      toast({
        title: "Invalid liquidity bands",
        description: "Require Healthy ≥ Moderate ≥ Low (percentage floors)",
        variant: "destructive",
      });
      return;
    }

    setSavingSettings(true);
    try {
      const { error: thresholdError } = await supabase.from("app_settings").upsert(
        {
          setting_key: TREASURY_THRESHOLD_KEY,
          setting_value: { threshold: low, critical_threshold: critical },
          setting_category: "system",
          description: "Vendor wallet low/critical balance alerts (NGN). Flutterwave is bank/gateway, not vending float.",
        },
        { onConflict: "setting_key" },
      );
      if (thresholdError) throw thresholdError;

      const { error: liquidityError } = await supabase.from("app_settings").upsert(
        {
          setting_key: TREASURY_LIQUIDITY_KEY,
          setting_value: {
            healthy_min_pct: healthy,
            moderate_min_pct: moderate,
            low_min_pct: lowBand,
            bank_gateway_source: "flutterwave",
          },
          setting_category: "system",
          description: "Liquidity coverage bands (%). Bank/gateway balance is read from Flutterwave API.",
        },
        { onConflict: "setting_key" },
      );
      if (liquidityError) throw liquidityError;

      toast({ title: "Saved", description: "Treasury thresholds updated" });
      await fetchTreasurySummary();
    } catch (error) {
      console.error("Failed to save treasury settings:", error);
      toast({
        title: "Error",
        description: "Failed to save treasury settings",
        variant: "destructive",
      });
    } finally {
      setSavingSettings(false);
    }
  };

  const filteredTransactions = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return transactions.filter((txn) => {
      const matchesType = typeFilter === "all" || txn.transaction_type === typeFilter;
      if (!matchesType) return false;
      if (!query) return true;
      return (
        txn.reference?.toLowerCase().includes(query) ||
        txn.transaction_type?.toLowerCase().includes(query) ||
        txn.profiles?.full_name?.toLowerCase().includes(query) ||
        txn.profiles?.email?.toLowerCase().includes(query)
      );
    });
  }, [transactions, searchQuery, typeFilter]);

  const transactionTypes = useMemo(() => {
    const types = new Set<string>();
    for (const txn of transactions) {
      if (txn.transaction_type) types.add(txn.transaction_type);
    }
    return Array.from(types).sort();
  }, [transactions]);

  const showVendorUserColumn = selectedVendor === "ebills" || selectedVendor === "flutterwave";
  const vendorTableColSpan = showVendorUserColumn ? 9 : 8;

  const vendorServiceTypes = useMemo(() => {
    const types = new Set<string>();
    for (const txn of vendorTransactions) {
      if (txn.service) types.add(txn.service);
    }
    return Array.from(types).sort();
  }, [vendorTransactions]);

  const filteredVendorTransactions = useMemo(() => {
    const query = vendorSearchQuery.trim().toLowerCase();
    return vendorTransactions.filter((txn) => {
      const matchesStatus =
        vendorStatusFilter === "all" || txn.status.toLowerCase() === vendorStatusFilter.toLowerCase();
      const matchesService = vendorServiceFilter === "all" || txn.service === vendorServiceFilter;
      if (!matchesStatus || !matchesService) return false;
      if (!query) return true;
      return (
        txn.reference.toLowerCase().includes(query) ||
        txn.description?.toLowerCase().includes(query) ||
        txn.service?.toLowerCase().includes(query) ||
        txn.userName?.toLowerCase().includes(query) ||
        txn.userEmail?.toLowerCase().includes(query)
      );
    });
  }, [vendorTransactions, vendorSearchQuery, vendorStatusFilter, vendorServiceFilter]);

  const coveragePct = metrics?.liquidity_coverage_pct ?? null;
  const gaugeValue = coveragePct == null ? 0 : Math.max(0, Math.min(150, coveragePct));
  const gaugeProgress = (gaugeValue / 150) * 100;

  const overviewCards = (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Financial overview</h2>
          <p className="text-sm text-muted-foreground">
            Bank/gateway float from Flutterwave · vendor float excludes failed syncs
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <Label className="text-xs">Period</Label>
            <Select value={datePreset} onValueChange={(v) => setDatePreset(v as TreasuryDatePreset)}>
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TREASURY_DATE_PRESETS.map((preset) => (
                  <SelectItem key={preset.value} value={preset.value}>
                    {preset.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {datePreset === "custom" && (
            <>
              <div className="space-y-1">
                <Label className="text-xs">Start</Label>
                <Input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">End</Label>
                <Input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} />
              </div>
            </>
          )}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Treasury Assets</CardDescription>
            <CardTitle className="text-2xl">
              {loading ? <Skeleton className="h-8 w-28" /> : formatNaira(metrics?.total_treasury_assets || 0)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              FLW + synced vendors · updated {lastSyncedAt ? format(lastSyncedAt, "HH:mm") : "—"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <Banknote className="h-4 w-4" /> Bank / Gateway (Flutterwave)
            </CardDescription>
            <CardTitle className="text-2xl">
              {loading ? (
                <Skeleton className="h-8 w-28" />
              ) : bankGateway?.available != null && bankGateway.status !== "error" ? (
                formatNaira(bankGateway.available)
              ) : (
                "—"
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {bankGateway && balanceStatusBadge(bankGateway.status)}
            <Link to="/flutterwave" className="text-sm text-primary inline-flex items-center gap-1 hover:underline">
              Open Flutterwave <ArrowUpRight className="h-3 w-3" />
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <Wallet className="h-4 w-4" /> Vendor Wallet Total
            </CardDescription>
            <CardTitle className="text-2xl">
              {loading ? <Skeleton className="h-8 w-28" /> : formatNaira(metrics?.vendor_wallet_total || 0)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">Only successfully synced provider balances</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <Users className="h-4 w-4" /> Customer Wallet Liability
            </CardDescription>
            <CardTitle className="text-2xl">
              {loading ? <Skeleton className="h-8 w-28" /> : formatNaira(metrics?.customer_wallet_liability || 0)}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-sm text-muted-foreground">
              {(metrics?.wallet_count || 0).toLocaleString()} wallets (ledger)
            </p>
            {!loading && (metrics?.ledger_mismatch_count || 0) > 0 && (
              <Alert variant="destructive" className="py-2">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="text-xs space-y-2">
                  <p>
                    {metrics?.ledger_mismatch_count} profile cache mismatch
                    {metrics?.ledger_mismatch_count === 1 ? "" : "es"}.{" "}
                    <Link to="/ledger#balance-drift" className="underline font-medium">
                      Review in Ledger
                    </Link>
                  </p>
                  {ledgerMismatches.slice(0, 2).map((row) => (
                    <div key={row.user_id} className="flex items-center justify-between gap-2">
                      <span>
                        {row.full_name || row.email || row.user_id.slice(0, 8)} · drift {formatNaira(row.drift)}
                      </span>
                      <Button
                        variant="secondary"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => {
                          setReconcileUserId(row.user_id);
                          setReconcileDialogOpen(true);
                        }}
                      >
                        View
                      </Button>
                    </div>
                  ))}
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Available Liquidity</CardDescription>
            <CardTitle className="text-2xl">
              {loading ? <Skeleton className="h-8 w-28" /> : formatNaira(metrics?.available_liquidity || 0)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              Assets − (liability + pending refunds {formatNaira(metrics?.pending_refund_obligations || 0)})
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-2">
              <CardDescription>Liquidity Coverage</CardDescription>
              {!loading && metrics && liquidityStatusBadge(metrics.liquidity_status)}
            </div>
            <CardTitle className="text-2xl">
              {loading ? (
                <Skeleton className="h-8 w-28" />
              ) : coveragePct != null ? (
                `${coveragePct.toFixed(1)}%`
              ) : (
                "—"
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Progress value={gaugeProgress} className="h-2" />
            <p className="text-xs text-muted-foreground">
              Bands: Healthy ≥{bands?.healthy_min_pct ?? 100}% · Moderate ≥{bands?.moderate_min_pct ?? 75}% · Low ≥
              {bands?.low_min_pct ?? 50}%
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4" /> Platform Revenue (period)
            </CardDescription>
            <CardTitle className="text-2xl">
              {loading ? <Skeleton className="h-8 w-28" /> : formatNaira(metrics?.platform_revenue_period || 0)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Link to="/platform-revenue" className="text-sm text-primary inline-flex items-center gap-1 hover:underline">
              All-time {formatNaira(metrics?.platform_revenue_all_time || 0)} <ArrowUpRight className="h-3 w-3" />
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Net Profit (period)</CardDescription>
            <CardTitle className="text-2xl">
              {loading ? <Skeleton className="h-8 w-28" /> : formatNaira(metrics?.net_profit_period || 0)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              Revenue − tracked expenses ({formatNaira(metrics?.platform_expenses_period || 0)})
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Transactions (period)</CardDescription>
            <CardTitle className="text-2xl">
              {loading ? <Skeleton className="h-8 w-20" /> : (metrics?.txn_count_period || 0).toLocaleString()}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">Volume {formatNaira(metrics?.txn_volume_period || 0)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Funding (completed)</CardDescription>
            <CardTitle className="text-2xl">
              {loading ? <Skeleton className="h-8 w-28" /> : formatNaira(metrics?.funding_volume_period || 0)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              {(metrics?.funding_count_period || 0).toLocaleString()} completed fundings
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Vendor spend (period)</CardDescription>
            <CardTitle className="text-2xl">
              {loading ? <Skeleton className="h-8 w-28" /> : formatNaira(metrics?.vendor_spend_volume_period || 0)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              {(metrics?.vendor_spend_count_period || 0).toLocaleString()} successful purchases
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>7-day avg daily spend</CardDescription>
            <CardTitle className="text-2xl">
              {loading ? <Skeleton className="h-8 w-28" /> : formatNaira(metrics?.avg_daily_vendor_spend_7d || 0)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">Used for vendor runway estimates</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );

  const vendorWalletGrid = (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {bankGateway && (
        <Card className="border-primary/30">
          <CardHeader>
            <div className="flex items-start justify-between gap-2">
              <div>
                <CardTitle className="text-lg">{bankGateway.label}</CardTitle>
                <CardDescription>{bankGateway.role}</CardDescription>
              </div>
              {balanceStatusBadge(bankGateway.status)}
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading ? (
              <Skeleton className="h-10 w-full" />
            ) : bankGateway.available != null && bankGateway.status !== "error" ? (
              <p className="text-3xl font-bold text-primary">{formatNaira(bankGateway.available)}</p>
            ) : (
              <p className="text-sm text-muted-foreground">
                {bankGateway.status === "unconfigured" ? "Credentials not configured" : "Balance unavailable"}
              </p>
            )}
            <p className="text-xs text-muted-foreground">Counted as bank/gateway assets · not in vendor float</p>
            <Button asChild variant="outline" size="sm" className="w-full">
              <Link to={bankGateway.detail_path}>Manage Flutterwave</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {vendors.map((wallet) => (
        <Card key={wallet.key}>
          <CardHeader>
            <div className="flex items-start justify-between gap-2">
              <div>
                <CardTitle className="text-lg">{wallet.label}</CardTitle>
                <CardDescription>{wallet.role}</CardDescription>
              </div>
              {balanceStatusBadge(wallet.status)}
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading ? (
              <Skeleton className="h-10 w-full" />
            ) : wallet.balance != null ? (
              <p className="text-3xl font-bold text-primary">{formatNaira(wallet.balance)}</p>
            ) : (
              <p className="text-sm text-muted-foreground">
                {wallet.status === "unconfigured" ? "Credentials not configured" : "Balance unavailable"}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              {wallet.estimatedDaysRemaining != null
                ? `~${wallet.estimatedDaysRemaining} days of runway at 7-day avg spend`
                : `Alert below ${formatNaira(summary?.settings?.low_balance_threshold || 5000)}`}
            </p>
            <Button asChild variant="outline" size="sm" className="w-full">
              <Link to={wallet.detailPath}>Manage {wallet.label}</Link>
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );

  const activityTable = (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <CardTitle>Recent Platform Activity</CardTitle>
            <CardDescription>Latest wallet ledger movements across user accounts</CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchRecentTransactions}
            disabled={loadingTransactions}
            className="gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${loadingTransactions ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-3 sm:flex-row mb-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search reference, user, type..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[220px]">
              <SelectValue placeholder="Transaction type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {transactionTypes.map((type) => (
                <SelectItem key={type} value={type}>
                  {ledgerTypeLabel(type)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Reference</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loadingTransactions ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    Loading activity...
                  </TableCell>
                </TableRow>
              ) : filteredTransactions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    No transactions found
                  </TableCell>
                </TableRow>
              ) : (
                filteredTransactions.slice(0, 25).map((txn) => {
                  const status = activityStatusForType(txn.transaction_type);
                  return (
                    <TableRow key={txn.id}>
                      <TableCell className="font-mono text-xs">{txn.reference || txn.id.slice(0, 8)}</TableCell>
                      <TableCell>
                        <div className="font-medium">{txn.profiles?.full_name || "User"}</div>
                        {txn.profiles?.email && (
                          <div className="text-xs text-muted-foreground">{txn.profiles.email}</div>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{ledgerTypeLabel(txn.transaction_type)}</Badge>
                      </TableCell>
                      <TableCell className="text-right font-medium">{formatNaira(Number(txn.amount || 0))}</TableCell>
                      <TableCell>
                        <Badge variant={status.variant}>{status.label}</Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {format(new Date(txn.created_at), "MMM d, yyyy HH:mm")}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );

  const vendorTransactionsPanel = (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <History className="h-5 w-5" /> Vendor Transactions
            </CardTitle>
            <CardDescription>Wallet ledger and platform purchases per vendor</CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={selectedVendor}
              onValueChange={(value) => {
                setSelectedVendor(value as VendorTxnKey);
                setVendorPage(1);
                setVendorTransIdSearch("");
                setVendorSearchQuery("");
                setVendorStatusFilter("all");
                setVendorServiceFilter("all");
              }}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(VENDOR_LABELS) as VendorTxnKey[]).map((key) => (
                  <SelectItem key={key} value={key}>
                    {VENDOR_LABELS[key]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              onClick={fetchVendorTransactions}
              disabled={loadingVendorTransactions}
              className="gap-2"
            >
              <RefreshCw className={`h-4 w-4 ${loadingVendorTransactions ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link
                to={
                  selectedVendor === "flutterwave"
                    ? "/flutterwave"
                    : vendors.find((w) => w.key === selectedVendor)?.detailPath || "/treasury"
                }
              >
                Open {VENDOR_LABELS[selectedVendor]} <ArrowUpRight className="h-3 w-3 ml-1" />
              </Link>
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-3 lg:flex-row mb-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search reference, user, service..."
              value={vendorSearchQuery}
              onChange={(e) => setVendorSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          {selectedVendor !== "ebills" && selectedVendor !== "flutterwave" && (
            <div className="flex gap-2 max-w-md">
              <Input
                placeholder="Search by transaction ID..."
                value={vendorTransIdSearch}
                onChange={(e) => setVendorTransIdSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void fetchVendorTransactions()}
              />
              <Button variant="outline" size="icon" onClick={() => void fetchVendorTransactions()}>
                <Search className="h-4 w-4" />
              </Button>
            </div>
          )}
          <Select value={vendorStatusFilter} onValueChange={setVendorStatusFilter}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="success">Success</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="processing">Processing</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
            </SelectContent>
          </Select>
          {selectedVendor === "ebills" && (
            <Select value={vendorServiceFilter} onValueChange={setVendorServiceFilter}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Service" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Services</SelectItem>
                {vendorServiceTypes.map((service) => (
                  <SelectItem key={service} value={service}>
                    {getEbillsServiceLabel(service)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Reference</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Service</TableHead>
                <TableHead>Description</TableHead>
                {showVendorUserColumn && <TableHead>User</TableHead>}
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-right">Balance After</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loadingVendorTransactions ? (
                <TableRow>
                  <TableCell colSpan={vendorTableColSpan} className="text-center py-8 text-muted-foreground">
                    Loading vendor transactions...
                  </TableCell>
                </TableRow>
              ) : filteredVendorTransactions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={vendorTableColSpan} className="text-center py-8 text-muted-foreground">
                    No vendor transactions found
                  </TableCell>
                </TableRow>
              ) : (
                filteredVendorTransactions.map((txn) => {
                  const isDebit = txn.type === "debit";
                  return (
                    <TableRow key={`${txn.vendor}-${txn.id}`}>
                      <TableCell className="text-sm whitespace-nowrap">
                        {format(new Date(txn.createdAt), "MMM d, yyyy HH:mm")}
                      </TableCell>
                      <TableCell className="font-mono text-xs max-w-[120px] truncate">{txn.reference}</TableCell>
                      <TableCell>
                        <Badge variant={isDebit ? "destructive" : "default"}>
                          {isDebit ? "Debit" : "Credit"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        {txn.service === "wallet_funding"
                          ? "Wallet Funding"
                          : txn.service
                            ? getEbillsServiceLabel(txn.service)
                            : "—"}
                      </TableCell>
                      <TableCell className="text-sm max-w-[200px] truncate">{txn.description || "—"}</TableCell>
                      {showVendorUserColumn && (
                        <TableCell>
                          <div className="text-sm font-medium">{txn.userName || "User"}</div>
                          {txn.userEmail && (
                            <div className="text-xs text-muted-foreground">{txn.userEmail}</div>
                          )}
                        </TableCell>
                      )}
                      <TableCell className={`text-right font-medium ${isDebit ? "text-red-600" : "text-green-600"}`}>
                        {isDebit ? "-" : "+"}
                        {formatNaira(txn.amount)}
                      </TableCell>
                      <TableCell className="text-right text-sm">
                        {txn.balanceAfter != null ? formatNaira(txn.balanceAfter) : "—"}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            ["completed", "success", "completed-api"].includes(txn.status.toLowerCase())
                              ? "default"
                              : txn.status.toLowerCase() === "failed"
                                ? "destructive"
                                : "secondary"
                          }
                        >
                          {txn.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

        {selectedVendor !== "ebills" && selectedVendor !== "flutterwave" && !vendorTransIdSearch && (
          <div className="flex items-center justify-between mt-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setVendorPage((p) => Math.max(1, p - 1))}
              disabled={vendorPage === 1 || loadingVendorTransactions}
            >
              Previous
            </Button>
            <span className="text-sm text-muted-foreground">Page {vendorPage}</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setVendorPage((p) => p + 1)}
              disabled={vendorTransactions.length < 15 || loadingVendorTransactions}
            >
              Next
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        <main className="flex-1 overflow-auto">
          <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <div className="flex h-16 items-center gap-4 px-6">
              <SidebarTrigger />
              <div className="flex-1">
                <h1 className="text-2xl font-bold">Treasury Management</h1>
                <p className="text-sm text-muted-foreground">
                  Real-time floats, liquidity, and vendor monitoring. Vending providers stay on each service page.
                </p>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                {lastSyncedAt && <span>Synced {format(lastSyncedAt, "h:mm a")}</span>}
                <Button onClick={() => loadTreasury(true)} disabled={refreshing} variant="outline" className="gap-2">
                  <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
                  Refresh All
                </Button>
              </div>
            </div>
          </header>

          <div className="p-6 space-y-6">
            {alerts.length > 0 && (
              <div className="space-y-2">
                {alerts.slice(0, 6).map((alert, index) => (
                  <Alert key={`${alert.code}-${index}`} variant={alert.severity === "critical" ? "destructive" : "default"}>
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{alert.message}</AlertDescription>
                  </Alert>
                ))}
              </div>
            )}

            <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
              <TabsList>
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="vendors">Vendor Wallets</TabsTrigger>
                <TabsTrigger value="vendor-txns">Vendor Transactions</TabsTrigger>
                <TabsTrigger value="settings">Settings</TabsTrigger>
                <TabsTrigger value="activity">Activity</TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="space-y-6">
                {!loading && metrics && !metrics.ledger_summary_available && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      Ledger summary unavailable — showing profile cache totals. Open{" "}
                      <Link to="/ledger" className="underline font-medium">
                        Ledger
                      </Link>{" "}
                      or redeploy <code className="text-xs">get-ledger-summary</code>.
                    </AlertDescription>
                  </Alert>
                )}

                {overviewCards}

                <div className="grid gap-4 md:grid-cols-3">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">Quick Actions</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <Button asChild variant="outline" size="sm" className="w-full justify-start gap-2">
                        <Link to="/wallets">
                          <Wallet className="h-4 w-4" /> Manage user wallets
                        </Link>
                      </Button>
                      <Button asChild variant="outline" size="sm" className="w-full justify-start gap-2">
                        <Link to="/users">
                          <Users className="h-4 w-4" /> All users
                        </Link>
                      </Button>
                      <Button asChild variant="outline" size="sm" className="w-full justify-start gap-2">
                        <Link to="/transactions">
                          <CreditCard className="h-4 w-4" /> All transactions
                        </Link>
                      </Button>
                      <Button asChild variant="outline" size="sm" className="w-full justify-start gap-2">
                        <Link to="/platform-revenue">
                          <TrendingUp className="h-4 w-4" /> Platform revenue
                        </Link>
                      </Button>
                    </CardContent>
                  </Card>

                  <Card className="md:col-span-2">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">Active Vending Providers</CardTitle>
                      <CardDescription>
                        Read-only summary. Change providers on each service management page.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                        {(Object.keys(SERVICE_LABELS) as ServiceKey[]).map((service) => (
                          <Link
                            key={service}
                            to={SERVICE_ADMIN_PATHS[service]}
                            className="rounded-lg border p-3 hover:bg-muted/50 transition-colors"
                          >
                            <p className="text-xs text-muted-foreground">{SERVICE_LABELS[service]}</p>
                            <p className="font-semibold text-sm mt-1">{formatVendorLabel(vendingProviders[service])}</p>
                            <p className="text-[11px] text-primary mt-1 inline-flex items-center gap-1">
                              Manage <ArrowUpRight className="h-3 w-3" />
                            </p>
                          </Link>
                        ))}
                        <Link to="/education" className="rounded-lg border p-3 hover:bg-muted/50 transition-colors">
                          <p className="text-xs text-muted-foreground">Education</p>
                          <p className="font-semibold text-sm mt-1">Manage on page</p>
                          <p className="text-[11px] text-primary mt-1 inline-flex items-center gap-1">
                            Manage <ArrowUpRight className="h-3 w-3" />
                          </p>
                        </Link>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {vendorWalletGrid}
              </TabsContent>

              <TabsContent value="vendors" className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Balances</CardTitle>
                    <CardDescription>
                      Flutterwave is bank/gateway. SMEPLUG, eBills, MobileNig, and PayVessel are vendor float.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>{vendorWalletGrid}</CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="vendor-txns">{vendorTransactionsPanel}</TabsContent>

              <TabsContent value="settings" className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Settings2 className="h-5 w-5" /> Treasury Thresholds
                    </CardTitle>
                    <CardDescription>
                      Vendor balance alerts and liquidity coverage bands. Bank/gateway source is Flutterwave API.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6 max-w-2xl">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="low-balance-threshold">Vendor low balance (₦)</Label>
                        <Input
                          id="low-balance-threshold"
                          type="number"
                          min={0}
                          value={lowThresholdInput}
                          onChange={(e) => setLowThresholdInput(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="critical-balance-threshold">Vendor critical balance (₦)</Label>
                        <Input
                          id="critical-balance-threshold"
                          type="number"
                          min={0}
                          value={criticalThresholdInput}
                          onChange={(e) => setCriticalThresholdInput(e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-3">
                      <div className="space-y-2">
                        <Label>Healthy ≥ %</Label>
                        <Input type="number" min={0} value={healthyMinInput} onChange={(e) => setHealthyMinInput(e.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label>Moderate ≥ %</Label>
                        <Input type="number" min={0} value={moderateMinInput} onChange={(e) => setModerateMinInput(e.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label>Low ≥ %</Label>
                        <Input type="number" min={0} value={lowMinInput} onChange={(e) => setLowMinInput(e.target.value)} />
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Coverage below the Low floor is Critical. Failed vendor syncs are excluded from float totals.
                    </p>
                    <Button onClick={saveTreasurySettings} disabled={savingSettings}>
                      {savingSettings ? "Saving..." : "Save settings"}
                    </Button>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="activity">{activityTable}</TabsContent>
            </Tabs>
          </div>
        </main>
      </div>

      <UserBalanceReconcileDialog
        userId={reconcileUserId}
        open={reconcileDialogOpen}
        onOpenChange={setReconcileDialogOpen}
        onReconciled={() => void loadTreasury(true)}
      />
    </SidebarProvider>
  );
}
