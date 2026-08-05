import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { formatNaira } from "@/lib/currency";
import {
  balancesMatch,
  fetchUserLedgerBalance,
  parseLedgerSummary,
  type LedgerBalanceSummary,
} from "@/lib/ledger-balance";
import { UserBalanceReconcileDialog } from "@/components/UserBalanceReconcileDialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ArrowDownLeft,
  ArrowUpRight,
  BookOpen,
  MinusCircle,
  PlusCircle,
  RefreshCw,
  Search,
  ShieldCheck,
  Wallet,
} from "lucide-react";

interface UserProfile {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  balance: number;
  status: string;
  created_at: string;
}

interface WalletTransaction {
  id: string;
  user_id: string;
  transaction_type: string;
  amount: number;
  balance_before: number;
  balance_after: number;
  description: string | null;
  reference: string | null;
  created_at: string;
  profiles?: {
    full_name?: string | null;
    email?: string | null;
  } | null;
}

export default function WalletManagement() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { toast } = useToast();

  const [authorized, setAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [ledgerBalances, setLedgerBalances] = useState<Record<string, number>>({});
  const [summary, setSummary] = useState<LedgerBalanceSummary | null>(null);
  const [recentActivity, setRecentActivity] = useState<WalletTransaction[]>([]);
  const [userTransactions, setUserTransactions] = useState<WalletTransaction[]>([]);

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [balanceFilter, setBalanceFilter] = useState("all");

  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [manageOpen, setManageOpen] = useState(false);
  const [reconcileOpen, setReconcileOpen] = useState(false);
  const [creditOpen, setCreditOpen] = useState(false);
  const [debitOpen, setDebitOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const getLedgerBalance = useCallback(
    (user: UserProfile) => ledgerBalances[user.id] ?? user.balance,
    [ledgerBalances],
  );

  const loadLedgerBalances = async (userList: UserProfile[]) => {
    const entries = await Promise.all(
      userList.map(async (user) => {
        const balance = await fetchUserLedgerBalance(supabase, user.id, user.balance);
        return [user.id, balance] as const;
      }),
    );
    setLedgerBalances(Object.fromEntries(entries));
  };

  const fetchRecentActivity = async () => {
    const { data, error } = await supabase
      .from("user_transactions")
      .select(`
        id,
        user_id,
        transaction_type,
        amount,
        balance_before,
        balance_after,
        description,
        reference,
        created_at,
        profiles:user_id (full_name, email)
      `)
      .order("created_at", { ascending: false })
      .limit(40);

    if (!error) {
      setRecentActivity((data as WalletTransaction[]) || []);
    }
  };

  const fetchUserTransactions = async (userId: string) => {
    const { data, error } = await supabase
      .from("user_transactions")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      toast({
        title: "Error",
        description: "Failed to load wallet history",
        variant: "destructive",
      });
      return;
    }

    setUserTransactions((data as WalletTransaction[]) || []);
  };

  const loadWallets = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);

      try {
        const [summaryRes, profilesRes] = await Promise.all([
          supabase.functions.invoke("get-ledger-summary", { body: { limit: 20 } }),
          supabase.from("profiles").select("*").order("created_at", { ascending: false }),
        ]);

        if (profilesRes.error) throw profilesRes.error;

        const userList = profilesRes.data || [];
        setUsers(userList);
        void loadLedgerBalances(userList);

        if (summaryRes.data?.success && summaryRes.data.summary) {
          setSummary(parseLedgerSummary(summaryRes.data.summary));
        }

        await fetchRecentActivity();
      } catch (error) {
        console.error("Wallet management load failed:", error);
        toast({
          title: "Error",
          description: "Failed to load wallet data",
          variant: "destructive",
        });
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [toast],
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
          description: "You don't have permission to access wallet management",
          variant: "destructive",
        });
        navigate("/dashboard");
        return;
      }

      setAuthorized(true);
      await loadWallets();
    };

    void init();
  }, [loadWallets, navigate, toast]);

  const openManageWallet = async (user: UserProfile) => {
    setSelectedUser(user);
    await Promise.all([
      fetchUserTransactions(user.id),
      fetchUserLedgerBalance(supabase, user.id, user.balance).then((balance) => {
        setLedgerBalances((prev) => ({ ...prev, [user.id]: balance }));
      }),
    ]);
    setManageOpen(true);
  };

  useEffect(() => {
    const userId = searchParams.get("userId");
    if (!userId || users.length === 0) return;

    const user = users.find((entry) => entry.id === userId);
    if (!user) return;

    void openManageWallet(user);
    if (searchParams.get("reconcile") === "1") {
      setReconcileOpen(true);
    }

    const next = new URLSearchParams(searchParams);
    next.delete("userId");
    next.delete("reconcile");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams, users]);

  const filteredUsers = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return users.filter((user) => {
      if (statusFilter !== "all" && user.status !== statusFilter) return false;

      const ledgerBalance = getLedgerBalance(user);
      if (balanceFilter === "funded" && ledgerBalance <= 0) return false;
      if (balanceFilter === "zero" && ledgerBalance > 0) return false;
      if (balanceFilter === "drift" && balancesMatch(ledgerBalance, user.balance)) return false;

      if (!query) return true;
      return (
        user.full_name?.toLowerCase().includes(query) ||
        user.email?.toLowerCase().includes(query) ||
        user.phone?.toLowerCase().includes(query) ||
        user.id.toLowerCase().includes(query)
      );
    });
  }, [users, searchQuery, statusFilter, balanceFilter, getLedgerBalance]);

  const stats = useMemo(() => {
    const fundedWallets = users.filter((user) => getLedgerBalance(user) > 0).length;
    const totalLiability = summary?.total_ledger_liability ?? users.reduce((sum, user) => sum + getLedgerBalance(user), 0);
    return {
      totalLiability,
      totalWallets: users.length,
      fundedWallets,
      mismatchCount: summary?.mismatch_count ?? 0,
    };
  }, [users, summary, getLedgerBalance]);

  const selectedLedgerBalance = selectedUser ? getLedgerBalance(selectedUser) : 0;
  const selectedHasDrift =
    selectedUser != null && !balancesMatch(selectedLedgerBalance, selectedUser.balance);

  const performTransaction = async (type: "credit" | "debit") => {
    if (!selectedUser || !amount || parseFloat(amount) <= 0) {
      toast({
        title: "Error",
        description: "Please enter a valid amount",
        variant: "destructive",
      });
      return;
    }

    const amountValue = parseFloat(amount);
    setSubmitting(true);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error("You must be logged in");

      const functionName = type === "credit" ? "credit-user" : "debit-user";
      const { data, error } = await supabase.functions.invoke(functionName, {
        body: {
          userId: selectedUser.id,
          amount: amountValue,
          description: description || null,
        },
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || `Failed to ${type} wallet`);

      toast({
        title: "Success",
        description: `Wallet ${type === "credit" ? "credited" : "debited"} successfully`,
      });

      setCreditOpen(false);
      setDebitOpen(false);
      setAmount("");
      setDescription("");

      if (data?.data?.balanceAfter != null) {
        setLedgerBalances((prev) => ({
          ...prev,
          [selectedUser.id]: Number(data.data.balanceAfter),
        }));
      }

      await Promise.all([
        loadWallets(true),
        fetchUserTransactions(selectedUser.id),
      ]);
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : `Failed to ${type} wallet`,
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const openCredit = (user: UserProfile) => {
    setSelectedUser(user);
    setAmount("");
    setDescription("");
    setCreditOpen(true);
  };

  const openDebit = (user: UserProfile) => {
    setSelectedUser(user);
    setAmount("");
    setDescription("");
    setDebitOpen(true);
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
                  <Wallet className="h-6 w-6" /> Wallet Management
                </h1>
                <p className="text-sm text-muted-foreground">
                  Manage user wallet balances — ledger is the source of truth, profile cache auto-syncs
                </p>
              </div>
              <Button variant="outline" className="gap-2" asChild>
                <Link to="/ledger">
                  <BookOpen className="h-4 w-4" /> Ledger
                </Link>
              </Button>
              <Button
                variant="outline"
                className="gap-2"
                onClick={() => void loadWallets(true)}
                disabled={refreshing}
              >
                <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
                Refresh
              </Button>
            </div>
          </header>

          <div className="p-6 space-y-6">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <Card className="border-primary/30 bg-primary/5">
                <CardHeader className="pb-2">
                  <CardDescription>Total Wallet Liability</CardDescription>
                  <CardTitle className="text-3xl">
                    {loading ? <Skeleton className="h-9 w-32" /> : formatNaira(stats.totalLiability)}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">Sum of ledger balances across all users</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>User Wallets</CardDescription>
                  <CardTitle className="text-3xl">
                    {loading ? <Skeleton className="h-9 w-16" /> : stats.totalWallets.toLocaleString()}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    {stats.fundedWallets.toLocaleString()} with balance &gt; ₦0
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardDescription className="flex items-center gap-1">
                    <ShieldCheck className="h-4 w-4" /> Auto-sync Status
                  </CardDescription>
                  <CardTitle className="text-3xl">
                    {loading ? (
                      <Skeleton className="h-9 w-16" />
                    ) : stats.mismatchCount === 0 ? (
                      <span className="text-green-600">OK</span>
                    ) : (
                      <span className="text-amber-600">{stats.mismatchCount}</span>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    {stats.mismatchCount === 0 ? "All profile caches match ledger" : "Pending auto-sync"}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Quick Links</CardDescription>
                  <CardTitle className="text-base font-medium">Platform finance</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-2">
                  <Button asChild variant="outline" size="sm">
                    <Link to="/treasury">Treasury</Link>
                  </Button>
                  <Button asChild variant="outline" size="sm">
                    <Link to="/ledger">Ledger</Link>
                  </Button>
                  <Button asChild variant="outline" size="sm">
                    <Link to="/users">All users</Link>
                  </Button>
                </CardContent>
              </Card>
            </div>

            <Tabs defaultValue="wallets">
              <TabsList>
                <TabsTrigger value="wallets">User Wallets</TabsTrigger>
                <TabsTrigger value="activity">Recent Activity</TabsTrigger>
              </TabsList>

              <TabsContent value="wallets" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>User Wallets</CardTitle>
                    <CardDescription>Search, credit, debit, and inspect individual wallet balances</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center mb-4">
                      <div className="relative flex-1 max-w-md">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          placeholder="Search name, email, phone, user ID..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="pl-10"
                        />
                      </div>
                      <Select value={statusFilter} onValueChange={setStatusFilter}>
                        <SelectTrigger className="w-[160px]">
                          <SelectValue placeholder="Status" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All statuses</SelectItem>
                          <SelectItem value="active">Active</SelectItem>
                          <SelectItem value="suspended">Suspended</SelectItem>
                          <SelectItem value="inactive">Inactive</SelectItem>
                        </SelectContent>
                      </Select>
                      <Select value={balanceFilter} onValueChange={setBalanceFilter}>
                        <SelectTrigger className="w-[180px]">
                          <SelectValue placeholder="Balance" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All balances</SelectItem>
                          <SelectItem value="funded">With balance</SelectItem>
                          <SelectItem value="zero">Zero balance</SelectItem>
                          <SelectItem value="drift">Cache drift</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="rounded-md border overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>User</TableHead>
                            <TableHead>Phone</TableHead>
                            <TableHead className="text-right">Ledger Balance</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {loading ? (
                            <TableRow>
                              <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                                Loading wallets...
                              </TableCell>
                            </TableRow>
                          ) : filteredUsers.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                                No wallets match your filters
                              </TableCell>
                            </TableRow>
                          ) : (
                            filteredUsers.map((user) => {
                              const ledgerBalance = getLedgerBalance(user);
                              const hasDrift = !balancesMatch(ledgerBalance, user.balance);
                              return (
                                <TableRow key={user.id}>
                                  <TableCell>
                                    <div className="font-medium">{user.full_name || "N/A"}</div>
                                    <div className="text-xs text-muted-foreground">{user.email || user.id}</div>
                                  </TableCell>
                                  <TableCell>{user.phone || "—"}</TableCell>
                                  <TableCell className="text-right">
                                    <div className="font-semibold">{formatNaira(ledgerBalance)}</div>
                                    {hasDrift && (
                                      <div className="text-xs text-amber-600">
                                        Cache: {formatNaira(user.balance)}
                                      </div>
                                    )}
                                  </TableCell>
                                  <TableCell>
                                    <Badge variant={user.status === "active" ? "default" : "destructive"}>
                                      {user.status}
                                    </Badge>
                                  </TableCell>
                                  <TableCell className="text-right">
                                    <div className="flex justify-end gap-1 flex-wrap">
                                      <Button variant="ghost" size="sm" onClick={() => void openManageWallet(user)}>
                                        Manage
                                      </Button>
                                      <Button variant="ghost" size="sm" onClick={() => openCredit(user)}>
                                        <PlusCircle className="h-4 w-4 mr-1" /> Credit
                                      </Button>
                                      <Button variant="ghost" size="sm" onClick={() => openDebit(user)}>
                                        <MinusCircle className="h-4 w-4 mr-1" /> Debit
                                      </Button>
                                    </div>
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
              </TabsContent>

              <TabsContent value="activity">
                <Card>
                  <CardHeader>
                    <CardTitle>Recent Wallet Activity</CardTitle>
                    <CardDescription>Latest ledger entries across all user wallets</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="rounded-md border overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Date</TableHead>
                            <TableHead>User</TableHead>
                            <TableHead>Type</TableHead>
                            <TableHead className="text-right">Amount</TableHead>
                            <TableHead className="text-right">Balance After</TableHead>
                            <TableHead>Reference</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {recentActivity.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                                No recent activity
                              </TableCell>
                            </TableRow>
                          ) : (
                            recentActivity.map((tx) => (
                              <TableRow key={tx.id}>
                                <TableCell className="text-sm whitespace-nowrap">
                                  {format(new Date(tx.created_at), "MMM d, HH:mm")}
                                </TableCell>
                                <TableCell>
                                  <div className="font-medium text-sm">
                                    {tx.profiles?.full_name || "User"}
                                  </div>
                                  <div className="text-xs text-muted-foreground">{tx.profiles?.email}</div>
                                </TableCell>
                                <TableCell>
                                  <Badge variant="outline">{tx.transaction_type.replace(/_/g, " ")}</Badge>
                                </TableCell>
                                <TableCell className="text-right font-medium">{formatNaira(tx.amount)}</TableCell>
                                <TableCell className="text-right">{formatNaira(tx.balance_after)}</TableCell>
                                <TableCell className="font-mono text-xs">{tx.reference || "—"}</TableCell>
                              </TableRow>
                            ))
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        </main>
      </div>

      <Dialog open={manageOpen} onOpenChange={setManageOpen}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Wallet Details</DialogTitle>
            <DialogDescription>
              {selectedUser?.full_name || selectedUser?.email || "User wallet"}
            </DialogDescription>
          </DialogHeader>

          {selectedUser && (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg border p-3 bg-primary/5">
                  <p className="text-xs text-muted-foreground">Ledger balance</p>
                  <p className="text-xl font-bold">{formatNaira(selectedLedgerBalance)}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">Profile cache</p>
                  <p className="text-xl font-bold">{formatNaira(selectedUser.balance)}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">Status</p>
                  <Badge className="mt-1" variant={selectedUser.status === "active" ? "default" : "destructive"}>
                    {selectedUser.status}
                  </Badge>
                </div>
              </div>

              {selectedHasDrift && (
                <Button variant="outline" size="sm" onClick={() => setReconcileOpen(true)}>
                  View balance detail
                </Button>
              )}

              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => openCredit(selectedUser)}>
                  <PlusCircle className="h-4 w-4 mr-1" /> Credit
                </Button>
                <Button size="sm" variant="destructive" onClick={() => openDebit(selectedUser)}>
                  <MinusCircle className="h-4 w-4 mr-1" /> Debit
                </Button>
                <Button size="sm" variant="outline" asChild>
                  <Link to={`/wallets?userId=${selectedUser.id}`}>Open in Wallets</Link>
                </Button>
              </div>

              <div>
                <p className="font-medium mb-2">Recent transactions</p>
                <div className="rounded-md border max-h-64 overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead className="text-right">After</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {userTransactions.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={4} className="text-center text-muted-foreground py-6">
                            No transactions
                          </TableCell>
                        </TableRow>
                      ) : (
                        userTransactions.map((tx) => (
                          <TableRow key={tx.id}>
                            <TableCell className="text-xs">
                              {format(new Date(tx.created_at), "MMM d, HH:mm")}
                            </TableCell>
                            <TableCell className="text-xs">{tx.transaction_type.replace(/_/g, " ")}</TableCell>
                            <TableCell className="text-right text-xs">{formatNaira(tx.amount)}</TableCell>
                            <TableCell className="text-right text-xs font-medium">
                              {formatNaira(tx.balance_after)}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={creditOpen} onOpenChange={setCreditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowDownLeft className="h-5 w-5 text-green-600" /> Credit Wallet
            </DialogTitle>
            <DialogDescription>
              Add funds to {selectedUser?.full_name || selectedUser?.email}'s wallet
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-muted-foreground">Current ledger balance</Label>
              <p className="font-semibold text-lg">{formatNaira(selectedLedgerBalance)}</p>
            </div>
            <div>
              <Label htmlFor="wallet-credit-amount">Amount (₦)</Label>
              <Input
                id="wallet-credit-amount"
                type="number"
                step="0.01"
                min="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="wallet-credit-desc">Description</Label>
              <Textarea
                id="wallet-credit-desc"
                placeholder="Reason for credit"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreditOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button onClick={() => void performTransaction("credit")} disabled={submitting}>
              {submitting ? "Processing..." : "Credit wallet"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={debitOpen} onOpenChange={setDebitOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowUpRight className="h-5 w-5 text-red-600" /> Debit Wallet
            </DialogTitle>
            <DialogDescription>
              Deduct funds from {selectedUser?.full_name || selectedUser?.email}'s wallet
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-muted-foreground">Current ledger balance</Label>
              <p className="font-semibold text-lg">{formatNaira(selectedLedgerBalance)}</p>
            </div>
            <div>
              <Label htmlFor="wallet-debit-amount">Amount (₦)</Label>
              <Input
                id="wallet-debit-amount"
                type="number"
                step="0.01"
                min="0.01"
                max={selectedLedgerBalance}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="wallet-debit-desc">Description</Label>
              <Textarea
                id="wallet-debit-desc"
                placeholder="Reason for debit"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDebitOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => void performTransaction("debit")} disabled={submitting}>
              {submitting ? "Processing..." : "Debit wallet"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <UserBalanceReconcileDialog
        userId={selectedUser?.id ?? null}
        open={reconcileOpen}
        onOpenChange={setReconcileOpen}
        onReconciled={() => void loadWallets(true)}
      />
    </SidebarProvider>
  );
}
