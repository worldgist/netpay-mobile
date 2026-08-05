import { useCallback, useEffect, useMemo, useState } from "react";
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
import { useToast } from "@/hooks/use-toast";
import { formatNaira } from "@/lib/currency";
import {
  DEFAULT_VENDING_PROVIDERS,
  VENDING_SETTING_KEYS,
  type VendingProviders,
} from "@/lib/vending-settings";
import { parseLedgerSummary } from "@/lib/ledger-balance";
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

const DEFAULT_LOW_BALANCE_THRESHOLD = 5000;
const TREASURY_THRESHOLD_KEY = "treasury_low_balance_threshold";

type VendorKey = "smeplug" | "ebills" | "payvessel" | "mobilenig" | "flutterwave";

interface VendorWallet {
  key: VendorKey;
  label: string;
  balance: number | null;
  currency: string;
  status: "ok" | "low" | "error" | "unconfigured";
  detailPath: string;
  subtitle?: string;
  role: string;
}

interface TreasuryTransaction {
  id: string;
  reference?: string | null;
  transaction_type?: string | null;
  amount?: number | null;
  status?: string | null;
  created_at: string;
  profiles?: {
    full_name?: string | null;
    email?: string | null;
  } | null;
}

interface VendorTransaction {
  id: string;
  vendor: VendorKey;
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

const VENDOR_LABELS: Record<VendorKey, string> = {
  smeplug: "SMEPLUG",
  ebills: "eBills Africa",
  mobilenig: "MobileNig",
  payvessel: "PayVessel",
  flutterwave: "Flutterwave",
};

const EBILLS_SERVICE_TABLES = [
  { table: "electricity_transactions", service: "electricity" },
  { table: "betting_transactions", service: "betting" },
  { table: "cable_tv_transactions", service: "cable_tv" },
  { table: "education_transactions", service: "education" },
  { table: "data_transactions", service: "data" },
] as const;

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

const PROVIDER_OPTIONS: Record<ServiceKey, { value: string; label: string }[]> = {
  airtime: [
    { value: "smeplug", label: "SMEPLUG" },
    { value: "ebills", label: "eBills Africa" },
  ],
  data: [
    { value: "smeplug", label: "SMEPLUG" },
    { value: "vtpass", label: "VTPass" },
    { value: "mobilenig", label: "MobileNig" },
    { value: "anyone", label: "ANYONE" },
    { value: "ebills", label: "eBills Africa" },
  ],
  cable: [
    { value: "mobilenig", label: "MobileNig" },
    { value: "vtpass", label: "VTPass" },
    { value: "ebills", label: "eBills Africa" },
    { value: "anyone", label: "ANYONE" },
  ],
  electricity: [
    { value: "vtpass", label: "VTPass" },
    { value: "mobilenig", label: "MobileNig" },
    { value: "ebills", label: "eBills Africa" },
  ],
  betting: [{ value: "ebills", label: "eBills Africa" }],
};

const SETTING_KEY_BY_SERVICE: Record<ServiceKey, string> = {
  airtime: "airtime_provider",
  data: "data_provider",
  cable: "cable_provider",
  electricity: "electricity_provider",
  betting: "betting_provider",
};

function parseProviderSetting(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "provider" in value) {
    return String((value as { provider?: string }).provider || "");
  }
  return "";
}

function parseThresholdSetting(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value && typeof value === "object" && "threshold" in value) {
    const threshold = Number((value as { threshold?: number }).threshold);
    return Number.isFinite(threshold) ? threshold : DEFAULT_LOW_BALANCE_THRESHOLD;
  }
  return DEFAULT_LOW_BALANCE_THRESHOLD;
}

function formatVendorLabel(provider: string): string {
  const normalized = provider.toLowerCase();
  if (normalized === "ebills" || normalized === "ebills.africa") return "eBills Africa";
  if (normalized === "smeplug") return "SMEPLUG";
  if (normalized === "mobilenig") return "MobileNig";
  if (normalized === "vtpass") return "VTPass";
  if (normalized === "anyone") return "ANYONE";
  return provider || "N/A";
}

