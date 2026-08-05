import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { formatNaira } from "@/lib/currency";
import {
  isLedgerCreditType,
  formatLedgerTypeLabel,
  parseLedgerSummary,
  type LedgerBalanceSummary,
  type LedgerBalanceMismatch,
} from "@/lib/ledger-balance";
import { UserBalanceReconcileDialog } from "@/components/UserBalanceReconcileDialog";
import {
  ArrowDownLeft,
  ArrowUpRight,
  BookOpen,
  Calendar,
  Download,
  RefreshCw,
  Search,
  ShieldCheck,
  Eye,
} from "lucide-react";

const LEDGER_TYPES = [
  "credit",
  "debit",
  "purchase",
  "refund",
  "transfer_fee",
  "funding_fee",
  "airtime_purchase",
  "data_purchase",
  "electricity_purchase",
  "cable_purchase",
  "cable_tv",
  "education_purchase",
  "betting_purchase",
  "referral_withdrawal",
] as const;

interface LedgerEntry {
  id: string;
  user_id: string;
  amount: number;
  balance_before: number;
  balance_after: number;
  transaction_type: string;
  description: string | null;
  reference: string | null;
  performed_by: string | null;
  created_at: string;
  profiles?: {
    full_name?: string | null;
    email?: string | null;
  } | null;
}

function isCreditEntry(type: string): boolean {
  return isLedgerCreditType(type);
}

function formatLedgerType(type: string): string {
  return formatLedgerTypeLabel(type);
}

