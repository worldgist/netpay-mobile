import { useState, useEffect, useMemo, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Search, DollarSign, Ban, CheckCircle, Users as UsersIcon, CalendarDays, CalendarRange, Calendar, Printer, Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { formatNaira } from "@/lib/currency";
import { balancesMatch, fetchUserLedgerBalance } from "@/lib/ledger-balance";
import { UserBalanceReconcileDialog } from "@/components/UserBalanceReconcileDialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface UserProfile {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  balance: number;
  status: string;
  created_at: string;
}

interface Transaction {
  id: string;
  transaction_type: string;
  amount: number;
  balance_before: number;
  balance_after: number;
  description: string | null;
  reference: string | null;
  created_at: string;
}

export default function Users() {
  const [searchQuery, setSearchQuery] = useState("");
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [ledgerBalances, setLedgerBalances] = useState<Record<string, number>>({});
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [userTransactions, setUserTransactions] = useState<Transaction[]>([]);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [isStatementPreviewOpen, setIsStatementPreviewOpen] = useState(false);
  const [isCreditDialogOpen, setIsCreditDialogOpen] = useState(false);
  const [isDebitDialogOpen, setIsDebitDialogOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [reconcileDialogOpen, setReconcileDialogOpen] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const { toast } = useToast();

  useEffect(() => {
    fetchUsers();
  }, []);

  const getLedgerBalance = (user: UserProfile) => ledgerBalances[user.id] ?? user.balance;

  const loadLedgerBalances = async (userList: UserProfile[]) => {
    const entries = await Promise.all(
      userList.map(async (user) => {
        const balance = await fetchUserLedgerBalance(supabase, user.id, user.balance);
        return [user.id, balance] as const;
      }),
    );
    setLedgerBalances(Object.fromEntries(entries));
  };

  const refreshUserLedgerBalance = async (userId: string, fallback = 0) => {
    const balance = await fetchUserLedgerBalance(supabase, userId, fallback);
    setLedgerBalances((prev) => ({ ...prev, [userId]: balance }));
    return balance;
  };

  const fetchUsers = async () => {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      toast({
        title: "Error",
        description: "Failed to fetch users",
        variant: "destructive",
      });
      return;
    }

    setUsers(data || []);
    void loadLedgerBalances(data || []);
  };

  const fetchUserTransactions = async (userId: string) => {
    const { data, error } = await supabase
      .from("user_transactions")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) {
      toast({
        title: "Error",
        description: "Failed to fetch transactions",
        variant: "destructive",
      });
      return;
    }

    setUserTransactions(data || []);
  };

  const handlePrintUserTransactions = () => {
    if (!selectedUser) return;

    const rowsHtml =
      userTransactions.length === 0
        ? `<tr><td colspan="5" style="text-align:center;padding:12px;color:#6b7280;">No transactions found</td></tr>`
        : userTransactions
            .map((tx) => {
              const amount = Number(tx.amount || 0).toFixed(2);
              const balanceAfter = Number(tx.balance_after || 0).toFixed(2);
              const txType = tx.transaction_type || "N/A";
              const txDate = new Date(tx.created_at).toLocaleString();
              const txDescription = tx.description || "-";
              const txReference = tx.reference || "-";

              return `
                <tr>
                  <td style="padding:10px;border-bottom:1px solid #e5e7eb;">${txDate}</td>
                  <td style="padding:10px;border-bottom:1px solid #e5e7eb;">${txType}</td>
                  <td style="padding:10px;border-bottom:1px solid #e5e7eb;">${txDescription}<br/><span style="font-size:12px;color:#6b7280;">Ref: ${txReference}</span></td>
                  <td style="padding:10px;border-bottom:1px solid #e5e7eb;text-align:right;">₦${amount}</td>
                  <td style="padding:10px;border-bottom:1px solid #e5e7eb;text-align:right;">₦${balanceAfter}</td>
                </tr>
              `;
            })
            .join("");

    const printWindow = window.open("", "_blank", "width=1000,height=800");
    if (!printWindow) {
      toast({
        title: "Popup Blocked",
        description: "Allow popups to print user transactions.",
        variant: "destructive",
      });
      return;
    }

    const joinedAt = new Date(selectedUser.created_at).toLocaleString();
    const printedAt = new Date().toLocaleString();
    const ledgerBalance = getLedgerBalance(selectedUser);

    printWindow.document.write(`
      <!doctype html>
      <html>
        <head>
          <title>User Transactions - ${selectedUser.full_name || selectedUser.email || selectedUser.id}</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 24px; color: #111827; }
            h1 { margin: 0 0 8px; }
            .meta { margin-bottom: 16px; line-height: 1.5; }
            table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 14px; }
            th { text-align: left; background: #f3f4f6; padding: 10px; border-bottom: 2px solid #d1d5db; }
            .right { text-align: right; }
            .footer { margin-top: 16px; color: #6b7280; font-size: 12px; }
          </style>
        </head>
        <body>
          <h1>User Transactions Statement</h1>
          <div class="meta">
            <strong>Name:</strong> ${selectedUser.full_name || "N/A"}<br/>
            <strong>Email:</strong> ${selectedUser.email || "N/A"}<br/>
            <strong>User ID:</strong> ${selectedUser.id}<br/>
            <strong>Joined:</strong> ${joinedAt}<br/>
            <strong>Current Balance (Ledger):</strong> ₦${ledgerBalance.toFixed(2)}<br/>
            <strong>Total Transactions Listed:</strong> ${userTransactions.length}
          </div>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Description / Reference</th>
                <th class="right">Amount</th>
                <th class="right">Balance After</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>
          <div class="footer">Generated by NetPay Admin on ${printedAt}</div>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  const handleExportUserTransactionsCsv = () => {
    if (!selectedUser) return;

    const escapeCsv = (value: string | number | null | undefined) => {
      const str = value == null ? "" : String(value);
      const escaped = str.replace(/"/g, '""');
      return `"${escaped}"`;
    };

    const rows = userTransactions.map((tx) => [
      new Date(tx.created_at).toLocaleString(),
      tx.transaction_type || "",
      tx.description || "",
      tx.reference || "",
      Number(tx.amount || 0).toFixed(2),
      Number(tx.balance_before || 0).toFixed(2),
      Number(tx.balance_after || 0).toFixed(2),
    ]);

    const header = [
      "Date",
      "Type",
      "Description",
      "Reference",
      "Amount",
      "Balance Before",
      "Balance After",
    ];

    const csv = [
      header.map(escapeCsv).join(","),
      ...rows.map((row) => row.map(escapeCsv).join(",")),
    ].join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    const name = (selectedUser.full_name || selectedUser.email || selectedUser.id).replace(/\s+/g, "_");
    a.href = url;
    a.download = `user-transactions-${name}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const handleViewUser = async (user: UserProfile, openReconcile = false) => {
    setSelectedUser(user);
    await Promise.all([
      fetchUserTransactions(user.id),
      refreshUserLedgerBalance(user.id, user.balance),
    ]);
    setIsViewDialogOpen(true);
    if (openReconcile) {
      setReconcileDialogOpen(true);
    }
  };

  const openUserFromQuery = useCallback(async () => {
    const userId = searchParams.get("userId");
    if (!userId || users.length === 0) return;

    const user = users.find((entry) => entry.id === userId);
    if (!user) return;

    const openReconcile = searchParams.get("reconcile") === "1";
    await handleViewUser(user, openReconcile);

    const next = new URLSearchParams(searchParams);
    next.delete("userId");
    next.delete("reconcile");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams, users]);

  useEffect(() => {
    void openUserFromQuery();
  }, [openUserFromQuery]);

  const handleOpenStatementPreview = () => {
    if (!selectedUser) return;
    setIsStatementPreviewOpen(true);
  };

  const handleCreditUser = (user: UserProfile) => {
    setSelectedUser(user);
    setAmount("");
    setDescription("");
    void refreshUserLedgerBalance(user.id, user.balance);
    setIsCreditDialogOpen(true);
  };

  const handleDebitUser = (user: UserProfile) => {
    setSelectedUser(user);
    setAmount("");
    setDescription("");
    void refreshUserLedgerBalance(user.id, user.balance);
    setIsDebitDialogOpen(true);
  };

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

    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        toast({
          title: "Error",
          description: "You must be logged in",
          variant: "destructive",
        });
        return;
      }

      const functionName = type === "credit" ? "credit-user" : "debit-user";
      
      const { data, error } = await supabase.functions.invoke(functionName, {
        body: {
          userId: selectedUser.id,
          amount: amountValue,
          description: description || null,
        },
      });

      if (error) {
        throw error;
      }

      if (!data.success) {
        throw new Error(data.error || `Failed to ${type} user`);
      }

      toast({
        title: "Success",
        description: `User ${type === "credit" ? "credited" : "debited"} successfully`,
      });

      setIsCreditDialogOpen(false);
      setIsDebitDialogOpen(false);
      setAmount("");
      setDescription("");
      await fetchUsers();
      if (selectedUser && data?.data?.balanceAfter != null) {
        setLedgerBalances((prev) => ({
          ...prev,
          [selectedUser.id]: Number(data.data.balanceAfter),
        }));
      }
    } catch (error) {
      console.error(`${type} error:`, error);
      toast({
        title: "Error",
        description: error.message || `Failed to ${type} user`,
        variant: "destructive",
      });
    }
  };

  const handleSuspendUser = async (user: UserProfile) => {
    try {
      const newStatus = user.status === "suspended" ? "active" : "suspended";

      const { data, error } = await supabase.functions.invoke('suspend-user', {
        body: {
          userId: user.id,
          status: newStatus,
        },
      });

      if (error) {
        throw error;
      }

      if (!data.success) {
        throw new Error(data.error || 'Failed to update user status');
      }

      toast({
        title: "Success",
        description: `User ${newStatus === "suspended" ? "suspended" : "activated"} successfully`,
      });

      fetchUsers();
    } catch (error: any) {
      console.error('Suspend user error:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to update user status",
        variant: "destructive",
      });
    }
  };

  const filteredUsers = users.filter(
    (user) =>
      user.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.email?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const userJoinStats = useMemo(() => {
    const now = new Date();
    const weekAgo = new Date(now);
    weekAgo.setDate(now.getDate() - 7);

    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const yearStart = new Date(now.getFullYear(), 0, 1);

    let weekly = 0;
    let monthly = 0;
    let yearly = 0;

    for (const user of users) {
      if (!user.created_at) continue;
      const joinedAt = new Date(user.created_at);
      if (Number.isNaN(joinedAt.getTime())) continue;

      if (joinedAt >= weekAgo) weekly += 1;
      if (joinedAt >= monthStart) monthly += 1;
      if (joinedAt >= yearStart) yearly += 1;
    }

    return {
      total: users.length,
      weekly,
      monthly,
      yearly,
    };
  }, [users]);

  const selectedUserMetrics = useMemo(() => {
    const credits = userTransactions
      .filter((tx) => tx.transaction_type === "credit")
      .reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
    const debits = userTransactions
      .filter((tx) => tx.transaction_type === "debit")
      .reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
    const net = credits - debits;

    return {
      credits,
      debits,
      net,
      count: userTransactions.length,
    };
  }, [userTransactions]);

  const selectedUserLedgerBalance = selectedUser ? getLedgerBalance(selectedUser) : 0;
  const selectedUserHasBalanceDrift =
    selectedUser != null && !balancesMatch(selectedUserLedgerBalance, selectedUser.balance);

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        <main className="flex-1 overflow-auto">
          <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <div className="flex h-16 items-center gap-4 px-6">
              <SidebarTrigger />
              <h1 className="text-2xl font-bold">Users Management</h1>
            </div>
          </header>

          <div className="p-6 space-y-6">
            <div className="flex items-center justify-between">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                <Input
                  placeholder="Search users..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Users</CardTitle>
                  <UsersIcon className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{userJoinStats.total}</div>
                  <p className="text-xs text-muted-foreground">All registered users</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Joined This Week</CardTitle>
                  <CalendarDays className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{userJoinStats.weekly}</div>
                  <p className="text-xs text-muted-foreground">Last 7 days</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Joined This Month</CardTitle>
                  <CalendarRange className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{userJoinStats.monthly}</div>
                  <p className="text-xs text-muted-foreground">Since month start</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Joined This Year</CardTitle>
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{userJoinStats.yearly}</div>
                  <p className="text-xs text-muted-foreground">Since year start</p>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>All Users</CardTitle>
                <CardDescription>Manage and monitor user accounts</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>Ledger Balance</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredUsers.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground">
                          No users found
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredUsers.map((user) => (
                        <TableRow key={user.id}>
                          <TableCell className="font-medium">
                            {user.full_name || "N/A"}
                          </TableCell>
                          <TableCell>{user.email || "N/A"}</TableCell>
                          <TableCell>{user.phone || "N/A"}</TableCell>
                          <TableCell className="font-semibold">
                            <div>₦{getLedgerBalance(user).toFixed(2)}</div>
                            {!balancesMatch(getLedgerBalance(user), user.balance) && (
                              <p className="text-xs text-amber-600 font-normal">
                                Cache: ₦{user.balance.toFixed(2)}
                              </p>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge 
                              variant={
                                user.status === "active" 
                                  ? "default" 
                                  : user.status === "suspended" 
                                  ? "destructive" 
                                  : "secondary"
                              }
                            >
                              {user.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleViewUser(user)}
                            >
                              View Details
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </main>
      </div>

      {/* View User Details Dialog */}
      <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
        <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>User Details</DialogTitle>
            <DialogDescription>Complete user information and transaction history</DialogDescription>
          </DialogHeader>
          {selectedUser && (
            <div className="space-y-6">
              {selectedUserHasBalanceDrift && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <span>
                      Profile cache ({formatNaira(selectedUser.balance)}) differs from ledger (
                      {formatNaira(selectedUserLedgerBalance)}). Cache should auto-sync on the next ledger entry or admin view.
                    </span>
                    <Button
                      variant="secondary"
                      size="sm"
                      className="gap-2 shrink-0"
                      onClick={() => setReconcileDialogOpen(true)}
                    >
                      View balance detail
                    </Button>
                  </AlertDescription>
                </Alert>
              )}

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div>
                  <Label className="text-muted-foreground">Full Name</Label>
                  <p className="font-medium">{selectedUser.full_name || "N/A"}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Email</Label>
                  <p className="font-medium">{selectedUser.email || "N/A"}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Phone</Label>
                  <p className="font-medium">{selectedUser.phone || "N/A"}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Status</Label>
                  <div className="mt-1">
                    <Badge variant={selectedUser.status === "active" ? "default" : "destructive"}>
                      {selectedUser.status}
                    </Badge>
                  </div>
                </div>
                <div>
                  <Label className="text-muted-foreground">Ledger Balance</Label>
                  <p className="font-semibold text-lg">₦{selectedUserLedgerBalance.toFixed(2)}</p>
                  {selectedUserHasBalanceDrift && (
                    <p className="text-xs text-amber-600 mt-1">
                      Profile cache: ₦{selectedUser.balance.toFixed(2)}
                    </p>
                  )}
                </div>
                <div>
                  <Label className="text-muted-foreground">Joined</Label>
                  <p className="font-medium">
                    {new Date(selectedUser.created_at).toLocaleDateString()}
                  </p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Joined Time</Label>
                  <p className="font-medium">
                    {new Date(selectedUser.created_at).toLocaleTimeString()}
                  </p>
                </div>
                <div className="sm:col-span-2 lg:col-span-3">
                  <Label className="text-muted-foreground">User ID</Label>
                  <p className="font-mono text-xs break-all">{selectedUser.id}</p>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Recent Tx Count</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-xl font-bold">{selectedUserMetrics.count}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Credits (Recent)</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-xl font-bold text-green-600">₦{selectedUserMetrics.credits.toFixed(2)}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Debits (Recent)</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-xl font-bold text-red-600">₦{selectedUserMetrics.debits.toFixed(2)}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Net Flow (Recent)</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className={`text-xl font-bold ${selectedUserMetrics.net >= 0 ? "text-green-600" : "text-red-600"}`}>
                      ₦{selectedUserMetrics.net.toFixed(2)}
                    </p>
                  </CardContent>
                </Card>
              </div>

              <div>
                <Label className="text-lg font-semibold">Recent Transactions</Label>
                <div className="mt-3 space-y-2">
                  {userTransactions.length === 0 ? (
                    <p className="text-muted-foreground text-sm">No transactions yet</p>
                  ) : (
                    userTransactions.map((tx) => (
                      <div
                        key={tx.id}
                        className="flex items-center justify-between p-3 border rounded-lg"
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <Badge
                              variant={
                                tx.transaction_type === "credit"
                                  ? "default"
                                  : tx.transaction_type === "debit"
                                  ? "destructive"
                                  : "secondary"
                              }
                            >
                              {tx.transaction_type}
                            </Badge>
                            <span className="text-sm text-muted-foreground">
                              {new Date(tx.created_at).toLocaleString()}
                            </span>
                          </div>
                          {tx.description && (
                            <p className="text-sm mt-1">{tx.description}</p>
                          )}
                          {tx.reference && (
                            <p className="text-xs text-muted-foreground mt-1">
                              Ref: {tx.reference}
                            </p>
                          )}
                        </div>
                        <div className="text-right">
                          <p
                            className={`font-semibold ${
                              tx.transaction_type === "credit"
                                ? "text-green-600"
                                : "text-red-600"
                            }`}
                          >
                            {tx.transaction_type === "credit" ? "+" : "-"}₦
                            {tx.amount.toFixed(2)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Balance: ₦{tx.balance_after.toFixed(2)}
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
          <DialogFooter className="flex flex-col sm:flex-row gap-2">
            <div className="flex gap-2 flex-1">
              <Button
                variant="outline"
                onClick={handleOpenStatementPreview}
                className="flex-1"
                disabled={!selectedUser}
              >
                <Printer className="h-4 w-4 mr-2" />
                Print Transactions
              </Button>
              <Button
                variant="outline"
                onClick={handleOpenStatementPreview}
                className="flex-1"
                disabled={!selectedUser}
              >
                <Download className="h-4 w-4 mr-2" />
                Export CSV
              </Button>
              <Button
                variant="default"
                onClick={() => {
                  setIsViewDialogOpen(false);
                  handleCreditUser(selectedUser!);
                }}
                className="flex-1"
              >
                <DollarSign className="h-4 w-4 mr-2" />
                Credit User
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  setIsViewDialogOpen(false);
                  handleDebitUser(selectedUser!);
                }}
                className="flex-1"
              >
                <DollarSign className="h-4 w-4 mr-2" />
                Debit User
              </Button>
              <Button
                variant={selectedUser?.status === "suspended" ? "default" : "destructive"}
                onClick={() => {
                  if (selectedUser) {
                    handleSuspendUser(selectedUser);
                    setIsViewDialogOpen(false);
                  }
                }}
                className="flex-1"
              >
                {selectedUser?.status === "suspended" ? (
                  <>
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Activate
                  </>
                ) : (
                  <>
                    <Ban className="h-4 w-4 mr-2" />
                    Suspend
                  </>
                )}
              </Button>
            </div>
            <Button variant="outline" onClick={() => setIsViewDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isStatementPreviewOpen} onOpenChange={setIsStatementPreviewOpen}>
        <DialogContent className="sm:max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Transaction Statement Preview</DialogTitle>
            <DialogDescription>
              Review this user's transaction statement before printing or downloading.
            </DialogDescription>
          </DialogHeader>

          {selectedUser && (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <div>
                  <Label className="text-muted-foreground">Name</Label>
                  <p className="font-medium">{selectedUser.full_name || "N/A"}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Email</Label>
                  <p className="font-medium">{selectedUser.email || "N/A"}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Ledger Balance</Label>
                  <p className="font-semibold">₦{selectedUserLedgerBalance.toFixed(2)}</p>
                  {selectedUserHasBalanceDrift && (
                    <p className="text-xs text-amber-600 mt-1">
                      Profile cache: ₦{Number(selectedUser.balance || 0).toFixed(2)}
                    </p>
                  )}
                </div>
                <div className="sm:col-span-2 lg:col-span-3">
                  <Label className="text-muted-foreground">User ID</Label>
                  <p className="font-mono text-xs break-all">{selectedUser.id}</p>
                </div>
              </div>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Transactions ({userTransactions.length})</CardTitle>
                </CardHeader>
                <CardContent>
                  {userTransactions.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No transactions found for this user.</p>
                  ) : (
                    <div className="max-h-[420px] overflow-auto rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Date</TableHead>
                            <TableHead>Type</TableHead>
                            <TableHead>Description / Reference</TableHead>
                            <TableHead className="text-right">Amount</TableHead>
                            <TableHead className="text-right">Balance After</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {userTransactions.map((tx) => (
                            <TableRow key={tx.id}>
                              <TableCell>{new Date(tx.created_at).toLocaleString()}</TableCell>
                              <TableCell>
                                <Badge
                                  variant={
                                    tx.transaction_type === "credit"
                                      ? "default"
                                      : tx.transaction_type === "debit"
                                      ? "destructive"
                                      : "secondary"
                                  }
                                >
                                  {tx.transaction_type}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <div className="text-sm">
                                  <p>{tx.description || "-"}</p>
                                  <p className="text-xs text-muted-foreground">Ref: {tx.reference || "-"}</p>
                                </div>
                              </TableCell>
                              <TableCell className="text-right">₦{Number(tx.amount || 0).toFixed(2)}</TableCell>
                              <TableCell className="text-right">₦{Number(tx.balance_after || 0).toFixed(2)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          <DialogFooter className="flex flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setIsStatementPreviewOpen(false)}>
              Close Preview
            </Button>
            <Button variant="outline" onClick={handleExportUserTransactionsCsv} disabled={!selectedUser}>
              <Download className="h-4 w-4 mr-2" />
              Download CSV
            </Button>
            <Button onClick={handlePrintUserTransactions} disabled={!selectedUser}>
              <Printer className="h-4 w-4 mr-2" />
              Print Now
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Credit User Dialog */}
      <Dialog open={isCreditDialogOpen} onOpenChange={setIsCreditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Credit User</DialogTitle>
            <DialogDescription>
              Add funds to {selectedUser?.full_name || selectedUser?.email}'s account
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-muted-foreground">Ledger Balance</Label>
              <p className="font-semibold text-lg">₦{selectedUserLedgerBalance.toFixed(2)}</p>
              {selectedUserHasBalanceDrift && selectedUser && (
                <p className="text-xs text-amber-600 mt-1">
                  Profile cache: ₦{selectedUser.balance.toFixed(2)}
                </p>
              )}
            </div>
            <div>
              <Label htmlFor="credit-amount">Amount (₦)</Label>
              <Input
                id="credit-amount"
                type="number"
                step="0.01"
                min="0.01"
                placeholder="Enter amount"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="credit-description">Description (Optional)</Label>
              <Textarea
                id="credit-description"
                placeholder="Reason for credit"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsCreditDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button onClick={() => performTransaction("credit")}>
              Credit Account
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Debit User Dialog */}
      <Dialog open={isDebitDialogOpen} onOpenChange={setIsDebitDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Debit User</DialogTitle>
            <DialogDescription>
              Deduct funds from {selectedUser?.full_name || selectedUser?.email}'s account
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-muted-foreground">Ledger Balance</Label>
              <p className="font-semibold text-lg">₦{selectedUserLedgerBalance.toFixed(2)}</p>
              {selectedUserHasBalanceDrift && selectedUser && (
                <p className="text-xs text-amber-600 mt-1">
                  Profile cache: ₦{selectedUser.balance.toFixed(2)}
                </p>
              )}
            </div>
            <div>
              <Label htmlFor="debit-amount">Amount (₦)</Label>
              <Input
                id="debit-amount"
                type="number"
                step="0.01"
                min="0.01"
                max={selectedUserLedgerBalance}
                placeholder="Enter amount"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="debit-description">Description (Optional)</Label>
              <Textarea
                id="debit-description"
                placeholder="Reason for debit"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsDebitDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => performTransaction("debit")}
            >
              Debit Account
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <UserBalanceReconcileDialog
        userId={selectedUser?.id ?? null}
        open={reconcileDialogOpen}
        onOpenChange={setReconcileDialogOpen}
        onReconciled={async () => {
          await fetchUsers();
          if (selectedUser) {
            await refreshUserLedgerBalance(selectedUser.id, selectedUser.balance);
          }
        }}
      />
    </SidebarProvider>
  );
}