function createDefaultWallets(threshold: number): VendorWallet[] {
  return [
    {
      key: "smeplug",
      label: "SMEPLUG",
      balance: null,
      currency: "NGN",
      status: "ok",
      detailPath: "/smeplug",
      role: "Airtime & data vending",
    },
    {
      key: "ebills",
      label: "eBills Africa",
      balance: null,
      currency: "NGN",
      status: "ok",
      detailPath: "/ebills",
      role: "Multi-service vending",
    },
    {
      key: "mobilenig",
      label: "MobileNig",
      balance: null,
      currency: "NGN",
      status: "ok",
      detailPath: "/mobilenig",
      role: "Cable & electricity vending",
    },
    {
      key: "payvessel",
      label: "PayVessel",
      balance: null,
      currency: "NGN",
      status: "ok",
      detailPath: "/payvessel",
      subtitle: "Funding gateway",
      role: "User wallet funding",
    },
    {
      key: "flutterwave",
      label: "Flutterwave",
      balance: null,
      currency: "NGN",
      status: "ok",
      detailPath: "/flutterwave",
      subtitle: "Card & bank funding",
      role: "Checkout wallet funding",
    },
  ];
}

function walletStatusForBalance(amount: number, threshold: number): VendorWallet["status"] {
  return amount < threshold ? "low" : "ok";
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
  vendor: VendorKey,
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
    tx.account_number ||
    tx.smartcard_number ||
    tx.customer_name ||
    tx.plan_name ||
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
  const results = await Promise.all(
    EBILLS_SERVICE_TABLES.map(({ table, service }) =>
      supabase
        .from(table)
        .select(`
          *,
          profiles (
            full_name,
            email
          )
        `)
        .eq("vending_provider", "ebills")
        .order("created_at", { ascending: false })
        .limit(50),
    ),
  );

  const all: VendorTransaction[] = [];
  for (let i = 0; i < results.length; i++) {
    const { data } = results[i];
    const service = EBILLS_SERVICE_TABLES[i].service;
    for (const row of data || []) {
      all.push(mapEbillsDbTx(row as Record<string, unknown>, service));
    }
  }

  return all
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 200);
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