export default function Ledger() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [directionFilter, setDirectionFilter] = useState<"all" | "credit" | "debit">("all");
  const [dateRange, setDateRange] = useState<{ from: Date; to: Date }>({
    from: new Date(new Date().setDate(new Date().getDate() - 30)),
    to: new Date(),
  });
  const [authorized, setAuthorized] = useState(false);
  const [ledgerSummary, setLedgerSummary] = useState<LedgerBalanceSummary | null>(null);
  const [mismatches, setMismatches] = useState<LedgerBalanceMismatch[]>([]);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [reconcileUserId, setReconcileUserId] = useState<string | null>(null);
  const [reconcileDialogOpen, setReconcileDialogOpen] = useState(false);

  const fetchLedgerSummary = useCallback(async () => {
    setLoadingSummary(true);
    try {
      const { data, error } = await supabase.functions.invoke("get-ledger-summary", {
        body: { limit: 50 },
      });
      if (error) throw error;
      if (!data?.success) {
        throw new Error(data?.error || "Failed to load ledger summary");
      }
      setLedgerSummary(parseLedgerSummary(data.summary));
      setMismatches((data.mismatches as LedgerBalanceMismatch[]) || []);
    } catch (error) {
      console.error("Ledger summary fetch failed:", error);
      toast({
        title: "Summary unavailable",
        description: "Apply the ledger migration and deploy get-ledger-summary to enable reconciliation.",
        variant: "destructive",
      });
    } finally {
      setLoadingSummary(false);
    }
  }, [toast]);

  const openReconcileDialog = (userId: string) => {
    setReconcileUserId(userId);
    setReconcileDialogOpen(true);
  };

  const fetchLedger = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const endOfDay = new Date(dateRange.to);
      endOfDay.setHours(23, 59, 59, 999);

      let query = supabase
        .from("user_transactions")
        .select(`
          id,
          user_id,
          amount,
          balance_before,
          balance_after,
          transaction_type,
          description,
          reference,
          performed_by,
          created_at,
          profiles:user_id (
            full_name,
            email
          )
        `)
        .gte("created_at", dateRange.from.toISOString())
        .lte("created_at", endOfDay.toISOString())
        .order("created_at", { ascending: false })
        .limit(1000);

      if (typeFilter !== "all") {
        query = query.eq("transaction_type", typeFilter);
      }

      const { data, error } = await query;
      if (error) throw error;

      setEntries((data as LedgerEntry[]) || []);
    } catch (error) {
      console.error("Ledger fetch failed:", error);
      toast({
        title: "Error",
        description: "Failed to load ledger entries",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [dateRange.from, dateRange.to, toast, typeFilter]);

  useEffect(() => {
    const checkAuth = async () => {
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

      setAuthorized(true);
    };

    void checkAuth();
  }, [navigate, toast]);

  useEffect(() => {
    if (authorized) {
      void fetchLedger();
      void fetchLedgerSummary();
    }
  }, [authorized, fetchLedger, fetchLedgerSummary]);

  useEffect(() => {
    if (authorized && window.location.hash === "#balance-drift") {
      window.requestAnimationFrame(() => {
        document.getElementById("balance-drift")?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  }, [authorized, mismatches.length]);

  const filteredEntries = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return entries.filter((entry) => {
      const isCredit = isCreditEntry(entry.transaction_type);
      if (directionFilter === "credit" && !isCredit) return false;
      if (directionFilter === "debit" && isCredit) return false;

      if (!query) return true;
      return (
        entry.reference?.toLowerCase().includes(query) ||
        entry.description?.toLowerCase().includes(query) ||
        entry.transaction_type.toLowerCase().includes(query) ||
        entry.profiles?.full_name?.toLowerCase().includes(query) ||
        entry.profiles?.email?.toLowerCase().includes(query)
      );
    });
  }, [entries, searchQuery, directionFilter]);

  const stats = useMemo(() => {
    let totalCredits = 0;
    let totalDebits = 0;
    let creditCount = 0;
    let debitCount = 0;

    for (const entry of filteredEntries) {
      const amount = Number(entry.amount || 0);
      if (isCreditEntry(entry.transaction_type)) {
        totalCredits += amount;
        creditCount += 1;
      } else {
        totalDebits += amount;
        debitCount += 1;
      }
    }

    return {
      totalCredits,
      totalDebits,
      netFlow: totalCredits - totalDebits,
      creditCount,
      debitCount,
      totalEntries: filteredEntries.length,
    };
  }, [filteredEntries]);

  const exportLedger = () => {
    const csv = [
      ["Date", "Reference", "User", "Email", "Type", "Description", "Debit", "Credit", "Balance Before", "Balance After", "Admin Action"].join(","),
      ...filteredEntries.map((entry) => {
        const isCredit = isCreditEntry(entry.transaction_type);
        return [
          format(new Date(entry.created_at), "yyyy-MM-dd HH:mm:ss"),
          entry.reference || "",
          entry.profiles?.full_name || "",
          entry.profiles?.email || "",
          entry.transaction_type,
          `"${(entry.description || "").replace(/"/g, '""')}"`,
          isCredit ? "" : entry.amount,
          isCredit ? entry.amount : "",
          entry.balance_before,
          entry.balance_after,
          entry.performed_by ? "yes" : "no",
        ].join(",");
      }),
    ].join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `ledger-${format(new Date(), "yyyy-MM-dd")}.csv`;
    anchor.click();
    window.URL.revokeObjectURL(url);
  };

  if (!authorized) {
    return (
      <SidebarProvider>
        <div className="min-h-screen flex w-full bg-background">
          <AppSidebar />
          <main className="flex-1 flex items-center justify-center">
            <p className="text-muted-foreground">Checking admin access…</p>
          </main>
        </div>
      </SidebarProvider>
    );
  }

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        <main className="flex-1 overflow-auto">
          <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <div className="flex h-16 items-center gap-4 px-6">
              <SidebarTrigger />
              <div className="flex-1">
                <h1 className="text-2xl font-bold flex items-center gap-2">
                  <BookOpen className="h-6 w-6" /> Admin Ledger
                </h1>
                <p className="text-sm text-muted-foreground">
                  Authoritative wallet record — profile cache auto-syncs from the latest{" "}
                  <code className="text-xs">balance_after</code> entry
                </p>
              </div>
              <Button
                variant="outline"
                className="gap-2"
                onClick={() => fetchLedger(true)}
                disabled={refreshing}
              >
                <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
                Refresh
              </Button>
              <Button variant="outline" className="gap-2" onClick={exportLedger} disabled={filteredEntries.length === 0}>
                <Download className="h-4 w-4" />
                Export CSV
              </Button>
            </div>
          </header>

          <div className="p-6 space-y-6">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              <Card className="border-primary/30 bg-primary/5">
                <CardHeader className="pb-2">
                  <CardDescription className="flex items-center gap-1">
                    <ShieldCheck className="h-4 w-4 text-primary" /> Ledger Liability
                  </CardDescription>
                  <CardTitle className="text-3xl">
                    {loadingSummary ? (
                      <Skeleton className="h-9 w-32" />
                    ) : (
                      formatNaira(ledgerSummary?.total_ledger_liability ?? 0)
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">Source of truth — sum of latest ledger balances</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Profile Cache Total</CardDescription>
                  <CardTitle className="text-3xl">
                    {loadingSummary ? (
                      <Skeleton className="h-9 w-32" />
                    ) : (
                      formatNaira(ledgerSummary?.total_profile_balance ?? 0)
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    {ledgerSummary?.mismatch_count
                      ? `${ledgerSummary.mismatch_count} user(s) pending auto-sync`
                      : "Auto-synced from ledger"}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Ledger Entries</CardDescription>
                  <CardTitle className="text-3xl">
                    {loading ? <Skeleton className="h-9 w-20" /> : stats.totalEntries.toLocaleString()}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    {stats.creditCount} credits · {stats.debitCount} debits
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardDescription className="flex items-center gap-1">
                    <ArrowDownLeft className="h-4 w-4 text-green-600" /> Total Credits
                  </CardDescription>
                  <CardTitle className="text-3xl text-green-600">
                    {loading ? <Skeleton className="h-9 w-32" /> : formatNaira(stats.totalCredits)}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">Funding, refunds, admin credits</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardDescription className="flex items-center gap-1">
                    <ArrowUpRight className="h-4 w-4 text-red-600" /> Total Debits
                  </CardDescription>
                  <CardTitle className="text-3xl text-red-600">
                    {loading ? <Skeleton className="h-9 w-32" /> : formatNaira(stats.totalDebits)}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">Purchases, fees, admin debits</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Net Flow</CardDescription>
                  <CardTitle className={`text-3xl ${stats.netFlow >= 0 ? "text-green-600" : "text-red-600"}`}>
                    {loading ? <Skeleton className="h-9 w-32" /> : formatNaira(stats.netFlow)}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Link to="/treasury" className="text-sm text-primary hover:underline inline-flex items-center gap-1">
                    View treasury <ArrowUpRight className="h-3 w-3" />
                  </Link>
                </CardContent>
              </Card>
            </div>

            {mismatches.length > 0 && (
              <Card id="balance-drift">
                <CardHeader>
                  <CardTitle>Balance Drift</CardTitle>
                  <CardDescription>
                    Users where profile cache still differs after auto-sync — inspect the profile to investigate.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="rounded-md border overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>User</TableHead>
                          <TableHead className="text-right">Ledger Balance</TableHead>
                          <TableHead className="text-right">Profile Cache</TableHead>
                          <TableHead className="text-right">Drift</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {mismatches.map((row) => (
                          <TableRow key={row.user_id}>
                            <TableCell>
                              <div className="font-medium">{row.full_name || "User"}</div>
                              {row.email && <div className="text-xs text-muted-foreground">{row.email}</div>}
                            </TableCell>
                            <TableCell className="text-right font-medium">{formatNaira(row.ledger_balance)}</TableCell>
                            <TableCell className="text-right">{formatNaira(row.profile_balance)}</TableCell>
                            <TableCell className="text-right text-amber-600 font-medium">
                              {formatNaira(row.drift)}
                            </TableCell>
                            <TableCell className="text-right">
                              <Button
                                variant="outline"
                                size="sm"
                                className="gap-1"
                                onClick={() => openReconcileDialog(row.user_id)}
                              >
                                <Eye className="h-3.5 w-3.5" />
                                View profile
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            )}

            <UserBalanceReconcileDialog
              userId={reconcileUserId}
              open={reconcileDialogOpen}
              onOpenChange={setReconcileDialogOpen}
              onReconciled={() => {
                void fetchLedgerSummary();
                void fetchLedger(true);
              }}
            />

            <Card>
              <CardHeader>
                <CardTitle>Wallet Ledger</CardTitle>
                <CardDescription>
                  Immutable record of every wallet movement —{" "}
                  <span className="font-medium text-foreground">balance after</span> is the authoritative user balance
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center mb-4">
                  <div className="relative flex-1 max-w-sm">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search reference, user, description..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-10"
                    />
                  </div>

                  <Select value={directionFilter} onValueChange={(v) => setDirectionFilter(v as typeof directionFilter)}>
                    <SelectTrigger className="w-[140px]">
                      <SelectValue placeholder="Direction" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      <SelectItem value="credit">Credits</SelectItem>
                      <SelectItem value="debit">Debits</SelectItem>
                    </SelectContent>
                  </Select>

                  <Select value={typeFilter} onValueChange={setTypeFilter}>
                    <SelectTrigger className="w-[200px]">
                      <SelectValue placeholder="Type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Types</SelectItem>
                      {LEDGER_TYPES.map((type) => (
                        <SelectItem key={type} value={type}>
                          {formatLedgerType(type)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="gap-2">
                        <Calendar className="h-4 w-4" />
                        {format(dateRange.from, "MMM dd")} – {format(dateRange.to, "MMM dd, yyyy")}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="end">
                      <div className="p-4 space-y-4">
                        <div>
                          <p className="text-sm font-medium mb-2">From</p>
                          <CalendarComponent
                            mode="single"
                            selected={dateRange.from}
                            onSelect={(date) => date && setDateRange({ ...dateRange, from: date })}
                          />
                        </div>
                        <div>
                          <p className="text-sm font-medium mb-2">To</p>
                          <CalendarComponent
                            mode="single"
                            selected={dateRange.to}
                            onSelect={(date) => date && setDateRange({ ...dateRange, to: date })}
                          />
                        </div>
                        <Button className="w-full" size="sm" onClick={() => fetchLedger(true)}>
                          Apply range
                        </Button>
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>

                <div className="rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Reference</TableHead>
                        <TableHead>User</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead className="text-right text-red-600">Debit</TableHead>
                        <TableHead className="text-right text-green-600">Credit</TableHead>
                        <TableHead className="text-right">Bal. Before</TableHead>
                        <TableHead className="text-right">Bal. After</TableHead>
                        <TableHead>Source</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loading ? (
                        Array.from({ length: 8 }).map((_, i) => (
                          <TableRow key={i}>
                            <TableCell colSpan={10}>
                              <Skeleton className="h-8 w-full" />
                            </TableCell>
                          </TableRow>
                        ))
                      ) : filteredEntries.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={10} className="text-center py-10 text-muted-foreground">
                            No ledger entries found for this period
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredEntries.map((entry) => {
                          const isCredit = isCreditEntry(entry.transaction_type);
                          return (
                            <TableRow key={entry.id}>
                              <TableCell className="text-sm whitespace-nowrap">
                                {format(new Date(entry.created_at), "MMM d, yyyy HH:mm")}
                              </TableCell>
                              <TableCell className="font-mono text-xs max-w-[100px] truncate">
                                {entry.reference || entry.id.slice(0, 8)}
                              </TableCell>
                              <TableCell>
                                <div className="font-medium text-sm">{entry.profiles?.full_name || "User"}</div>
                                {entry.profiles?.email && (
                                  <div className="text-xs text-muted-foreground">{entry.profiles.email}</div>
                                )}
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline">{formatLedgerType(entry.transaction_type)}</Badge>
                              </TableCell>
                              <TableCell className="text-sm max-w-[180px] truncate">
                                {entry.description || "—"}
                              </TableCell>
                              <TableCell className="text-right font-medium text-red-600">
                                {!isCredit ? formatNaira(entry.amount) : "—"}
                              </TableCell>
                              <TableCell className="text-right font-medium text-green-600">
                                {isCredit ? formatNaira(entry.amount) : "—"}
                              </TableCell>
                              <TableCell className="text-right text-sm text-muted-foreground">
                                {formatNaira(entry.balance_before)}
                              </TableCell>
                              <TableCell className="text-right text-sm font-medium">
                                {formatNaira(entry.balance_after)}
                              </TableCell>
                              <TableCell>
                                {entry.performed_by ? (
                                  <Badge variant="secondary">Admin</Badge>
                                ) : (
                                  <Badge variant="outline">System</Badge>
                                )}
                              </TableCell>
                            </TableRow>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                </div>

                {!loading && filteredEntries.length >= 1000 && (
                  <p className="text-xs text-muted-foreground mt-3">
                    Showing the most recent 1,000 entries. Narrow the date range to see more.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