export default function Treasury() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);

  const [userWalletLiability, setUserWalletLiability] = useState(0);
  const [profileBalanceTotal, setProfileBalanceTotal] = useState(0);
  const [ledgerMismatchCount, setLedgerMismatchCount] = useState(0);
  const [activeUsers, setActiveUsers] = useState(0);
  const [platformRevenue, setPlatformRevenue] = useState(0);
  const [totalFundingVolume, setTotalFundingVolume] = useState(0);
  const [vendingProviders, setVendingProviders] = useState<VendingProviders>(DEFAULT_VENDING_PROVIDERS);

  const [lowBalanceThreshold, setLowBalanceThreshold] = useState(DEFAULT_LOW_BALANCE_THRESHOLD);
  const [thresholdInput, setThresholdInput] = useState(String(DEFAULT_LOW_BALANCE_THRESHOLD));
  const [savingThreshold, setSavingThreshold] = useState(false);
  const [updatingProvider, setUpdatingProvider] = useState<ServiceKey | null>(null);

  const [vendorWallets, setVendorWallets] = useState<VendorWallet[]>(
    createDefaultWallets(DEFAULT_LOW_BALANCE_THRESHOLD),
  );

  const [transactions, setTransactions] = useState<TreasuryTransaction[]>([]);
  const [loadingTransactions, setLoadingTransactions] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");

  const [selectedVendor, setSelectedVendor] = useState<VendorKey>("smeplug");
  const [vendorTransactions, setVendorTransactions] = useState<VendorTransaction[]>([]);
  const [loadingVendorTransactions, setLoadingVendorTransactions] = useState(false);
  const [vendorSearchQuery, setVendorSearchQuery] = useState("");
  const [vendorStatusFilter, setVendorStatusFilter] = useState("all");
  const [vendorServiceFilter, setVendorServiceFilter] = useState("all");
  const [vendorPage, setVendorPage] = useState(1);
  const [vendorTransIdSearch, setVendorTransIdSearch] = useState("");
  const [activeTab, setActiveTab] = useState("overview");

  const fetchTreasurySettings = useCallback(async () => {
    const { data } = await supabase
      .from("app_settings")
      .select("setting_key, setting_value")
      .eq("setting_key", TREASURY_THRESHOLD_KEY)
      .maybeSingle();

    const threshold = parseThresholdSetting(data?.setting_value);
    setLowBalanceThreshold(threshold);
    setThresholdInput(String(threshold));
    return threshold;
  }, []);

  const fetchVendorBalances = useCallback(async (threshold: number) => {
    const nextWallets = createDefaultWallets(threshold);

    const [smeplugRes, ebillsRes, mobilenigRes, payvesselRes, flutterwaveRes] = await Promise.all([
      supabase.functions.invoke("fetch-smeplug-balance"),
      supabase.functions.invoke("fetch-ebills-balance"),
      supabase.functions.invoke("fetch-mobilenig-balance"),
      supabase.functions.invoke("fetch-payvessel-balance"),
      supabase.functions.invoke("fetch-flutterwave-balance"),
    ]);

    if (smeplugRes.data?.success && smeplugRes.data.balance) {
      const amount = Number(smeplugRes.data.balance.amount) || 0;
      nextWallets[0] = {
        ...nextWallets[0],
        balance: amount,
        currency: smeplugRes.data.balance.currency || "NGN",
        status: walletStatusForBalance(amount, threshold),
        subtitle: smeplugRes.data.account?.businessName,
      };
    } else {
      nextWallets[0] = { ...nextWallets[0], status: "error" };
    }

    if (ebillsRes.data?.success && ebillsRes.data.data) {
      const amount = Number(ebillsRes.data.data.balance) || 0;
      nextWallets[1] = {
        ...nextWallets[1],
        balance: amount,
        currency: ebillsRes.data.data.currency || "NGN",
        status: walletStatusForBalance(amount, threshold),
      };
    } else {
      nextWallets[1] = { ...nextWallets[1], status: "error" };
    }

    if (mobilenigRes.data?.success && mobilenigRes.data.balance) {
      const amount = Number(mobilenigRes.data.balance.amount) || 0;
      nextWallets[2] = {
        ...nextWallets[2],
        balance: amount,
        currency: mobilenigRes.data.balance.currency || "NGN",
        status: walletStatusForBalance(amount, threshold),
        subtitle: mobilenigRes.data.account?.businessName,
      };
    } else if (
      mobilenigRes.data?.error?.toLowerCase?.().includes("not configured") ||
      mobilenigRes.error?.message?.toLowerCase?.().includes("not configured")
    ) {
      nextWallets[2] = { ...nextWallets[2], status: "unconfigured" };
    } else {
      nextWallets[2] = { ...nextWallets[2], status: "error" };
    }

    if (payvesselRes.data?.success && payvesselRes.data.balance) {
      const amount = Number(payvesselRes.data.balance.amount) || 0;
      nextWallets[3] = {
        ...nextWallets[3],
        balance: amount,
        currency: payvesselRes.data.balance.currency || "NGN",
        status: walletStatusForBalance(amount, threshold),
        subtitle: payvesselRes.data.account?.businessName || "Funding gateway",
      };
    } else if (
      payvesselRes.data?.error?.toLowerCase?.().includes("not configured") ||
      payvesselRes.error?.message?.toLowerCase?.().includes("not configured")
    ) {
      nextWallets[3] = { ...nextWallets[3], status: "unconfigured" };
    } else {
      nextWallets[3] = { ...nextWallets[3], status: "error" };
    }

    if (flutterwaveRes.data?.success && flutterwaveRes.data.balance) {
      const amount = Number(flutterwaveRes.data.balance.amount) || 0;
      nextWallets[4] = {
        ...nextWallets[4],
        balance: amount,
        currency: flutterwaveRes.data.balance.currency || "NGN",
        status: walletStatusForBalance(amount, threshold),
        subtitle: flutterwaveRes.data.account?.businessName || "Card & bank funding",
      };
    } else if (
      flutterwaveRes.data?.error?.toLowerCase?.().includes("not configured") ||
      flutterwaveRes.error?.message?.toLowerCase?.().includes("not configured")
    ) {
      nextWallets[4] = { ...nextWallets[4], status: "unconfigured" };
    } else {
      nextWallets[4] = { ...nextWallets[4], status: "error" };
    }

    setVendorWallets(nextWallets);
  }, []);

  const fetchPlatformMetrics = useCallback(async () => {
    const [
      ledgerRes,
      { data: profiles },
      { data: revenueRows },
      { data: fundingFees },
      { data: fundingRows },
    ] = await Promise.all([
      supabase.functions.invoke("get-ledger-summary", { body: { limit: 1 } }),
      supabase.from("profiles").select("balance"),
      supabase
        .from("platform_revenue")
        .select("revenue_amount, transaction_status")
        .eq("transaction_status", "completed"),
      supabase.from("user_transactions").select("amount").eq("transaction_type", "funding_fee"),
      supabase
        .from("user_transactions")
        .select("amount")
        .in("transaction_type", ["credit", "wallet_funding", "fund_wallet"])
        .eq("status", "completed"),
    ]);

    const profileLiability = (profiles || []).reduce((sum, row) => sum + Number(row.balance || 0), 0);
    let ledgerLiability = profileLiability;
    let mismatches = 0;

    if (ledgerRes.data?.success && ledgerRes.data.summary) {
      const summary = parseLedgerSummary(ledgerRes.data.summary);
      ledgerLiability = summary.total_ledger_liability;
      mismatches = summary.mismatch_count;
    }

    const revenueFromFees =
      (revenueRows || []).reduce((sum, row) => sum + Number(row.revenue_amount || 0), 0) +
      (fundingFees || []).reduce((sum, row) => sum + Number(row.amount || 0), 0);
    const fundingVolume = (fundingRows || []).reduce((sum, row) => sum + Number(row.amount || 0), 0);

    setUserWalletLiability(ledgerLiability);
    setProfileBalanceTotal(profileLiability);
    setLedgerMismatchCount(mismatches);
    setActiveUsers(profiles?.length || 0);
    setPlatformRevenue(revenueFromFees);
    setTotalFundingVolume(fundingVolume);
  }, []);

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
          status,
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
    } finally {
      setLoadingTransactions(false);
    }
  }, []);

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

      const functionByVendor: Record<Exclude<VendorKey, "ebills" | "flutterwave">, string> = {
        smeplug: "fetch-smeplug-wallet-history",
        payvessel: "fetch-payvessel-transactions",
        mobilenig: "fetch-mobilenig-wallet-history",
      };

      const payload = vendorTransIdSearch.trim()
        ? { trans_id: vendorTransIdSearch.trim() }
        : { page: vendorPage, per_page: 15 };

      const { data, error } = await supabase.functions.invoke(functionByVendor[selectedVendor], {
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
        const threshold = await fetchTreasurySettings();
        await Promise.all([
          fetchVendorBalances(threshold),
          fetchPlatformMetrics(),
          fetchVendingProviders(),
          fetchRecentTransactions(),
        ]);
        setLastSyncedAt(new Date());
      } catch (error) {
        console.error("Treasury load failed:", error);
        toast({
          title: "Error",
          description: "Failed to load treasury data",
          variant: "destructive",
        });
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [
      fetchPlatformMetrics,
      fetchRecentTransactions,
      fetchTreasurySettings,
      fetchVendorBalances,
      fetchVendingProviders,
      toast,
    ],
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

  const saveLowBalanceThreshold = async () => {
    const parsed = Number(thresholdInput);
    if (!Number.isFinite(parsed) || parsed < 0) {
      toast({
        title: "Invalid threshold",
        description: "Enter a valid amount in Naira",
        variant: "destructive",
      });
      return;
    }

    setSavingThreshold(true);
    try {
      const { error } = await supabase.from("app_settings").upsert(
        {
          setting_key: TREASURY_THRESHOLD_KEY,
          setting_value: { threshold: parsed },
          setting_category: "system",
          description: "Minimum vendor wallet balance before low-balance alerts",
        },
        { onConflict: "setting_key" },
      );

      if (error) throw error;

      setLowBalanceThreshold(parsed);
      await fetchVendorBalances(parsed);
      toast({
        title: "Saved",
        description: `Low balance alert threshold set to ${formatNaira(parsed)}`,
      });
    } catch (error) {
      console.error("Failed to save threshold:", error);
      toast({
        title: "Error",
        description: "Failed to save treasury settings",
        variant: "destructive",
      });
    } finally {
      setSavingThreshold(false);
    }
  };

  const updateVendingProvider = async (service: ServiceKey, provider: string) => {
    if (vendingProviders[service] === provider) return;

    setUpdatingProvider(service);
    try {
      const settingKey = SETTING_KEY_BY_SERVICE[service];
      const { error } = await supabase.from("app_settings").upsert(
        {
          setting_key: settingKey,
          setting_value: { provider },
          setting_category: "system",
          description: `${SERVICE_LABELS[service]} vending provider`,
        },
        { onConflict: "setting_key" },
      );

      if (error) throw error;

      setVendingProviders((prev) => ({ ...prev, [service]: provider }));
      toast({
        title: "Provider updated",
        description: `${SERVICE_LABELS[service]} now routes to ${formatVendorLabel(provider)}`,
      });
    } catch (error) {
      console.error("Failed to update provider:", error);
      toast({
        title: "Error",
        description: "Failed to update vending provider",
        variant: "destructive",
      });
    } finally {
      setUpdatingProvider(null);
    }
  };

  const combinedVendorBalance = useMemo(
    () => vendorWallets.reduce((sum, wallet) => sum + (wallet.balance ?? 0), 0),
    [vendorWallets],
  );

  const lowBalanceVendors = useMemo(
    () => vendorWallets.filter((wallet) => wallet.status === "low"),
    [vendorWallets],
  );

  const liquidityCoverage = useMemo(() => {
    if (userWalletLiability <= 0) return null;
    return (combinedVendorBalance / userWalletLiability) * 100;
  }, [combinedVendorBalance, userWalletLiability]);

  const netFloatPosition = useMemo(
    () => combinedVendorBalance - userWalletLiability,
    [combinedVendorBalance, userWalletLiability],
  );

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

  const getWalletStatusBadge = (status: VendorWallet["status"]) => {
    switch (status) {
      case "ok":
        return <Badge className="bg-green-100 text-green-800 border-green-200">Healthy</Badge>;
      case "low":
        return <Badge className="bg-amber-100 text-amber-800 border-amber-200">Low Balance</Badge>;
      case "unconfigured":
        return <Badge variant="outline">Not Configured</Badge>;
      default:
        return <Badge variant="destructive">Unavailable</Badge>;
    }
  };

  const overviewCards = (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
      <Card>
        <CardHeader className="pb-2">
          <CardDescription className="flex items-center gap-2">
            <Users className="h-4 w-4" /> User Wallet Liability (Ledger)
          </CardDescription>
          <CardTitle className="text-3xl">
            {loading ? <Skeleton className="h-9 w-32" /> : formatNaira(userWalletLiability)}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm text-muted-foreground">{activeUsers.toLocaleString()} user wallets</p>
          {!loading && ledgerMismatchCount > 0 && (
            <Alert variant="destructive" className="py-2">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="text-xs">
                {ledgerMismatchCount.toLocaleString()} profile cache mismatch
                {ledgerMismatchCount === 1 ? "" : "es"}.{" "}
                <Link to="/ledger" className="underline font-medium">
                  Reconcile in Ledger
                </Link>
              </AlertDescription>
            </Alert>
          )}
          {!loading &&
            Math.abs(userWalletLiability - profileBalanceTotal) > 0.009 && (
              <p className="text-xs text-muted-foreground">
                Profile cache total: {formatNaira(profileBalanceTotal)}
              </p>
            )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardDescription className="flex items-center gap-2">
            <Wallet className="h-4 w-4" /> Vendor Wallet Total
          </CardDescription>
          <CardTitle className="text-3xl">
            {loading ? <Skeleton className="h-9 w-32" /> : formatNaira(combinedVendorBalance)}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Net float:{" "}
            <span className={netFloatPosition >= 0 ? "text-green-600 font-medium" : "text-red-600 font-medium"}>
              {formatNaira(netFloatPosition)}
            </span>
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardDescription className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4" /> Platform Revenue
          </CardDescription>
          <CardTitle className="text-3xl">
            {loading ? <Skeleton className="h-9 w-32" /> : formatNaira(platformRevenue)}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Link to="/platform-revenue" className="text-sm text-primary inline-flex items-center gap-1 hover:underline">
            View revenue breakdown <ArrowUpRight className="h-3 w-3" />
          </Link>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardDescription className="flex items-center gap-2">
            <Banknote className="h-4 w-4" /> Liquidity Coverage
          </CardDescription>
          <CardTitle className="text-3xl">
            {loading ? (
              <Skeleton className="h-9 w-32" />
            ) : liquidityCoverage != null ? (
              `${liquidityCoverage.toFixed(1)}%`
            ) : (
              "—"
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Vendor float vs user liability · Funding volume {formatNaira(totalFundingVolume)}
          </p>
        </CardContent>
      </Card>
    </div>
  );

  const vendorWalletGrid = (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
      {vendorWallets.map((wallet) => (
        <Card key={wallet.key}>
          <CardHeader>
            <div className="flex items-start justify-between gap-2">
              <div>
                <CardTitle className="text-lg">{wallet.label}</CardTitle>
                <CardDescription>{wallet.subtitle || wallet.role}</CardDescription>
              </div>
              {getWalletStatusBadge(wallet.status)}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {loading ? (
              <Skeleton className="h-10 w-full" />
            ) : wallet.balance != null ? (
              <p className="text-3xl font-bold text-primary">
                {wallet.currency}{" "}
                {wallet.balance.toLocaleString("en-NG", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                {wallet.status === "unconfigured" ? "Credentials not configured" : "Balance unavailable"}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Alert below {formatNaira(lowBalanceThreshold)}
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
            <CardDescription>Latest wallet movements across user accounts</CardDescription>
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
                  {type.replace(/_/g, " ")}
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
                <TableHead>Status</TableHead>
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
                filteredTransactions.slice(0, 25).map((txn) => (
                  <TableRow key={txn.id}>
                    <TableCell className="font-mono text-xs">{txn.reference || txn.id.slice(0, 8)}</TableCell>
                    <TableCell>
                      <div className="font-medium">{txn.profiles?.full_name || "User"}</div>
                      {txn.profiles?.email && (
                        <div className="text-xs text-muted-foreground">{txn.profiles.email}</div>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{(txn.transaction_type || "unknown").replace(/_/g, " ")}</Badge>
                    </TableCell>
                    <TableCell className="text-right font-medium">{formatNaira(Number(txn.amount || 0))}</TableCell>
                    <TableCell>
                      <Badge variant={txn.status === "completed" ? "default" : "secondary"}>
                        {txn.status || "unknown"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {format(new Date(txn.created_at), "MMM d, yyyy HH:mm")}
                    </TableCell>
                  </TableRow>
                ))
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
            <CardDescription>
              Wallet ledger and platform purchases per vendor
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={selectedVendor}
              onValueChange={(value) => {
                setSelectedVendor(value as VendorKey);
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
                {(Object.keys(VENDOR_LABELS) as VendorKey[]).map((key) => (
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
              <Link to={vendorWallets.find((w) => w.key === selectedVendor)?.detailPath || "/treasury"}>
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
                  Monitor floats, manage vendor wallets, and control provider routing
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
            {lowBalanceVendors.length > 0 && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Low vendor balance: {lowBalanceVendors.map((v) => v.label).join(", ")} (below{" "}
                  {formatNaira(lowBalanceThreshold)}). Top up before vending volume spikes.
                </AlertDescription>
              </Alert>
            )}

            <Tabs
              value={activeTab}
              onValueChange={setActiveTab}
              className="space-y-6"
            >
              <TabsList>
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="vendors">Vendor Wallets</TabsTrigger>
                <TabsTrigger value="routing">Provider Routing</TabsTrigger>
                <TabsTrigger value="vendor-txns">Vendor Transactions</TabsTrigger>
                <TabsTrigger value="settings">Settings</TabsTrigger>
                <TabsTrigger value="activity">Activity</TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="space-y-6">
                {overviewCards}

                <div className="grid gap-4 md:grid-cols-3">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">Quick Actions</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <Button asChild variant="outline" size="sm" className="w-full justify-start gap-2">
                        <Link to="/users">
                          <Users className="h-4 w-4" /> Credit / debit user wallets
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
                      <CardDescription>Live routing — changes apply instantly across the app</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                        {(Object.keys(SERVICE_LABELS) as ServiceKey[]).map((service) => (
                          <Link
                            key={service}
                            to={SERVICE_ADMIN_PATHS[service]}
                            className="rounded-lg border p-3 hover:bg-muted/50 transition-colors"
                          >
                            <p className="text-xs text-muted-foreground">{SERVICE_LABELS[service]}</p>
                            <p className="font-semibold text-sm mt-1">{formatVendorLabel(vendingProviders[service])}</p>
                          </Link>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {vendorWalletGrid}
              </TabsContent>

              <TabsContent value="vendors" className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Vendor Wallet Balances</CardTitle>
                    <CardDescription>
                      Live balances from SMEPLUG, eBills, MobileNig, PayVessel, and Flutterwave
                    </CardDescription>
                  </CardHeader>
                  <CardContent>{vendorWalletGrid}</CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="routing" className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Vending Provider Routing</CardTitle>
                    <CardDescription>
                      Set which vendor API handles each service. Updates propagate to mobile and web instantly.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {(Object.keys(SERVICE_LABELS) as ServiceKey[]).map((service) => (
                      <div
                        key={service}
                        className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-lg border p-4"
                      >
                        <div>
                          <p className="font-medium">{SERVICE_LABELS[service]}</p>
                          <Link
                            to={SERVICE_ADMIN_PATHS[service]}
                            className="text-xs text-primary hover:underline inline-flex items-center gap-1"
                          >
                            Open {SERVICE_LABELS[service]} admin <ArrowUpRight className="h-3 w-3" />
                          </Link>
                        </div>
                        <Select
                          value={vendingProviders[service]}
                          onValueChange={(value) => updateVendingProvider(service, value)}
                          disabled={updatingProvider === service}
                        >
                          <SelectTrigger className="w-[220px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {PROVIDER_OPTIONS[service].map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="vendor-txns">{vendorTransactionsPanel}</TabsContent>

              <TabsContent value="settings" className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Settings2 className="h-5 w-5" /> Treasury Alerts
                    </CardTitle>
                    <CardDescription>Configure when vendor wallets trigger low-balance warnings</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4 max-w-md">
                    <div className="space-y-2">
                      <Label htmlFor="low-balance-threshold">Low balance threshold (₦)</Label>
                      <Input
                        id="low-balance-threshold"
                        type="number"
                        min={0}
                        value={thresholdInput}
                        onChange={(e) => setThresholdInput(e.target.value)}
                      />
                      <p className="text-xs text-muted-foreground">
                        Vendors below this amount show a low-balance alert on this page.
                      </p>
                    </div>
                    <Button onClick={saveLowBalanceThreshold} disabled={savingThreshold}>
                      {savingThreshold ? "Saving..." : "Save threshold"}
                    </Button>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="activity">{activityTable}</TabsContent>
            </Tabs>
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
